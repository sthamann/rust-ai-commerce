#!/usr/bin/env python3
"""Isolated production-mode bootstrap test. Creates/drops only a uniquely named synthetic database."""

import json, os, pathlib, secrets, subprocess, time, urllib.error, urllib.parse, urllib.request, uuid
from testing.database import psql

root = pathlib.Path(__file__).resolve().parents[1]
name = "platform_setup_" + uuid.uuid4().hex[:12]
container = os.getenv("DB_CONTAINER", "vendune-postgres-1")
checks = []


def sql(text, database="postgres"):
    return subprocess.run(
        psql(container, "commerce", database, "-XqAt", "-v", "ON_ERROR_STOP=1"),
        input=text,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def check(message):
    checks.append(message)
    print("PASS", message)


env = dict(os.environ)
u = urllib.parse.urlsplit(env["DATABASE_URL"])
env["DATABASE_URL"] = urllib.parse.urlunsplit(u._replace(path="/" + name))
env.update(
    BOOTSTRAP_MODE="migrate",
    SEED_DEMO="false",
    ALLOW_PUBLIC_SIGNUP="false",
    ALLOW_BOOTSTRAP_AUTH="false",
    PLATFORM_ADMIN_EMAIL="operator-" + uuid.uuid4().hex[:10] + "@example.test",
    PLATFORM_ADMIN_PASSWORD=secrets.token_urlsafe(27),
    PLATFORM_ADMIN_NAME="Synthetic Operator",
    BIND_ADDR="127.0.0.1:8792",
    OLLAMA_URL="http://127.0.0.1:1",
)
legacy_token = env.pop("MERCHANT_TOKEN")
env.pop("PAYPAL_ACCOUNTS", None)
env.pop("OPENAI_API_KEY", None)
env.pop("ANTHROPIC_API_KEY", None)
env["APP_SERVICES"] = "{}"
binary = str(root / "target/debug/vendune")
process = None
try:
    sql("CREATE DATABASE " + name)
    migration_env = {key: value for key, value in env.items() if key not in {
        "SEED_DEMO", "ALLOW_BOOTSTRAP_AUTH", "PLATFORM_ADMIN_EMAIL",
        "PLATFORM_ADMIN_PASSWORD", "PLATFORM_ADMIN_NAME"}}
    for _ in range(2):
        migration = subprocess.run([binary], cwd=root, env=migration_env,
                                   capture_output=True, text=True, timeout=90)
        assert migration.returncode == 0, "Standalone migration job failed"
        assert "Migration-only setup complete" in migration.stdout
    assert sql("SELECT count(*) FROM products", name) == "0"
    assert sql("SELECT count(*) FROM platform_operators", name) == "0"
    assert sql("SELECT count(*) FROM merchant_users", name) == "0"
    check("standalone repeatable migrations require no operator/bootstrap secrets and never seed accounts or products")
    result = subprocess.run(
        [binary, "--bootstrap-operator"],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        timeout=90,
    )
    assert result.returncode == 0, (
        "Offline operator bootstrap failed (no secrets logged)"
    )
    assert env["PLATFORM_ADMIN_PASSWORD"] not in result.stdout + result.stderr
    assert (
        sql("SELECT count(*) FROM customers", name) == "0"
        and sql("SELECT count(*) FROM products", name) == "0"
    )
    assert sql("SELECT count(*) FROM platform_operators WHERE active", name) == "1"
    check(
        "fresh migration-only bootstrap creates a personal Argon2 operator with no demo customers or catalog"
    )
    sql("UPDATE platform_operators SET active=false", name)
    wrong = dict(env, PLATFORM_ADMIN_PASSWORD="Wrong-password-synthetic!")
    result = subprocess.run(
        [binary, "--bootstrap-operator"],
        cwd=root,
        env=wrong,
        capture_output=True,
        text=True,
        timeout=90,
    )
    assert result.returncode != 0
    assert sql("SELECT count(*) FROM platform_operators WHERE active", name) == "0"
    result = subprocess.run(
        [binary, "--bootstrap-operator"],
        cwd=root,
        env=env,
        capture_output=True,
        text=True,
        timeout=90,
    )
    assert result.returncode == 0
    assert sql("SELECT count(*) FROM merchant_users", name) == "1"
    check(
        "repeated setup verifies the existing password, does not reset accounts, and rejects unauthorized grants"
    )
    saved_password = env.pop("PLATFORM_ADMIN_PASSWORD")
    env["BOOTSTRAP_MODE"] = "serve"
    process = subprocess.Popen(
        [binary],
        cwd=root,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = "http://127.0.0.1:8792"

    def req(path, body=None, token="", expected=200):
        request = urllib.request.Request(
            base + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                **({"Authorization": "Bearer " + token} if token else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as r:
                status = r.status
                value = json.load(r)
        except urllib.error.HTTPError as e:
            status = e.code
            value = json.load(e)
        assert status == expected, (path, status, expected)
        return value

    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError("Production test service exited")
        try:
            req("/health")
            break
        except OSError:
            time.sleep(0.2)
    else:
        raise RuntimeError("Production test service did not become healthy")
    req("/api/auth/register", {
        "email": "closed-signup@example.test", "name": "Closed signup",
        "password": "Synthetic-closed-signup-password!", "workspaceId": "closed-signup",
    }, expected=403)
    req("/api/merchant/overview", token=legacy_token, expected=401)
    req("/api/platform/overview", expected=401)
    check(
        "public-mode server closes merchant signup and rejects the instance bootstrap token over HTTP"
    )
    req(
        "/api/auth/login",
        {"email": env["PLATFORM_ADMIN_EMAIL"], "password": "Wrong-password-synthetic!"},
        expected=401,
    )
    personal = req(
        "/api/auth/login",
        {"email": env["PLATFORM_ADMIN_EMAIL"], "password": saved_password},
    )
    assert (
        req("/api/platform/session", token=personal["token"])["user"]["name"]
        == "Synthetic Operator"
    )
    response = req(
        "/api/platform/shops",
        {"id": "public-test-shop", "name": "Public Test Shop", "seedCatalog": True},
        personal["token"],
    )
    assert (
        response["seedCatalog"]
        and sql("SELECT count(*) FROM customers WHERE tenant='public-test-shop'", name)
        == "0"
    )
    check(
        "the bootstrapped account actually signs in and creates a sample shop through the public-mode API"
    )
except Exception:
    raise
finally:
    if process:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    sql(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='"
        + name
        + "' AND pid<>pg_backend_pid(); DROP DATABASE "
        + name
    )
print(
    json.dumps(
        {
            "suite": "platform-setup-v1",
            "passed": len(checks),
            "checks": checks,
            "syntheticData": True,
        },
        indent=2,
    )
)
