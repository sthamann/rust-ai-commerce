#!/usr/bin/env python3
"""Start the local connector apps with private generated keys; preserve all existing app services."""

import json, os, pathlib, signal, subprocess, sys, time, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".run"
STATE = RUNTIME / "connector-env.json"
PID = RUNTIME / "connector.pid"
SERVER = ROOT / "target/debug/connectors"



def configuration():
    import secrets, base64

    RUNTIME.mkdir(exist_ok=True)
    if not STATE.exists():
        values = {
            "CONNECTOR_SECRET_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
            "CONNECTOR_GATEWAY_TOKEN": secrets.token_hex(32),
            "CONNECTOR_PUBLIC_URL": "http://127.0.0.1:8797",
            "CONNECTOR_PORT": "8797",
        }
        fd = os.open(STATE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(values, f)
    values = json.loads(STATE.read_text())
    services = {
        a: {
            "url": values["CONNECTOR_PUBLIC_URL"] + "/" + a,
            "token": values["CONNECTOR_GATEWAY_TOKEN"],
        }
        for a in ["gmail", "google_analytics", "slack", "email"]
    }
    path = RUNTIME / "connector-services.json"
    existing = json.loads(path.read_text()) if path.exists() else {}
    existing.update(services)
    path.write_text(json.dumps(existing))
    path.chmod(0o600)
    return values


def owned():
    if not PID.exists():
        return None
    pid = int(PID.read_text())
    command = subprocess.run(
        ["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True
    ).stdout
    legacy_server = ROOT / "extensions/services/connectors/server.py"
    return pid if str(SERVER) in command or str(legacy_server) in command else None


def start():
    if owned():
        print("Owned connector is running; stop it before a legacy migration or runtime upgrade")
        return
    values = configuration()
    operator = {}
    if (ROOT / ".env").exists():
        raw = subprocess.check_output(
            ["/bin/bash", "-c", "set -a; source .env; env -0"], cwd=ROOT
        )
        operator = dict(x.decode().split("=", 1) for x in raw.split(b"\0") if b"=" in x)
    subprocess.run(["cargo", "build", "--locked", "--bin", "connectors"], cwd=ROOT, check=True)
    env = {
        **os.environ,
        **values,
        **{
            k: v
            for k, v in operator.items()
            if k.startswith(("GOOGLE_CLIENT_", "SLACK_CLIENT_", "EMAIL_SMTP_", "EMAIL_TLS_", "CONNECTOR_TENANT_", "CONNECTOR_WORKERS_", "CONNECTOR_DATABASE_URL", "DATABASE_URL"))
        },
    }
    legacy = pathlib.Path(values.get("CONNECTOR_DATABASE", RUNTIME / "connector-state.sqlite"))
    if legacy.exists() and legacy.stat().st_size and not (RUNTIME / "connector-migrated").exists():
        raise RuntimeError("Legacy SQLite exists: stop the old service, run scripts/migrate_connector_state.py, and retain its backup")
    log = open(RUNTIME / "connectors.log", "a")
    p = subprocess.Popen(
        [str(SERVER)],
        cwd=ROOT,
        env=env,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    PID.write_text(str(p.pid))
    for _ in range(100):
        if p.poll() is not None: raise RuntimeError("Connector startup failed; inspect .run/connectors.log")
        try:
            urllib.request.urlopen("http://127.0.0.1:" + values["CONNECTOR_PORT"] + "/health", timeout=1).close()
            break
        except OSError: time.sleep(0.1)
    else: raise RuntimeError("Connector health check timed out")
    print("Connector app service ready on loopback port " + values["CONNECTOR_PORT"])


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "status"
    if mode == "start":
        start()
    elif mode == "init":
        configuration()
        print("Private connector keys and app-service configuration prepared")
    elif mode == "stop":
        pid = owned()
        if pid:
            os.kill(pid, signal.SIGTERM)
        print("Owned connector process stopped")
    elif mode == "status":
        print(
            "Connector app service running"
            if owned()
            else "Connector app service stopped"
        )
    else:
        raise SystemExit("Usage: connectors.py init|start|stop|status")
