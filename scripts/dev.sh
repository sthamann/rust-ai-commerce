#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .run
if [ ! -f .env ]; then
  umask 077
  python3 - <<'PY'
import os, secrets
password=secrets.token_hex(24)
db_port=os.environ.get("DB_PORT", "15487")
with open('.env','w') as f:
    f.write(f'DB_PASSWORD={password}\nDATABASE_URL=postgres://commerce:{password}@127.0.0.1:{db_port}/commerce\nMERCHANT_TOKEN={secrets.token_hex(32)}\nOLLAMA_MODEL=qwen3.6:35b\nOLLAMA_URL=http://127.0.0.1:11434\n')
PY
fi
set -a; source .env; set +a
project="${COMPOSE_PROJECT_NAME:-vendune}"
# Reuse an existing pre-Vendune database volume unless a project was explicitly selected.
if [ -z "${COMPOSE_PROJECT_NAME:-}" ] && [ -n "$(docker ps -a --filter label=com.docker.compose.project=rust-ai-commerce --filter label=com.docker.compose.service=postgres --format '{{.ID}}')" ]; then
  project="rust-ai-commerce"
fi
docker compose -p "$project" up -d --build --wait postgres
(cd frontend && npm ci && npm run build)
cargo build --locked
if [ "${CONNECTED_APPS:-0}" = "1" ]; then
  python3 scripts/connectors.py start
fi
if [ "${PRODUCT_LAB:-0}" = "1" ]; then
  python3 scripts/product_lab.py start
fi
if [ "${CONNECTED_APPS:-0}" = "1" ] || [ "${PRODUCT_LAB:-0}" = "1" ]; then
  export APP_SERVICES="$(python3 - <<'PYMERGE'
import json,os,pathlib
services=json.loads(os.getenv('APP_SERVICES','{}'));services.update(json.loads(pathlib.Path('.run/connector-services.json').read_text()));print(json.dumps(services))
PYMERGE
)"
fi
exec target/debug/vendune
