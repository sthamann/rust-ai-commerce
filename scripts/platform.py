#!/usr/bin/env python3
"""Real PostgreSQL/HTTP operator control-plane regression; synthetic accounts only, no paid providers."""

import json, os, pathlib, subprocess, urllib.request, urllib.error, uuid

BASE = os.getenv("BASE_URL", "http://127.0.0.1:8787")
suffix = uuid.uuid4().hex[:10]
checks = []
password = "Synthetic-platform-2026!"


def req(path, body=None, headers=None, expected=200):
    r = urllib.request.Request(
        BASE + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **(headers or {})},
        method="GET" if body is None else "POST",
    )
    try:
        with urllib.request.urlopen(r, timeout=90) as response:
            status = response.status
            data = json.load(response)
    except urllib.error.HTTPError as e:
        status = e.code
        data = json.load(e)
    assert status == expected, (path, status, expected, data)
    return data


def check(message):
    checks.append(message)
    print("PASS", message)


def sql(text):
    r = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            os.getenv("DB_CONTAINER", "rust-ai-commerce-postgres-1"),
            "psql",
            "-XqAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "commerce",
            "-d",
            os.getenv("TEST_DATABASE", "commerce"),
        ],
        input=text,
        capture_output=True,
        text=True,
        check=True,
    )
    return r.stdout.strip()


def h(account, tenant=None):
    return {
        "Authorization": "Bearer " + account["token"],
        **({"x-tenant": tenant} if tenant else {}),
    }


def register(label):
    return req(
        "/api/auth/register",
        {
            "name": label,
            "email": label + "-" + suffix + "@example.test",
            "password": password,
            "workspaceId": label + "-" + suffix,
            "workspaceName": label,
        },
    )


owner = register("platform")
other = register("platform-other")
oh = h(owner)
for path in [
    "/api/platform/session",
    "/api/platform/overview",
    "/api/platform/shops",
    "/api/platform/audit",
]:
    req(path, headers=oh, expected=403)
    req(path, headers={"x-rac-platform-user": owner["user"]["id"]}, expected=401)
req("/api/platform/shops", {"id": "escalation-" + suffix, "name": "No"}, oh, 403)
if os.getenv("MERCHANT_TOKEN"):
    req(
        "/api/platform/session",
        headers={"Authorization": "Bearer " + os.environ["MERCHANT_TOKEN"]},
        expected=401,
    )
check(
    "shop owners, anonymous forged principal headers and bootstrap credentials cannot enter platform control plane"
)
root = pathlib.Path(__file__).resolve().parents[1]
for action in ["grant"]:
    subprocess.run(
        [
            "python3",
            str(root / "scripts/platform_admin.py"),
            action,
            "--email",
            owner["user"]["email"],
            "--container",
            os.getenv("DB_CONTAINER", "rust-ai-commerce-postgres-1"),
            "--database",
            os.getenv("TEST_DATABASE", "commerce"),
        ],
        check=True,
    )
assert (
    req("/api/platform/session", headers={**oh, "x-tenant": other["workspace"]})[
        "user"
    ]["id"]
    == owner["user"]["id"]
)
check(
    "offline grant activates only the named personal account; operator requests are independent of selected shop"
)
key = req(
    "/api/workspace/integrations",
    {
        "name": "Operator scoped key",
        "permissions": ["catalog.read"],
        "expiresInDays": 1,
    },
    {**oh, "x-tenant": owner["workspace"]},
)
req(
    "/api/platform/session",
    headers={"Authorization": "Bearer " + key["key"]},
    expected=403,
)
check("an integration key issued by an operator cannot inherit platform rights")
before = req("/api/platform/overview?days=7", headers=oh)
empty = "empty-" + suffix
seed = "seed-" + suffix
foreign = "foreign-" + suffix
for shop, seeded, owner_email in [
    (empty, False, ""),
    (seed, True, ""),
    (foreign, False, other["user"]["email"]),
]:
    response = req(
        "/api/platform/shops",
        {"id": shop, "name": shop, "seedCatalog": seeded, "ownerEmail": owner_email},
        oh,
    )
    assert response["paymentMode"] == "simulated" and "token" not in response
    assert sql(f"SELECT count(*) FROM customers WHERE tenant='{shop}'") == "0"
check(
    "empty and sample-catalog provisioning never creates demo customers or exposes session credentials"
)
page = req("/api/platform/shops?search=" + suffix, headers=oh)
shops = {s["id"]: s for s in page["elements"]}
assert (
    shops[empty]["products"] == 0
    and shops[seed]["products"] > 6
    and shops[foreign]["members"] == 1
)
assert shops[empty]["salesChannels"] == 1
req("/api/search/product", {}, h(owner, foreign), 403)
req("/api/search/product", {}, h(other, foreign))
assert req("/api/search/product", {}, h(owner, seed))["elements"]
check(
    "created ownership is enforced by ordinary merchant API; global access does not bypass foreign shop membership"
)
req("/api/platform/shops", {"id": empty, "name": "Duplicate"}, oh, 409)
req("/api/platform/shops", {"id": "bad_ID", "name": "Invalid"}, oh, 400)
req(
    "/api/platform/shops",
    {
        "id": "missing-" + suffix,
        "name": "Owner missing",
        "ownerEmail": "missing-" + suffix + "@example.test",
    },
    oh,
    400,
)
for path in [
    "/api/platform/shops?limit=101",
    "/api/platform/overview?days=0",
    "/api/platform/overview?days=91",
    "/api/platform/shops?search=" + "x" * 101,
]:
    req(path, headers=oh, expected=400)
check(
    "invalid windows, oversized searches, duplicate shop IDs and unregistered owners fail without partial creation"
)
p1 = req("/api/platform/shops?search=" + suffix + "&limit=1", headers=oh)
p2 = req(
    "/api/platform/shops?search=" + suffix + "&limit=1&after=" + p1["nextCursor"],
    headers=oh,
)
assert p1["hasMore"] and p1["elements"][0]["id"] != p2["elements"][0]["id"]
check("bounded shop directory uses a stable keyset cursor")
c = req(
    "/store-api/checkout/cart", {"session": "platform-" + suffix}, {"x-tenant": seed}
)
ch = {"x-tenant": seed, "sw-context-token": c["token"]}
cart = req(
    "/store-api/checkout/cart/line-item",
    {"items": [{"referencedId": "mug", "quantity": 1}]},
    ch,
)
order = req(
    "/store-api/checkout/order", {}, {**ch, "Idempotency-Key": "platform-" + suffix}
)
view = req("/api/platform/overview?days=7", headers=oh)
assert view["shops"] == before["shops"] + 3 and view["orders"] == before["orders"] + 1
money = req("/api/platform/shops/" + seed + "?days=7", headers=oh)
assert len(money["timeline"]) == 7 and sum(d["orders"] for d in money["timeline"]) == 1
assert len(money["amounts"]) == 1 and money["amounts"][0]["currency"] == "EUR"
a = money["amounts"][0]
assert (
    float(a["booked"]) > 0
    and a["booked"] == a["simulated"]
    and float(a["captured"]) == 0
)
# Synthetic persisted capture facts exercise aggregate semantics only: no live provider is contacted.
original_payment = order["payment"]
order_id = order["id"]
assert all(c in "0123456789abcdef" for c in order_id)
for state in ["captured", "partially_refunded", "refunded", "captured_late"]:
    payment = {
        **original_payment,
        "provider": "paypal",
        "realMoneyCharged": True,
        "state": state,
    }
    encoded = json.dumps(payment).replace("'", "''")
    sql(
        f"UPDATE orders SET data=jsonb_set(data,'{{payment}}','{encoded}'::jsonb) WHERE tenant='{seed}' AND id='{order_id}'"
    )
    confirmed = req("/api/platform/shops/" + seed + "?days=7", headers=oh)["amounts"][0]
    assert confirmed["captured"] == a["booked"] and float(confirmed["simulated"]) == 0
encoded = json.dumps(original_payment).replace("'", "''")
sql(
    f"UPDATE orders SET data=jsonb_set(data,'{{payment}}','{encoded}'::jsonb) WHERE tenant='{seed}' AND id='{order_id}'"
)
check(
    "gross confirmed captures remain recorded after partial/full refunds and late captures; synthetic facts never contact a live provider"
)
# Mark an isolated empty shop as staging using the real relation; aggregates must exclude it.
sql(
    f"INSERT INTO shop_environments(tenant,live_tenant,name,baseline) VALUES('{empty}','{seed}','Synthetic exclusion','{{}}'::jsonb)"
)
view2 = req("/api/platform/overview?days=7", headers=oh)
assert (
    view2["shops"] == view["shops"] - 1 and view2["sandboxes"] == view["sandboxes"] + 1
)
req("/api/platform/shops/" + empty, headers=oh, expected=404)
sql(f"DELETE FROM shop_environments WHERE tenant='{empty}'")
check(
    "real checkout changes global and daily statistics; simulated amounts remain distinct; staging is excluded"
)
body = json.dumps(req("/api/platform/overview", headers=oh)) + json.dumps(
    req("/api/platform/shops", headers=oh)
)
assert (
    password not in body
    and other["user"]["email"] not in body
    and "password_hash" not in body
)
assert any(
    e["action"] == "shop.created" and e["shop"] == seed
    for e in req("/api/platform/audit", headers=oh)["elements"]
)
check(
    "aggregate APIs expose no customer credentials or private evidence; provisioning is audited"
)
subprocess.run(
    [
        "python3",
        str(root / "scripts/platform_admin.py"),
        "revoke",
        "--email",
        owner["user"]["email"],
        "--container",
        os.getenv("DB_CONTAINER", "rust-ai-commerce-postgres-1"),
        "--database",
        os.getenv("TEST_DATABASE", "commerce"),
    ],
    check=True,
)
req("/api/platform/overview", headers=oh, expected=403)
req("/api/auth/logout", {}, oh)
req("/api/platform/session", headers=oh, expected=401)
check(
    "operator revocation is immediate and logout invalidates the actual stored session"
)
report = {
    "suite": "platform-v1",
    "passed": len(checks),
    "checks": checks,
    "syntheticData": True,
}
print(json.dumps(report, indent=2))
if os.getenv("REPORT_PATH"):
    pathlib.Path(os.environ["REPORT_PATH"]).write_text(
        json.dumps(report, indent=2) + "\n"
    )
if os.getenv("PLATFORM_BROWSER_STATE"):
    # Explicit local-only opt-in used to exercise the UI, never emitted to logs/artifacts.
    sql(
        f"UPDATE platform_operators SET active=true WHERE user_id='{owner['user']['id']}'"
    )
    session = req(
        "/api/auth/login", {"email": owner["user"]["email"], "password": password}
    )
    dest = pathlib.Path(os.environ["PLATFORM_BROWSER_STATE"])
    dest.write_text(
        json.dumps(
            {
                "token": session["token"],
                "email": owner["user"]["email"],
                "workspace": seed,
            }
        )
    )
    dest.chmod(0o600)
