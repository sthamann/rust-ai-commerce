"""Email app actions and event intake: queue bounded immutable envelopes with revision fences."""

import email_config as config
from email_templates import envelope, order, TEMPLATES


def action(store, tenant, name, value):
    if name == "status":
        return {**config.public(store, tenant), "defaultTemplates": TEMPLATES}
    if name == "configure":
        return config.configure(store, tenant, value)
    v = store.get(tenant, "email")
    s = {**config.DEFAULTS, **v["settings"]}
    if name == "preview_order":
        return {"mail": order(value, s), "externalDelivery": False}
    if name not in ("send", "send_order"):
        raise ValueError("Unknown email action")
    if not s["enabled"]:
        raise ValueError("Email delivery disabled")
    mail = (
        order(value, s) if name == "send_order" else envelope(value.get("message"), s)
    )
    dry_run = s["dryRun"] or value.get("dryRun", False)
    if type(dry_run) is not bool:
        raise ValueError("Test switch must be boolean")
    if not dry_run and not config.configured(v):
        raise ValueError("Mail provider configuration required")
    return store.enqueue(
        tenant,
        "email",
        value["requestKey"],
        {"mail": mail, "revision": v["revision"], "dryRun": dry_run},
    )


def event(store, tenant, value):
    if value.get("kind") == "order.placed" and store.get(tenant, "email")[
        "settings"
    ].get("notifyOrders"):
        return action(
            store,
            tenant,
            "send_order",
            {"event": value.get("data", {}), "requestKey": value["idempotencyKey"]},
        )
    return {"ignored": True}
