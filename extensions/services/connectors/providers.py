"""Real GA4 reporting, Gmail incremental retrieval and queued Slack notifications."""

import base64, email.utils, hashlib, json, re, time, urllib.parse
from html.parser import HTMLParser
from transport import endpoint, request


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag in ("p", "br", "div"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def plain(part):
    if part.get("mimeType") in ("text/plain", "text/html") and part.get("body", {}).get(
        "data"
    ):
        data = part["body"]["data"]
        value = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode(
            errors="replace"
        )[:4000]
        if part.get("mimeType") == "text/html":
            parser = Text()
            parser.feed(value)
            return "".join(parser.parts)[:4000]
        return value
    return "\n".join(filter(None, (plain(p) for p in part.get("parts", []))))[:4000]


def gmail(store, oauth, t, settings):
    state = store.get(t, "gmail")
    token = oauth.token(t, "gmail")
    base = endpoint("gmail") + "/users/me"
    label = settings.get("labelId", "INBOX")
    sources = []
    ids = set()
    deleted = set()
    history = state.get("historyId")
    full = False
    if history:
        try:
            page = None
            for _ in range(10):
                args = {"startHistoryId": history, "labelId": label, "maxResults": 100}
                if page:
                    args["pageToken"] = page
                value = request(
                    base + "/history?" + urllib.parse.urlencode(args), token=token
                )
                for row in value.get("history", []):
                    ids.update(m["message"]["id"] for m in row.get("messagesAdded", []))
                    ids.update(
                        m["message"]["id"]
                        for key in ["labelsAdded", "labelsRemoved"]
                        for m in row.get(key, [])
                    )
                    deleted.update(
                        m["message"]["id"] for m in row.get("messagesDeleted", [])
                    )
                page = value.get("nextPageToken")
                if not page:
                    history = value["historyId"]
                    break
            if page:
                raise ValueError(
                    "Mailbox change window too large; reconnect/reset sync cursor"
                )
        except Exception as e:
            from transport import WireError

            if not isinstance(e, WireError) or e.status != 404:
                raise
            history = None
    if not history:
        full = True
        # High-water mark is read before the snapshot so subsequent changes are not lost.
        history = request(base + "/profile", token=token)["historyId"]
        page = None
        for _ in range(10):
            args = {"labelIds": label, "maxResults": 50}
            if page:
                args["pageToken"] = page
            value = request(
                base + "/messages?" + urllib.parse.urlencode(args), token=token
            )
            ids.update(m["id"] for m in value.get("messages", []))
            page = value.get("nextPageToken")
            if not page:
                break
        if page:
            raise ValueError(
                "Label has more than 500 messages; choose a dedicated support label"
            )
    if len(ids) > 500:
        raise ValueError("Mailbox window exceeds bounded sync; select a narrower label")
    for id in sorted(ids - deleted):
        try:
            v = request(
                base + "/messages/" + urllib.parse.quote(id, safe="") + "?format=full",
                token=token,
            )
        except Exception as e:
            from transport import WireError

            if isinstance(e, WireError) and e.status == 404:
                deleted.add(id)
                continue
            raise
        if label not in v.get("labelIds", []):
            deleted.add(id)
            continue
        headers = {
            h["name"].lower(): h["value"]
            for h in v.get("payload", {}).get("headers", [])
        }
        subject = (
            headers.get("subject", "Support message")
            .encode()[:300]
            .decode("utf-8", errors="ignore")
        )
        body = plain(v.get("payload", {})) or v.get("snippet", "")
        text = (subject + "\n" + body).encode()[:12000].decode("utf-8", errors="ignore")
        order = re.search(r"RAC-[A-Za-z0-9]+", text)
        sources.append(
            {
                "id": "message-" + id,
                "kind": "support_email",
                "title": subject,
                "text": text,
                "sourceUrl": "https://mail.google.com/mail/u/0/#all/"
                + v.get("threadId", id),
                "metadata": {
                    "messageId": id,
                    "threadId": v.get("threadId"),
                    "from": headers.get("from", ""),
                    "date": headers.get("date", ""),
                    "orderNumber": order.group(0) if order else None,
                },
            }
        )
    if full:
        deleted.update(
            r["id"][8:]
            for r in store.sources(t, "gmail")
            if not r.get("deleted")
            and r["id"].startswith("message-")
            and r["id"][8:] not in ids
        )
    sources.extend({"id": "message-" + id, "deleted": True} for id in deleted)
    store.sources(
        t,
        "gmail",
        sources,
        expected_settings=settings,
        history=history,
        expected_revision=state["revision"],
    )
    return {"messagesImported": len(sources), "historyId": history}


def analytics(store, oauth, t, settings):
    revision = store.get(t, "google_analytics")["revision"]
    property_id = str(settings.get("propertyId", ""))
    if not property_id.isdecimal():
        raise ValueError("Numeric GA4 property ID required")
    token = oauth.token(t, "google_analytics")
    all_sources = []
    reports = [
        (
            "acquisition",
            ["date", "sessionSourceMedium"],
            ["sessions", "totalUsers", "purchaseRevenue"],
        ),
        (
            "products",
            ["itemId", "itemName"],
            ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"],
        ),
    ]
    for name, dimensions, metrics in reports:
        body = {
            "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
            "dimensions": [{"name": v} for v in dimensions],
            "metrics": [{"name": v} for v in metrics],
            "limit": "1000",
            "returnPropertyQuota": True,
        }
        report = request(
            endpoint("analytics") + "/properties/" + property_id + ":runReport",
            body,
            token,
        )
        rows = [
            {
                **dict(
                    zip(
                        dimensions, [d["value"] for d in row.get("dimensionValues", [])]
                    )
                ),
                **dict(zip(metrics, [m["value"] for m in row.get("metricValues", [])])),
            }
            for row in report.get("rows", [])
        ]
        # Keep exact source rows; never call a sampled aggregate causal uplift.
        chunks = []
        chunk = []
        for row in rows:
            if len(json.dumps([row], ensure_ascii=False).encode()) > 8000:
                raise ValueError("Report row exceeds source limit")
            if len(json.dumps(chunk + [row], ensure_ascii=False).encode()) > 8000:
                chunks.append(chunk)
                chunk = []
            chunk.append(row)
        chunks.append(chunk)
        for i, chunk in enumerate(chunks):
            all_sources.append(
                {
                    "id": name + "-" + str(i),
                    "kind": "analytics_report",
                    "title": "GA4 " + name + " · " + property_id,
                    "text": json.dumps(chunk, ensure_ascii=False),
                    "sourceUrl": "https://analytics.google.com/analytics/web/#/p"
                    + property_id
                    + "/reports",
                    "metadata": {
                        "productIds": [r["itemId"] for r in chunk]
                        if name == "products"
                        else [],
                        "propertyId": property_id,
                        "report": name,
                        "dateRange": "last 30 days",
                        "rowCount": report.get("rowCount", len(rows)),
                        "truncated": report.get("rowCount", len(rows)) > len(rows),
                        "metadata": report.get("metadata", {}),
                    },
                }
            )
    current = {r["id"] for r in all_sources}
    all_sources.extend(
        {"id": r["id"], "deleted": True}
        for r in store.sources(t, "google_analytics")
        if not r.get("deleted") and r["id"] not in current
    )
    store.sources(
        t,
        "google_analytics",
        all_sources,
        expected_settings=settings,
        expected_revision=revision,
    )
    return {"reports": 2, "sourceRecords": len(all_sources)}


def slack(oauth, t, payload, settings):
    channel = payload.get("channel") or settings.get("channelId")
    if not isinstance(channel, str) or not re.fullmatch("[CG][A-Z0-9]{6,30}", channel):
        raise ValueError("Slack channel ID required")
    event = payload.get("event", {})
    order = event.get("order", {})
    number = (
        order.get("orderNumber") or event.get("orderNumber") or event.get("orderId", "")
    )
    total = (
        order.get("cart", {})
        .get("price", {})
        .get("totalPrice", event.get("totalPrice", ""))
    )
    template = payload.get("template") or settings.get(
        "template", "Order {orderNumber} · {totalPrice} EUR"
    )
    text = (
        str(template)
        .replace("{orderNumber}", str(number))
        .replace("{totalPrice}", str(total))
        .replace("{event}", str(payload.get("kind", "order.placed")))
    )
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")[:3000]
    value = request(
        endpoint("slack") + "/chat.postMessage",
        {
            "channel": channel,
            "text": text,
            "unfurl_links": False,
            "unfurl_media": False,
            "metadata": {
                "event_type": "commerce_notification",
                "event_payload": {"delivery_key": payload.get("deliveryKey", "")},
            },
        },
        oauth.token(t, "slack"),
    )
    if not value.get("ok"):
        raise ValueError(
            "Slack rejected notification: " + str(value.get("error", "unknown"))[:80]
        )
    return {"channel": value["channel"], "timestamp": value["ts"], "state": "sent"}
