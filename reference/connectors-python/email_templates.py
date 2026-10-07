"""Bounded locale-aware mail envelopes and escaped order-template variables; no executable templates."""

import html, json, re
from email_config import address, LOCALES

TEMPLATES = {
    "en": {
        "subject": "Order {orderNumber} confirmed",
        "text": "Hello {firstName},\nThank you for your order {orderNumber}. Total: {totalPrice} {currency}.",
    },
    "de": {
        "subject": "Bestellung {orderNumber} bestätigt",
        "text": "Hallo {firstName},\nvielen Dank für deine Bestellung {orderNumber}. Gesamtbetrag: {totalPrice} {currency}.",
    },
    "fr": {
        "subject": "Commande {orderNumber} confirmée",
        "text": "Bonjour {firstName},\nmerci pour votre commande {orderNumber}. Total : {totalPrice} {currency}.",
    },
    "es": {
        "subject": "Pedido {orderNumber} confirmado",
        "text": "Hola {firstName},\ngracias por tu pedido {orderNumber}. Total: {totalPrice} {currency}.",
    },
}


def envelope(value, s):
    if not isinstance(value, dict) or set(value) - {
        "to",
        "cc",
        "bcc",
        "subject",
        "text",
        "html",
        "replyTo",
    }:
        raise ValueError("Invalid mail envelope")
    out = {}
    for field in ("to", "cc", "bcc"):
        values = value.get(field, [])
        if isinstance(values, str):
            values = [values]
        if not isinstance(values, list) or len(values) > 10:
            raise ValueError("Maximum ten recipients per address field")
        out[field] = [address(x) for x in values]
    if not out["to"]:
        raise ValueError("Recipient required")
    out["subject"] = value.get("subject", "")
    if (
        not isinstance(out["subject"], str)
        or not out["subject"].strip()
        or len(out["subject"]) > 200
        or any(c in out["subject"] for c in "\r\n\0")
    ):
        raise ValueError("Invalid mail subject")
    for key in ("text", "html"):
        out[key] = value.get(key, "")
        if not isinstance(out[key], str) or len(out[key]) > 16000:
            raise ValueError("Mail body exceeds limit")
    if not out["text"] and not out["html"]:
        raise ValueError("Mail body required")
    if len(json.dumps(out).encode()) > 40000:
        raise ValueError("Mail envelope exceeds limit")
    out["replyTo"] = value.get("replyTo", s.get("replyTo", ""))
    if out["replyTo"]:
        address(out["replyTo"])
    out["fromEmail"] = s.get("fromEmail", "")
    out["fromName"] = s.get("fromName", "")
    return out


def order(value, s):
    event = value.get("event", {})
    o = event.get("order", event)
    customer = o.get("orderCustomer") or {}
    if not customer.get("email"):
        raise ValueError("Order customer email required")
    locale = value.get("locale", s.get("locale", "en")).split("-")[0]
    if locale not in LOCALES:
        raise ValueError("Unsupported email language")
    template = {**TEMPLATES[locale], **s.get("templates", {}).get(locale, {})}
    price = o.get("cart", {}).get("price", {}).get("totalPrice", "")
    if isinstance(price, (int, float)) and not isinstance(price, bool):
        price = f"{price:.2f}"
        if locale != "en":
            price = price.replace(".", ",")
    variables = {
        "orderNumber": o.get("orderNumber", event.get("orderId", "")),
        "firstName": customer.get("firstName") or customer.get("name") or "",
        "totalPrice": price,
        "currency": o.get("currencyId") or "EUR",
    }

    def render(text, escaped=False):
        def replace(match):
            if match[1] not in variables:
                raise ValueError("Unknown mail template variable")
            v = str(variables[match[1]])
            return html.escape(v, quote=True) if escaped else v

        return re.sub(r"\{([a-zA-Z][a-zA-Z0-9]*)\}", replace, text)

    return envelope(
        {
            "to": customer["email"],
            "subject": render(template["subject"]),
            "text": render(template["text"]),
            "html": render(template.get("html", ""), True),
        },
        s,
    )


def consumer_receipt(event, s):
    """Immutable declaration receipt, not an identity check or refund confirmation."""
    data = event.get("receipt", {})
    locale = data.get("locale", s.get("locale", "en")).split("-")[0]
    text = {
        "en": ("Request received", "We received your declaration. This confirms receipt, not a refund or completion. Keep this message."),
        "de": ("Anfrage eingegangen", "Wir haben deine Erklärung erhalten. Dies bestätigt den Eingang, keine Erstattung oder Erledigung. Bewahre diese Nachricht auf."),
        "fr": ("Demande reçue", "Nous avons reçu votre déclaration. Ceci confirme la réception, pas un remboursement ou une résolution. Conservez ce message."),
        "es": ("Solicitud recibida", "Hemos recibido tu declaración. Esto confirma la recepción, no un reembolso ni una resolución. Conserva este mensaje."),
    }.get(locale)
    if text is None:
        text = ("Request received", "Your declaration has been received. Keep this message as confirmation of receipt.")
    body = text[1] + "\n\n" + json.dumps({
        "requestId": event.get("requestId", ""), "kind": event.get("kind", ""),
        **{k: data.get(k, "") for k in ("name", "email", "reference", "message", "receivedAt")},
    }, ensure_ascii=False, indent=2)
    return {"to": data.get("email", ""), "subject": text[0], "text": body}
