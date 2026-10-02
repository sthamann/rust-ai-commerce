#!/usr/bin/env python3
"""Inventory original Shopware conditions without claiming unsupported scopes are implemented."""

import json, pathlib, re

root = pathlib.Path(__file__).resolve().parents[1]
core = root / "reference/vendor/shopware/core"
rows = []
implemented = {
    "andContainer",
    "orContainer",
    "notContainer",
    "alwaysValid",
    "cartCartAmount",
    "cartLineItemsInCartCount",
    "customerCustomerGroup",
    "customerLoggedIn",
    "salesChannel",
    "cartLineItem",
    "customerShippingCountry",
    "customerBillingCountry",
    "shippingMethod",
    "paymentMethod",
    "customerEmail",
}
for file in sorted(core.rglob("*Rule.php")):
    text = file.read_text()
    match = re.search(r"(?:RULE_NAME\s*=|return)\s*'([A-Za-z0-9_]+)'", text)
    if not match:
        continue
    name = match.group(1)
    rows.append(
        {
            "type": name,
            "source": str(file.relative_to(core)),
            "status": "implemented-scope" if name in implemented else "not-ported",
            "nativeModule": "src/marketing/rules.rs + src/marketing/rule_match.rs"
            if name in implemented
            else None,
        }
    )
report = {
    "upstream": "shopware/core 6.7.14.2",
    "conditions": rows,
    "completeCatalogParity": False,
    "identityMapping": "Rules use native entity IDs; translate Shopware UUID references during catalog/customer migration. No guessed mappings.",
}
(root / "reference/rule-catalog.json").write_text(json.dumps(report, indent=2) + "\n")
print(
    "Inventoried",
    len(rows),
    "original conditions;",
    sum(r["status"] == "implemented-scope" for r in rows),
    "supported source names; unsupported scopes explicit",
)
