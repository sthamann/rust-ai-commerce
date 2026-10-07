"""Server-side Google/Slack OAuth; single-use tenant-bound state and refreshed private tokens."""

import base64, hashlib, os, secrets, time, urllib.parse
from transport import endpoint, request

SCOPES = {
    "gmail": "https://www.googleapis.com/auth/gmail.readonly",
    "google_analytics": "https://www.googleapis.com/auth/analytics.readonly",
    "slack": "chat:write,channels:read,groups:read",
}


class OAuth:
    def __init__(self, store):
        self.store = store

    def client(self, app):
        prefix = "SLACK" if app == "slack" else "GOOGLE"
        client = os.getenv(prefix + "_CLIENT_ID", "")
        secret = os.getenv(prefix + "_CLIENT_SECRET", "")
        if not client or not secret:
            raise ValueError("Operator OAuth client not configured")
        return client, secret

    def callback(self):
        base = os.environ["CONNECTOR_PUBLIC_URL"].rstrip("/")
        parsed = urllib.parse.urlsplit(base)
        if parsed.scheme != "https" and not (
            parsed.scheme == "http" and parsed.hostname in ["127.0.0.1", "localhost"]
        ):
            raise ValueError("OAuth callback requires HTTPS")
        return base + "/oauth/callback"

    def start(self, t, a):
        client, _ = self.client(a)
        verifier = secrets.token_urlsafe(64)
        state = self.store.state(t, a, verifier)
        params = {
            "client_id": client,
            "redirect_uri": self.callback(),
            "state": state,
            "scope": SCOPES[a],
        }
        if a != "slack":
            params.update(
                response_type="code",
                access_type="offline",
                prompt="consent",
                code_challenge_method="S256",
                code_challenge=base64.urlsafe_b64encode(
                    hashlib.sha256(verifier.encode()).digest()
                )
                .decode()
                .rstrip("="),
            )
        return {
            "authorizationUrl": endpoint(
                "slack_authorize" if a == "slack" else "google_authorize"
            )
            + "?"
            + urllib.parse.urlencode(params)
        }

    def callback_result(self, state, code):
        t, a, pending = self.store.consume(state)
        verifier = pending["verifier"]
        client, secret = self.client(a)
        body = {
            "client_id": client,
            "client_secret": secret,
            "code": code,
            "redirect_uri": self.callback(),
        }
        if a != "slack":
            body.update(grant_type="authorization_code", code_verifier=verifier)
        tokens = request(
            endpoint("slack_token" if a == "slack" else "google_token"), body, form=True
        )
        if a == "slack" and not tokens.get("ok"):
            raise ValueError("Slack authorization rejected")
        if not tokens.get("access_token"):
            raise ValueError("Provider returned no access token")
        granted = tokens.get("scope", "")
        if a != "slack" and SCOPES[a] not in granted.split():
            raise ValueError("Required provider scope was not granted")
        if a == "slack" and "chat:write" not in granted.split(","):
            raise ValueError("Slack writing scope was not granted")
        tokens["expires_at"] = time.time() + tokens.get("expires_in", 3600)

        def change(v):
            if v["revision"] != pending["revision"]:
                raise ValueError("Connection changed during authorization; start again")
            if a != "slack" and not tokens.get("refresh_token"):
                raise ValueError(
                    "Offline provider access missing; reconnect with consent"
                )
            v["tokens"] = tokens
            v["revision"] += 1

        self.store.update(t, a, change)
        return a

    def token(self, t, a):
        v = self.store.get(t, a)
        tokens = v.get("tokens", {})
        if not tokens.get("access_token"):
            raise ValueError("Connect this provider account first")
        if a != "slack" and tokens.get("expires_at", 0) < time.time() + 60:
            if not tokens.get("refresh_token"):
                raise ValueError("Reconnect account to refresh access")
            client, secret = self.client(a)
            new = request(
                endpoint("google_token"),
                {
                    "client_id": client,
                    "client_secret": secret,
                    "refresh_token": tokens["refresh_token"],
                    "grant_type": "refresh_token",
                },
                form=True,
            )
            if not new.get("access_token"):
                raise ValueError("Provider refresh rejected")
            tokens.update(new)
            tokens["expires_at"] = time.time() + new.get("expires_in", 3600)

            def refreshed(v):
                if v.get("tokens", {}).get("refresh_token") != tokens["refresh_token"]:
                    raise ValueError("Connection changed during refresh")
                v["tokens"] = tokens

            self.store.update(t, a, refreshed)
        return tokens["access_token"]

    def disconnect(self, t, a):
        v = self.store.get(t, a)
        tokens = v.get("tokens", {})
        if tokens.get("access_token"):
            if a == "slack":
                request(endpoint("slack") + "/auth.revoke", {}, tokens["access_token"])
            else:
                request(
                    endpoint("google_revoke"),
                    {"token": tokens.get("refresh_token") or tokens["access_token"]},
                    form=True,
                )

        def change(v):
            v.pop("tokens", None)
            v.pop("historyId", None)
            v["revision"] += 1

        self.store.update(t, a, change)
        return {"disconnected": True}
