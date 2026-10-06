#!/usr/bin/env python3
"""Single integration suite registry, isolated DB by default; never alters an existing shop.

CI uses --existing-database only for its already-disposable database. Local runs
create and remove their own database inside the explicitly selected container.
SIGINT lets the Rust server flush its metrics and optional LLVM coverage profile.
"""
import argparse
import json
import os
import socket
import subprocess
import sys
import urllib.parse
import uuid

from testing.runtime import ROOT, run, serve, stop

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--container", default="vendune-postgres-1")
parser.add_argument("--existing-database", action="store_true")
parser.add_argument("--only", nargs="+", help="Run selected registered HTTP/provider/browser/tooling suites in an isolated database")
args = parser.parse_args()
env = dict(os.environ)
if not env.get("DATABASE_URL"):
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            env["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"\'')
url = urllib.parse.urlsplit(env["DATABASE_URL"])
name = url.path[1:] if args.existing_database else "commerce_quality_" + uuid.uuid4().hex
user = url.username or "commerce"


def sql(statement):
    subprocess.run(
        ["docker", "exec", "-i", args.container, "psql", "-U", user,
         "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
        input=statement, text=True, check=True, stdout=subprocess.DEVNULL,
    )


if not args.existing_database:
    sql(f'CREATE DATABASE "{name}";')
with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
env.update({
    "DATABASE_URL": urllib.parse.urlunsplit(url._replace(path="/" + name)),
    "DB_CONTAINER": args.container, "TEST_DB_CONTAINER": args.container,
    "TEST_DATABASE": name,
    "BASE_URL": f"http://127.0.0.1:{port}",
    "BIND_ADDR": f"127.0.0.1:{port}",
    "MERCHANT_TOKEN": "quality-only-synthetic-bootstrap-credential",
    "APP_SERVICES": "{}", "SEED_DEMO": "true", "PROCESS_ROLE": "all",
    # Existing differential cases intentionally use the versioned furniture fixture.
    # The fashion_demo provider suite starts a separate server with the shipping default.
    "DEMO_CATALOG": "legacy-furniture",
    "COMMERCE_PUBLIC_ORIGIN": "https://studio.example.test",
    "OLLAMA_URL": "http://127.0.0.1:1", "TEST_PERSONAL": "1",
    "PLATFORM_SECRET_KEY": "07"*32, "INFERENCE_ALLOW_LOOPBACK": "true",
    "SHOP_DOMAIN_SUFFIX": "vendune.ai",
})
for key in ("LIVE_STUDIO", "LIVE_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
    env.pop(key, None)
suites = json.loads((ROOT / "scripts/testing/suites.json").read_text())
if args.only:
    assert set(args.only) <= {s for group in suites.values() for s in group}, "Only registered suites can be selected"
    suites = {group: [s for s in names if s in args.only] for group, names in suites.items()}
logs = ROOT / "artifacts"
logs.mkdir(exist_ok=True)
try:
    with (logs / "integration-server.log").open("w") as log:
        server = serve(env, env["BASE_URL"], log)
        try:
            for suite in suites["http"]:
                if suite == "translations":
                    continue
                command = [sys.executable, f"scripts/{suite}.py"]
                if suite == "scalability":
                    command += ["--container", args.container]
                run(command, env)
        finally:
            stop(server)
    if "translations" in suites["http"]:
        run([sys.executable, "scripts/translations.py"], env)
    for suite in suites["providers"]:
        run([sys.executable, f"scripts/{suite}.py"], env)
    for suite in suites["browser_contracts"]:
        run(["node", f"frontend/tests/{suite}.mjs"], env)
    for suite in suites.get("tooling", []):
        run([sys.executable, f"scripts/{suite}.py"], env)
    run([sys.executable, "scripts/structure.py"], env)
    print("PASS selected HTTP suites plus provider, browser-contract and tooling checks" if args.only else "PASS all registered integration and browser-contract suites")
finally:
    if not args.existing_database:
        sql(f'DROP DATABASE "{name}" WITH (FORCE);')
