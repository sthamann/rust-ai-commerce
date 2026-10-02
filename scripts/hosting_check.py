#!/usr/bin/env python3
"""Check a deployed experimental SaaS HTTPS origin without credentials or real orders."""

import argparse, json, urllib.request, urllib.error, urllib.parse

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--origin", required=True)
a = p.parse_args()
u = urllib.parse.urlparse(a.origin)
if (
    u.scheme != "https"
    or not u.hostname
    or u.username
    or u.password
    or u.query
    or u.fragment
    or u.path not in ["", "/"]
):
    p.error("Public HTTPS origin required")
base = a.origin.rstrip("/")
for path, method, body, expected in [
    ("/health", "GET", None, 200),
    ("/api/platform/overview", "GET", None, 401),
    ("/api/auth/register", "POST", {}, 403),
]:
    request = urllib.request.Request(
        base + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status = response.status
            data = json.load(response)
    except urllib.error.HTTPError as e:
        status = e.code
        data = json.load(e)
    assert status == expected, (path, status, expected)
    if path == "/health":
        assert (
            data.get("database") == "postgresql+apache-age+pgvector"
            or data.get("status") == "ok"
        ), "Unexpected health response"
    print("PASS", path, status)
print(
    "Anonymous HTTPS/API gates verified. Operator sign-in, isolated shop creation, customer checkout and provider credentials still require an authenticated release check."
)
