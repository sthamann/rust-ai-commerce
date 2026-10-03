"""Fixed provider endpoints; bounded requests and sanitized failures, without token logging."""

import json, os, urllib.request, urllib.parse, urllib.error

URLS = {
    "resend": "https://api.resend.com",
    "sendgrid": "https://api.sendgrid.com/v3",
    "sendgrid_eu": "https://api.eu.sendgrid.com/v3",
    "google_authorize": "https://accounts.google.com/o/oauth2/v2/auth",
    "google_token": "https://oauth2.googleapis.com/token",
    "google_revoke": "https://oauth2.googleapis.com/revoke",
    "gmail": "https://gmail.googleapis.com/gmail/v1",
    "analytics": "https://analyticsdata.googleapis.com/v1beta",
    "slack_authorize": "https://slack.com/oauth/v2/authorize",
    "slack_token": "https://slack.com/api/oauth.v2.access",
    "slack": "https://slack.com/api",
}


class WireError(Exception):
    def __init__(self, status, retry=0):
        self.status = status
        self.retry = retry
        super().__init__("Provider request failed")


def endpoint(name):
    overrides = json.loads(os.getenv("CONNECTOR_TEST_ENDPOINTS", "{}"))
    if name in overrides:
        parsed = urllib.parse.urlsplit(overrides[name])
        if parsed.scheme != "http" or parsed.hostname not in ["127.0.0.1", "localhost"]:
            raise ValueError("Fixture endpoint must be loopback")
        return overrides[name]
    return URLS[name]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("Provider redirect refused")


def request(url, body=None, token=None, form=False, method=None):
    raw = (
        None
        if body is None
        else (
            urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
        )
    )
    headers = {"Accept": "application/json"}
    if raw is not None:
        headers["Content-Type"] = (
            "application/x-www-form-urlencoded" if form else "application/json"
        )
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=raw, headers=headers, method=method)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=8) as r:
            data = r.read(524289)
    except urllib.error.HTTPError as e:
        raise WireError(
            e.code, min(3600, max(1, int(e.headers.get("Retry-After", "1"))))
        ) from None
    if len(data) > 524288:
        raise ValueError("Provider response exceeds limit")
    return json.loads(data) if data else {}
