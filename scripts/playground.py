#!/usr/bin/env python3
"""Create an isolated local shop through personal-owner APIs; reruns preserve merchant edits and never call providers."""
import argparse
import getpass
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

from demo.fixtures import definitions

ROOT = Path(__file__).resolve().parents[1]


class Client:
    def __init__(self, base, token="", tenant=""):
        parsed = urllib.parse.urlsplit(base)
        if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1") or parsed.query or parsed.fragment or parsed.username or parsed.path not in ("", "/"):
            raise ValueError("Playground setup accepts only a local HTTP origin")
        self.base, self.token, self.tenant = base.rstrip("/"), token, tenant

    def call(self, route, data=None, method=None):
        headers = {"Content-Type": "application/json"}
        if self.tenant:
            headers["x-tenant"] = self.tenant
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        request = urllib.request.Request(self.base + route, headers=headers,
            data=None if data is None else json.dumps(data).encode(),
            method=method or ("GET" if data is None else "POST"))
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Never echo request credentials or provider response bodies.
            raise RuntimeError(f"{request.method} {route} failed (HTTP {error.code})") from None


def create_shop(client, workspace):
    session = client.call("/api/workspaces", {"workspaceId": workspace, "workspaceName": "Commerce Playground"})
    return Client(client.base, session["token"], session["workspace"])


def seed(client):
    current = client.call("/api/automation")
    created, retained = [], []
    for kind, rows in definitions().items():
        existing = {row["id"] for row in current[kind]}
        for identifier, data in rows.items():
            if identifier in existing:
                retained.append(kind + "/" + identifier)
                continue
            client.call(f"/api/automation/{kind}/{identifier}", {"revision": 0, "data": data}, "PUT")
            created.append(kind + "/" + identifier)
    settings = client.call("/api/merchant/receipts/settings")
    if settings["revision"] == 0:
        client.call("/api/merchant/receipts/settings", {"revision": 0, "data": {
            "name": "Commerce Playground — synthetic seller",
            "address": "Example Street 1, 10115 Berlin, Germany", "taxId": "DEMO-ONLY"}}, "PUT")
    apps = client.call("/api/apps")
    installed = {row["id"] for row in apps["packages"]}
    if "engraving" not in installed:
        review = client.call("/api/apps/review", {"builtIn": "engraving"})
        client.call("/api/apps", {"builtIn": "engraving", "approve": True,
            "digest": review["digest"], "permissions": review["permissions"]})
    return {"created": created, "retained": retained, "workspace": client.tenant,
            "providerCalls": 0, "ordersCreated": 0,
            "studio": f"{client.base}/?shop={client.tenant}#merchant",
            "storefront": f"{client.base}/?shop={client.tenant}#",
            "collection": f"{client.base}/?shop={client.tenant}&channel=demo_home#",
            "product": f"{client.base}/?shop={client.tenant}#product/mug"}


def private_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w") as target:
        os.fchmod(target.fileno(), 0o600)
        target.write(json.dumps(value, indent=2) + "\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8787")
    parser.add_argument("--email", help="Existing personal owner account; password is prompted privately")
    parser.add_argument("--state", type=Path, default=ROOT / ".run/playground.json")
    args = parser.parse_args(argv)
    saved = json.loads(args.state.read_text()) if args.state.exists() else {}
    client = Client(args.base_url)
    email = args.email or saved.get("email")
    token = os.environ.get("COMMERCE_SESSION_TOKEN", "")
    if token:
        client.token = token
        session = client.call("/api/auth/session")
    else:
        if not email:
            parser.error("Use --email for your existing personal owner account, or COMMERCE_SESSION_TOKEN")
        password = os.environ.get("COMMERCE_PASSWORD") or getpass.getpass("Personal merchant password: ")
        session = client.call("/api/auth/login", {"email": email, "password": password})
        client.token = session["token"]
    if session["user"]["id"] == "bootstrap":
        raise ValueError("Use a personal owner account, not the instance bootstrap token")
    if saved:
        if saved["base"] != client.base:
            raise ValueError("Saved playground belongs to a different local instance; choose another --state")
        if not saved["workspace"].startswith("playground-") or not any(row["id"] == saved["workspace"] and row["role"] == "owner" for row in session["workspaces"]):
            raise ValueError("Current identity does not own this saved playground; choose another --state")
        client.tenant = saved["workspace"]
    else:
        client = create_shop(client, "playground-" + uuid.uuid4().hex[:10])
        # Persist the new identity before seeding so interrupted setup can resume.
        private_write(args.state, {"base": client.base, "workspace": client.tenant, "email": email})
    report = seed(client)
    private_write(args.state.with_suffix(".report.json"), report)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, urllib.error.URLError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
