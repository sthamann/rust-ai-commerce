#!/usr/bin/env python3
"""Prepare private first-host configuration; no server purchase, SSH, deployment or secret logging."""

import argparse, os, pathlib, re, secrets, urllib.parse

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--domain", required=True)
p.add_argument("--admin-email", required=True)
p.add_argument("--output", default="deploy/.env")
a = p.parse_args()
domain = a.domain.lower().strip()
email = a.admin_email.lower().strip()
if (
    not re.fullmatch(r"(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", domain)
    or "." not in domain
    or any(
        not label or len(label) > 63 or label.startswith("-") or label.endswith("-")
        for label in domain.split(".")
    )
):
    p.error("Public DNS hostname required, without URL/path/port")
if (
    email.count("@") != 1
    or len(email) > 254
    or any(c.isspace() or c in "'\"\\#$`" for c in email)
):
    p.error("Valid operator email required")
output = pathlib.Path(a.output)
output.parent.mkdir(parents=True, exist_ok=True)
db = secrets.token_urlsafe(36)
instance = secrets.token_urlsafe(48)
password = secrets.token_urlsafe(27)
config = f"""# Private generated deployment configuration. Never commit or paste this file into logs.
COMMERCE_DOMAIN={domain}
DB_PASSWORD={db}
DATABASE_URL=postgres://commerce:{urllib.parse.quote(db, safe="")}@postgres:5432/commerce
MERCHANT_TOKEN={instance}
COMMERCE_IMAGE_TAG=local
BOOTSTRAP_MODE=auto
SEED_DEMO=false
ALLOW_PUBLIC_SIGNUP=false
ALLOW_BOOTSTRAP_AUTH=false
PLATFORM_ADMIN_EMAIL={email}
PLATFORM_ADMIN_NAME=Platform operator
PLATFORM_ADMIN_PASSWORD={password}
OLLAMA_URL=http://your-private-model-host:11434
OLLAMA_MODEL=qwen3.6:35b
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
APP_SERVICES={{}}
"""
try:
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    raise SystemExit("Refusing to overwrite an existing deployment configuration.")
with os.fdopen(fd, "w") as f:
    f.write(config)
print(
    f"Private configuration saved to {output}. Operator password is stored only in this file. Set inference/app endpoints, deploy, then remove PLATFORM_ADMIN_PASSWORD after setup."
)
