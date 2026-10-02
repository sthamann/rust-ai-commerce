#!/usr/bin/env python3
"""Separate app process with provider OAuth, encrypted persistence and durable jobs; no core provider code."""

import hmac, json, os, re, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from store import Store
from oauth import OAuth
from transport import WireError, endpoint, request
import providers
from callback_page import render

APPS = {"google_analytics", "gmail", "slack"}


class Connector:
    def __init__(self):
        self.store = Store(
            os.environ["CONNECTOR_DATABASE"], os.environ["CONNECTOR_SECRET_KEY"]
        )
        self.oauth = OAuth(self.store)
        self.store.recover()
        self.token = os.environ["CONNECTOR_GATEWAY_TOKEN"]
        if len(self.token) < 32:
            raise ValueError("Strong connector gateway token required")

    def public(self, t, a):
        v = self.store.get(t, a)
        return {
            "connected": bool(v.get("tokens")),
            "revision": v["revision"],
            "settings": v["settings"],
            "jobs": self.store.jobs(t, a),
            "oauthClientConfigured": bool(
                os.getenv(("SLACK" if a == "slack" else "GOOGLE") + "_CLIENT_ID")
                and os.getenv(
                    ("SLACK" if a == "slack" else "GOOGLE") + "_CLIENT_SECRET"
                )
            ),
        }

    def action(self, t, a, name, v):
        if name == "status":
            return self.public(t, a)
        if name == "connect":
            return self.oauth.start(t, a)
        if name == "disconnect":
            result = self.oauth.disconnect(t, a)
            cursor = self.store.purge(t, a)
            return {**result, "purgeSources": True, "exportCursor": cursor}
        if name == "configure":
            settings = v["settings"]
            if not isinstance(settings, dict):
                raise ValueError("Settings must be an object")
            allowed = {
                "google_analytics": {"measurementId", "propertyId", "salesChannel"},
                "gmail": {"labelId"},
                "slack": {"channelId", "notifyOrders", "template"},
            }[a]
            if set(settings) - allowed:
                raise ValueError("Unknown connector setting")
            if (
                a == "google_analytics"
                and settings.get("measurementId")
                and not re.fullmatch("G-[A-Z0-9]{4,20}", settings["measurementId"])
            ):
                raise ValueError("Invalid GA4 measurement ID")
            if any(
                not isinstance(value, bool if key == "notifyOrders" else str)
                for key, value in settings.items()
            ):
                raise ValueError("Connector setting type invalid")
            if (
                a == "google_analytics"
                and settings.get("propertyId")
                and not settings["propertyId"].isdecimal()
            ):
                raise ValueError("Numeric GA4 property ID required")
            if (
                a == "slack"
                and settings.get("channelId")
                and not re.fullmatch("[CG][A-Z0-9]{6,30}", settings["channelId"])
            ):
                raise ValueError("Invalid Slack channel ID")
            if (
                a == "slack"
                and "notifyOrders" in settings
                and not isinstance(settings["notifyOrders"], bool)
            ):
                raise ValueError("Notification switch must be boolean")
            if len(json.dumps(settings)) > 4000:
                raise ValueError("Connector configuration exceeds limit")
            self.store.configure(t, a, settings, v["revision"])
            return self.public(t, a)
        if name == "tracking":
            settings = self.store.get(t, a)["settings"]
            measurement = settings.get("measurementId")
            channel = settings.get("salesChannel", "")
            return {
                "measurementId": measurement
                if not channel or channel == v.get("salesChannel")
                else None,
                "enabled": bool(measurement),
            }
        if name == "sync":
            return self.store.enqueue(t, a, v["requestKey"], {"operation": "sync"})
        if name == "channels" and a == "slack":
            value = request(
                endpoint("slack")
                + "/conversations.list?exclude_archived=true&limit=200&types=public_channel,private_channel",
                token=self.oauth.token(t, a),
            )
            if not value.get("ok"):
                raise ValueError("Slack channel listing rejected")
            return {
                "channels": [
                    {
                        "id": c["id"],
                        "name": c["name"],
                        "member": c.get("is_member", False),
                    }
                    for c in value.get("channels", [])
                ]
            }
        if name == "labels" and a == "gmail":
            return request(
                endpoint("gmail") + "/users/me/labels", token=self.oauth.token(t, a)
            )
        if name == "post_order" and a == "slack":
            return self.store.enqueue(
                t,
                a,
                v["requestKey"],
                {
                    "operation": "post",
                    "channel": v.get("channel"),
                    "template": v.get("template"),
                    "event": v.get("event", {}),
                    "kind": v.get("kind", "order.placed"),
                    "deliveryKey": v["requestKey"],
                },
            )
        raise ValueError("Unknown connector action")

    def handle(self, t, a, path, v):
        if a not in APPS or not re.fullmatch("[a-zA-Z0-9_-]{1,100}", t):
            raise ValueError("Invalid app or shop")
        if path.startswith("actions/"):
            return self.action(t, a, path[8:], v)
        if path == "exports":
            return self.store.exports(t, a, max(0, int(v.get("cursor", 0))))
        if path == "events":
            if (
                a == "slack"
                and self.store.get(t, a)["settings"].get("notifyOrders")
                and v.get("kind") == "order.placed"
            ):
                return self.action(
                    t,
                    a,
                    "post_order",
                    {
                        "requestKey": v["idempotencyKey"],
                        "event": v.get("data", {}),
                        "kind": v["kind"],
                    },
                )
            return {"ignored": True}
        raise ValueError("Unknown app endpoint")

    def once(self, app=None):
        job = self.store.claim(app)
        if not job:
            return
        t = job["tenant"]
        a = job["app"]
        payload = self.store.open(t, a, job["payload"])
        settings = self.store.get(t, a)["settings"]
        try:
            value = (
                providers.slack(self.oauth, t, payload, settings)
                if a == "slack"
                else providers.gmail(self.store, self.oauth, t, settings)
                if a == "gmail"
                else providers.analytics(self.store, self.oauth, t, settings)
            )
            self.store.finish(job, "completed", value)
        except WireError as e:
            # A rate-limit response explicitly means this call was rejected; safe to schedule again.
            self.store.finish(
                job,
                "queued"
                if e.status == 429 and job["attempts"] < 8
                else "uncertain"
                if a == "slack" and e.status >= 500
                else "failed",
                {"error": "Provider HTTP " + str(e.status)},
                e.retry,
            )
        except (TimeoutError, OSError):
            self.store.finish(
                job,
                "uncertain",
                {"error": "Provider outcome not confirmed; no automatic resend"},
            )
        except Exception:
            self.store.finish(
                job,
                "failed",
                {
                    "error": "Provider operation rejected; verify connection and settings"
                },
            )

    def loop(self, app=None, stop_event=None):
        # Cooperative stop lets an owner join active writers before removing private state.
        stop_event = stop_event or threading.Event()
        while not stop_event.is_set():
            try:
                self.once(app)
            except Exception:
                pass
            stop_event.wait(0.25)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # OAuth callback codes and mailbox contents must never enter access logs.

    def send(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def completion(self, success, value):
        if "text/html" not in self.headers.get("Accept", ""):
            return self.send(200 if success else 400, value)
        body = render(self.headers.get("Accept-Language", "en"), success)
        self.send_response(200 if success else 400)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        query = urllib.parse.urlsplit(self.path)
        if query.path != "/oauth/callback":
            return self.send(404, {"error": "Not found"})
        args = urllib.parse.parse_qs(query.query)
        try:
            app = self.server.connector.oauth.callback_result(
                args.get("state", [""])[0], args.get("code", [""])[0]
            )
            self.completion(
                True,
                {
                    "connected": app,
                    "message": "Connected. Return to Commerce Studio and refresh the app.",
                },
            )
        except Exception:
            self.completion(
                False,
                {
                    "error": "Authorization failed or expired. Start again in Commerce Studio."
                },
            )

    def do_POST(self):
        if not hmac.compare_digest(
            self.headers.get("Authorization", ""),
            "Bearer " + self.server.connector.token,
        ):
            return self.send(401, {"error": "Unauthorized"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            if not 0 < n <= 65536:
                raise ValueError("Invalid request size")
            app, path = self.path.lstrip("/").split("/", 1)
            v = json.loads(self.rfile.read(n))
            result = self.server.connector.handle(
                self.headers.get("x-tenant", ""), app, path, v
            )
            self.send(200, result)
        except ValueError as e:
            self.send(400, {"error": str(e)[:120]})
        except Exception:
            self.send(
                502,
                {"error": "Provider unavailable or connector configuration incomplete"},
            )


def start():
    connector = Connector()
    server = ThreadingHTTPServer(
        (
            os.getenv("CONNECTOR_BIND", "127.0.0.1"),
            int(os.getenv("CONNECTOR_PORT", "8797")),
        ),
        Handler,
    )
    server.connector = connector
    # A long mailbox import must not hold up Slack order notifications.
    for app in sorted(APPS):
        threading.Thread(target=connector.loop, args=(app,), daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    start()
