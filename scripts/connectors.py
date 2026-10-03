#!/usr/bin/env python3
"""Start the local connector apps with private generated keys; preserve all existing app services."""

import json, os, pathlib, signal, subprocess, sys, time, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".run"
STATE = RUNTIME / "connector-env.json"
PID = RUNTIME / "connector.pid"
SERVER = ROOT / "extensions/services/connectors/server.py"

# The local launcher also works on managed Python installations without global pip.
venv_python = RUNTIME / "connectors-venv/bin/python"
if (
    venv_python.exists()
    and pathlib.Path(sys.prefix).resolve() != venv_python.parent.parent.resolve()
):
    os.execv(str(venv_python), [str(venv_python), *sys.argv])


def configuration():
    from cryptography.fernet import Fernet
    import secrets

    RUNTIME.mkdir(exist_ok=True)
    if not STATE.exists():
        values = {
            "CONNECTOR_SECRET_KEY": Fernet.generate_key().decode(),
            "CONNECTOR_GATEWAY_TOKEN": secrets.token_hex(32),
            "CONNECTOR_DATABASE": str(RUNTIME / "connector-state.sqlite"),
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
        for a in ["gmail", "google_analytics", "slack"]
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
    return pid if str(SERVER) in command else None


def start():
    if owned():
        print("Connector app service is already running")
        return
    values = configuration()
    operator = {}
    if (ROOT / ".env").exists():
        raw = subprocess.check_output(
            ["/bin/bash", "-c", "set -a; source .env; env -0"], cwd=ROOT
        )
        operator = dict(x.decode().split("=", 1) for x in raw.split(b"\0") if b"=" in x)
    env = {
        **os.environ,
        **values,
        **{
            k: v
            for k, v in operator.items()
            if k.startswith(("GOOGLE_CLIENT_", "SLACK_CLIENT_"))
        },
    }
    log = open(RUNTIME / "connectors.log", "a")
    p = subprocess.Popen(
        [sys.executable, str(SERVER)],
        cwd=ROOT,
        env=env,
        stdout=log,
        stderr=log,
        start_new_session=True,
    )
    PID.write_text(str(p.pid))
    time.sleep(0.3)
    if p.poll() is not None:
        raise RuntimeError("Connector startup failed; inspect .run/connectors.log")
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
