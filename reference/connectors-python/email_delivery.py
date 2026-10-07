"""Provider delivery outside the commerce process; TLS SMTP and fixed Resend/SendGrid APIs."""

import hashlib, json, smtplib, socket, ssl, urllib.error, urllib.request
from email.message import EmailMessage
from email.utils import formataddr
from email_config import smtp_target
from transport import endpoint, NoRedirect, WireError


def pinned_socket(target, timeout):
    # Connect-only fallback among validated addresses; never repeat MAIL/DATA.
    error = None
    for ip in target[0]:
        try:
            return socket.create_connection((ip, target[1]), timeout)
        except OSError as e:
            error = e
    raise error or OSError("SMTP host has no validated address")


class PinnedSMTP(smtplib.SMTP):
    def _get_socket(self, host, port, timeout):
        return pinned_socket(self.target, timeout)


class PinnedSSL(smtplib.SMTP_SSL):
    def _get_socket(self, host, port, timeout):
        return self.context.wrap_socket(
            pinned_socket(self.target, timeout), server_hostname=host
        )


def smtp(s, credentials, mail, key):
    target = smtp_target(s)
    context = ssl.create_default_context()
    cls = PinnedSSL if s["smtpSecurity"] == "tls" else PinnedSMTP
    client = cls(timeout=8, **({"context": context} if cls is PinnedSSL else {}))
    client.target = target
    client._host = s[
        "smtpHost"
    ]  # STARTTLS verifies the configured name, not the pinned IP.
    message = EmailMessage()
    message["From"] = formataddr((mail["fromName"], mail["fromEmail"]))
    message["To"] = ", ".join(mail["to"])
    if mail["cc"]:
        message["Cc"] = ", ".join(mail["cc"])
    if mail["replyTo"]:
        message["Reply-To"] = mail["replyTo"]
    message["Subject"] = mail["subject"]
    message["Message-ID"] = "<" + key + "@" + mail["fromEmail"].split("@")[1] + ">"
    message.set_content(mail["text"] or "")
    if mail["html"]:
        message.add_alternative(mail["html"], subtype="html")
    accepted = False
    try:
        client.connect(s["smtpHost"], s["smtpPort"])
        client.ehlo()
        if s["smtpSecurity"] == "starttls":
            client.starttls(context=context)
            client.ehlo()
        if s["smtpUsername"]:
            client.login(s["smtpUsername"], credentials["smtpPassword"])
        refused = client.send_message(
            message,
            from_addr=mail["fromEmail"],
            to_addrs=mail["to"] + mail["cc"] + mail["bcc"],
        )
        accepted = True
        return {
            "outcome": "accepted",
            "provider": "smtp",
            "messageId": str(message["Message-ID"]),
            "rejectedRecipients": len(refused),
        }
    finally:
        # QUIT failure after DATA acceptance must not turn a successful send into a retry.
        if accepted:
            try:
                client.quit()
            except (OSError, smtplib.SMTPException):
                client.close()
        else:
            client.close()


def api(s, credentials, m, key):
    provider = s["provider"]
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + credentials["apiKey"],
    }
    if provider == "resend":
        url = endpoint("resend") + "/emails"
        headers["Idempotency-Key"] = key
        body = {
            "from": formataddr((m["fromName"], m["fromEmail"])),
            "to": m["to"],
            "subject": m["subject"],
        }
        for k in ("text", "html", "cc", "bcc"):
            if m[k]:
                body[k] = m[k]
        if m["replyTo"]:
            body["reply_to"] = m["replyTo"]
    else:
        url = (
            endpoint("sendgrid_eu" if s["region"] == "eu" else "sendgrid")
            + "/mail/send"
        )
        p = {k: [{"email": x} for x in m[k]] for k in ("to", "cc", "bcc") if m[k]}
        body = {
            "personalizations": [p],
            "from": {"email": m["fromEmail"], "name": m["fromName"]},
            "subject": m["subject"],
            "content": [
                {"type": kind, "value": m[k]}
                for k, kind in (("text", "text/plain"), ("html", "text/html"))
                if m[k]
            ],
        }
        if m["replyTo"]:
            body["reply_to"] = {"email": m["replyTo"]}
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers=headers, method="POST"
    )
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=8) as r:
            raw = r.read(65537)
            if len(raw) > 65536:
                raise OSError("Mail provider response exceeds limit")
            # Already accepted; a malformed provider receipt cannot cause an automatic resend.
            try:
                receipt = json.loads(raw) if raw else {}
            except ValueError:
                receipt = {}
            if not isinstance(receipt, dict):
                receipt = {}
            return {
                "outcome": "accepted",
                "provider": provider,
                "messageId": str(
                    receipt.get("id") or r.headers.get("X-Message-Id", "")
                )[:200],
            }
    except urllib.error.HTTPError as e:
        code = e.code
        e.close()
        raise WireError(code, 30) from None


def deliver(store, job, payload):
    v = store.get(job["tenant"], "email")
    s = v["settings"]
    if v["revision"] != payload["revision"] or not s.get("enabled"):
        raise ValueError("Email configuration changed or delivery disabled")
    if payload["dryRun"]:
        return {
            "outcome": "dry_run",
            "provider": s["provider"],
            "recipientCount": len(payload["mail"]["to"]),
            "externalDelivery": False,
        }
    key = hashlib.sha256((job["tenant"] + ":" + job["id"]).encode()).hexdigest()
    return (
        smtp(s, v.get("credentials", {}), payload["mail"], key)
        if s["provider"] == "smtp"
        else api(s, v["credentials"], payload["mail"], key)
    )
