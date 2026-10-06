"""Validate mail transport configuration and expose only write-only credential flags."""

import copy, ipaddress, os, re, socket

DEFAULTS = {
    "provider": "smtp",
    "enabled": False,
    "dryRun": True,
    "notifyOrders": False,
    "notifyConsumerRequests": True,
    "fromEmail": "",
    "fromName": "",
    "replyTo": "",
    "locale": "en",
    "smtpHost": "",
    "smtpPort": 587,
    "smtpSecurity": "starttls",
    "smtpUsername": "",
    "region": "global",
    "templates": {},
}
SECRET_KEYS = {"apiKey", "smtpPassword"}
LOCALES = ("en", "de", "fr", "es")


def address(value):
    if (
        not isinstance(value, str)
        or len(value) > 254
        or not re.fullmatch(
            r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}",
            value,
        )
    ):
        raise ValueError("Invalid email address")
    return value


def settings(value):
    if not isinstance(value, dict) or set(value) - set(DEFAULTS):
        raise ValueError("Unknown email setting")
    s = {**copy.deepcopy(DEFAULTS), **value}
    for k in ("enabled", "dryRun", "notifyOrders", "notifyConsumerRequests"):
        if type(s[k]) is not bool:
            raise ValueError("Email switch must be boolean")
    for k, default in DEFAULTS.items():
        if isinstance(default, str) and (
            not isinstance(s[k], str)
            or len(s[k]) > 254
            or any(c in s[k] for c in "\r\n\0")
        ):
            raise ValueError("Invalid email setting text")
    if (
        s["provider"] not in ("smtp", "resend", "sendgrid")
        or s["locale"] not in LOCALES
    ):
        raise ValueError("Unknown mail provider or locale")
    if s["region"] not in ("global", "eu") or s["smtpSecurity"] not in (
        "starttls",
        "tls",
        "test_plain",
    ):
        raise ValueError("Invalid transport mode")
    if type(s["smtpPort"]) is not int or not 1 <= s["smtpPort"] <= 65535:
        raise ValueError("Invalid SMTP port")
    for k in ("fromEmail", "replyTo"):
        if s[k]:
            address(s[k])
    if s["smtpHost"] and not re.fullmatch(r"[a-zA-Z0-9.-]{1,253}", s["smtpHost"]):
        raise ValueError("Invalid SMTP hostname")
    templates = s["templates"]
    if not isinstance(templates, dict) or set(templates) - set(LOCALES):
        raise ValueError("Invalid template languages")
    for template in templates.values():
        if not isinstance(template, dict) or set(template) - {
            "subject",
            "text",
            "html",
        }:
            raise ValueError("Invalid mail template")
        if any(not isinstance(x, str) or len(x) > 12000 for x in template.values()):
            raise ValueError("Mail template exceeds limit")
        if any(c in template.get("subject", "") for c in "\r\n\0"):
            raise ValueError("Invalid mail subject")
    return s


def configured(v):
    s = v.get("settings", {})
    c = v.get("credentials", {})
    return bool(
        s.get("fromEmail")
        and (
            s.get("smtpHost")
            if s.get("provider", "smtp") == "smtp"
            else c.get("apiKey")
        )
    )


def public(store, tenant):
    v = store.get(tenant, "email")
    return {
        "revision": v["revision"],
        "settings": {**copy.deepcopy(DEFAULTS), **v["settings"]},
        "connected": configured(v),
        "credentialsConfigured": {
            k: bool(v.get("credentials", {}).get(k)) for k in SECRET_KEYS
        },
        "smtpHostApprovalRequired": True,
        "jobs": store.jobs(tenant, "email"),
    }


def configure(store, tenant, value):
    s = settings(value.get("settings"))
    credentials = value.get("credentials", {})
    if not isinstance(credentials, dict) or set(credentials) - SECRET_KEYS:
        raise ValueError("Unknown mail credential")
    if any(
        not isinstance(v, str) or len(v) > 4000 or "\0" in v or "\r" in v or "\n" in v
        for v in credentials.values()
    ):
        raise ValueError("Invalid mail credential")

    if s["enabled"] and not s["dryRun"] and s["provider"] == "smtp":
        smtp_target(s)

    def change(v):
        if v["revision"] != value.get("revision"):
            raise ValueError("Email settings revision changed")
        c = dict(v.get("credentials", {}))
        old = v["settings"]
        if old.get("provider", "smtp") != s["provider"]:
            c.pop("apiKey", None)
        if any(old.get(k, DEFAULTS[k]) != s[k] for k in ("smtpHost", "smtpUsername")):
            c.pop("smtpPassword", None)
        c.update(credentials)
        if s["enabled"] and not s["dryRun"]:
            if not configured({"settings": s, "credentials": c}):
                raise ValueError("Sender and provider credentials required")
            if s["provider"] == "smtp":
                if s["smtpUsername"] and not c.get("smtpPassword"):
                    raise ValueError("SMTP password required")
        v.update(settings=s, credentials=c, revision=v["revision"] + 1)

    store.update(tenant, "email", change)
    return public(store, tenant)


def smtp_target(s):
    """Operator allowlist plus pinned public address: tenant input cannot reach private infrastructure."""
    host, port = s["smtpHost"], s["smtpPort"]
    testing = os.getenv("EMAIL_TEST_SMTP") == "1" and host in ("localhost", "127.0.0.1")
    allowed = {
        x.strip().lower()
        for x in os.getenv("EMAIL_SMTP_HOSTS", "").split(",")
        if x.strip()
    }
    if not testing and (
        host.lower() not in allowed or s["smtpSecurity"] == "test_plain"
    ):
        raise ValueError("SMTP host requires operator approval and TLS")
    ips = [x[4][0] for x in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)]
    if not ips or any(
        not (
            ipaddress.ip_address(ip).is_loopback
            if testing
            else ipaddress.ip_address(ip).is_global
        )
        for ip in ips
    ):
        raise ValueError("SMTP address is not allowed")
    return list(dict.fromkeys(ips)), port
