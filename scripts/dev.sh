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
docker compose -p "${COMPOSE_PROJECT_NAME:-rust-ai-commerce}" up -d --build --wait postgres
(cd frontend && npm ci && npm run build)
cargo build --locked
exec target/debug/rust-ai-commerce
