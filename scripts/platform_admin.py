#!/usr/bin/env python3
"""Grant/revoke an existing personal operator offline. Credentials remain in environment; no signup can grant this role."""

import argparse, json, os, pathlib, subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("action", choices=["grant", "revoke"])
p.add_argument("--email", required=True)
p.add_argument(
    "--database",
    default="commerce",
    help="Database name for the explicit local container",
)
p.add_argument(
    "--container",
    help="Explicit local Compose PostgreSQL container; otherwise use DATABASE_URL with installed psql",
)
a = p.parse_args()
email = a.email.strip().lower()
if len(email) > 254 or email.count("@") != 1 or any(c.isspace() for c in email):
    p.error("Valid registered email required")
literal = "'" + email.replace("'", "''") + "'"
if a.action == "grant":
    change = f"INSERT INTO platform_operators(user_id,active) SELECT id,true FROM merchant_users WHERE email={literal} ON CONFLICT(user_id) DO UPDATE SET active=true RETURNING user_id"
else:
    change = f"UPDATE platform_operators SET active=false WHERE user_id IN (SELECT id FROM merchant_users WHERE email={literal}) RETURNING user_id"
sql = f"WITH changed AS ({change}), recorded AS (INSERT INTO platform_audit(action,data) SELECT 'operator.{a.action}',jsonb_build_object('userId',user_id) FROM changed RETURNING id) SELECT count(*) FROM recorded;"
env = dict(os.environ)
if a.container:
    command = [
        "docker",
        "exec",
        "-i",
        a.container,
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "commerce",
        "-d",
        a.database,
    ]
else:
    if not env.get("DATABASE_URL"):
        p.error("DATABASE_URL required")
    env["PGDATABASE"] = env["DATABASE_URL"]
    command = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]
r = subprocess.run(command, input=sql, capture_output=True, text=True, env=env)
if r.returncode:
    raise SystemExit(
        "Operator update failed; verify database access and migrated schema (provider credentials were not printed)."
    )
if r.stdout.strip() != "1":
    raise SystemExit(
        "No existing personal account/operator matched; create or verify the account before granting."
    )
print(
    "Personal operator access "
    + ("granted" if a.action == "grant" else "revoked")
    + "; audit recorded."
)
