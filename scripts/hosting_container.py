#!/usr/bin/env python3
"""Smoke-test the built deployment image against an isolated database on the local Compose network."""

import json, os, pathlib, subprocess, time, urllib.request, urllib.error, urllib.parse, uuid

root = pathlib.Path(__file__).resolve().parents[1]
tag = os.getenv("COMMERCE_TEST_IMAGE", "vendune:platform")
db_container = os.getenv("DB_CONTAINER", "vendune-postgres-1")
name = "host_image_" + uuid.uuid4().hex[:12]
container = "rac-image-test-" + uuid.uuid4().hex[:10]
envfile = root / ".run" / ("image-" + name + ".env")
envfile.parent.mkdir(exist_ok=True)


def command(args, **kwargs):
    return subprocess.run(
        args, capture_output=True, text=True, check=True, **kwargs
    ).stdout.strip()


def sql(text, database="postgres"):
    return command(
        [
            "docker",
            "exec",
            "-i",
            db_container,
            "psql",
            "-XqAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "commerce",
            "-d",
            database,
        ],
        input=text,
    )


u = urllib.parse.urlsplit(os.environ["DATABASE_URL"])
network = next(
    iter(
        json.loads(
            command(
                [
                    "docker",
                    "inspect",
                    db_container,
                    "--format",
                    "{{json .NetworkSettings.Networks}}",
                ]
            )
        )
    )
)
netloc = u.netloc.rsplit("@", 1)[0] + "@" + db_container + ":5432"
url = urllib.parse.urlunsplit(u._replace(netloc=netloc, path="/" + name))
email = name + "@example.test"
password = uuid.uuid4().hex + "!"
values = {
    "DATABASE_URL": url,
    "MERCHANT_TOKEN": uuid.uuid4().hex + uuid.uuid4().hex,
    "BOOTSTRAP_MODE": "migrate",
    "SEED_DEMO": "false",
    "ALLOW_PUBLIC_SIGNUP": "false",
    "ALLOW_BOOTSTRAP_AUTH": "false",
    "PLATFORM_ADMIN_EMAIL": email,
    "PLATFORM_ADMIN_PASSWORD": password,
    "PLATFORM_ADMIN_NAME": "Image Operator",
    "BIND_ADDR": "0.0.0.0:8787",
    "OLLAMA_URL": "http://127.0.0.1:1",
    "APP_SERVICES": "{}",
}
fd = os.open(envfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as f:
    f.write("".join(k + "=" + v + "\n" for k, v in values.items()))
started = False
try:
    sql("CREATE DATABASE " + name)
    command(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            network,
            "--env-file",
            str(envfile),
            tag,
            "/app/vendune",
            "--bootstrap-operator",
        ]
    )
    values["BOOTSTRAP_MODE"] = "serve"
    values.pop("PLATFORM_ADMIN_PASSWORD")
    envfile.write_text("".join(k + "=" + v + "\n" for k, v in values.items()))
    command(
        [
            "docker",
            "run",
            "-d",
            "--name",
            container,
            "--network",
            network,
            "--env-file",
            str(envfile),
            "-p",
            "127.0.0.1:8793:8787",
            tag,
        ]
    )
    started = True

    def req(path, body=None, token="", expected=200, raw=False, tenant=None):
        request = urllib.request.Request(
            "http://127.0.0.1:8793" + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                **({"Authorization": "Bearer " + token} if token else {}),
                **({"x-tenant": tenant} if tenant else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as r:
                status = r.status
                data = r.read().decode() if raw else json.load(r)
        except urllib.error.HTTPError as e:
            status = e.code
            data = json.load(e)
        assert status == expected, (path, status, expected)
        return data

    for _ in range(90):
        try:
            req("/health")
            break
        except OSError:
            time.sleep(0.5)
    else:
        raise RuntimeError("Built image health check did not become ready")
    assert '<div id="root">' in req("/", raw=True)
    req("/api/auth/register", {}, expected=403)
    req("/api/merchant/overview", token=values["MERCHANT_TOKEN"], expected=401)
    req("/api/platform/overview", expected=401)
    session = req("/api/auth/login", {"email": email, "password": password})
    assert (
        req("/api/platform/session", token=session["token"])["user"]["name"]
        == "Image Operator"
    )
    req(
        "/api/platform/shops",
        {"id": "image-shop", "name": "Image Shop", "seedCatalog": True},
        session["token"],
    )
    assert sql("SELECT count(*) FROM customers WHERE tenant='image-shop'", name) == "0"
    assert (
        len(req("/store-api/product", {}, tenant="image-shop")["elements"]) == 6
    )  # Newly provisioned shop serves its actual sample catalogue.
    assert command(["docker", "exec", container, "id", "-u"]) == "10001"
    print(
        "PASS built deployment image: non-root Rust, bundled frontend, real AGE PostgreSQL startup, personal operator login/provisioning, closed signup/bootstrap, no demo customers"
    )
finally:
    if started:
        subprocess.run(["docker", "rm", "-f", container], capture_output=True)
    sql(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='"
        + name
        + "' AND pid<>pg_backend_pid(); DROP DATABASE "
        + name
    )
    envfile.unlink(missing_ok=True)
