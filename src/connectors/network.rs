//! Fixed provider endpoints, no redirects, bounded response streaming and loopback-only fixture overrides.
use super::*;
pub fn endpoint(name: &str) -> Result<String> {
    let overrides: Value =
        serde_json::from_str(&env::var("CONNECTOR_TEST_ENDPOINTS").unwrap_or("{}".into()))
            .map_err(|_| Error::Invalid("Invalid fixture endpoints"))?;
    if let Some(s) = overrides[name].as_str() {
        let url = reqwest::Url::parse(s).map_err(|_| Error::Invalid("Invalid fixture URL"))?;
        checked(
            url.scheme() == "http"
                && ["127.0.0.1", "localhost"].contains(&url.host_str().unwrap_or(""))
                && url.username().is_empty()
                && url.password().is_none(),
            "Fixture endpoint must be loopback",
        )?;
        return Ok(s.into());
    }
    Ok(match name {
        "resend" => "https://api.resend.com",
        "sendgrid" => "https://api.sendgrid.com/v3",
        "sendgrid_eu" => "https://api.eu.sendgrid.com/v3",
        "google_authorize" => "https://accounts.google.com/o/oauth2/v2/auth",
        "google_token" => "https://oauth2.googleapis.com/token",
        "google_revoke" => "https://oauth2.googleapis.com/revoke",
        "gmail" => "https://gmail.googleapis.com/gmail/v1",
        "analytics" => "https://analyticsdata.googleapis.com/v1beta",
        "slack_authorize" => "https://slack.com/oauth/v2/authorize",
        "slack_token" => "https://slack.com/api/oauth.v2.access",
        "slack" => "https://slack.com/api",
        _ => return Err(Error::Invalid("Unknown provider")),
    }
    .into())
}
pub fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .no_proxy()
        .build()
        .map_err(Into::into)
}
pub async fn bytes(mut r: reqwest::Response, limit: usize) -> Result<Vec<u8>> {
    checked(
        r.content_length().is_none_or(|n| n <= limit as u64),
        "Provider response exceeds limit",
    )?;
    let mut data = vec![];
    while let Some(chunk) = r.chunk().await? {
        checked(
            data.len() + chunk.len() <= limit,
            "Provider response exceeds limit",
        )?;
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}
pub async fn response(r: reqwest::Response) -> Result<Value> {
    let code = r.status().as_u16();
    if !(200..300).contains(&code) {
        let retry = r
            .headers()
            .get("retry-after")
            .and_then(|x| x.to_str().ok())
            .and_then(|x| x.parse::<u64>().ok())
            .unwrap_or(30)
            .clamp(1, 3600);
        return Err(Error::Http(code, retry));
    }
    let raw = bytes(r, 524288).await?;
    if raw.is_empty() {
        Ok(json!({}))
    } else {
        serde_json::from_slice(&raw).map_err(|_| Error::Invalid("Invalid provider response"))
    }
}
pub async fn request(
    url: &str,
    body: Option<&Value>,
    token: Option<&str>,
    form: bool,
) -> Result<Value> {
    let client = client()?;
    let mut req = if body.is_some() {
        client.post(url)
    } else {
        client.get(url)
    };
    if let Some(body) = body {
        req = if form { req.form(body) } else { req.json(body) };
    }
    if let Some(token) = token {
        req = req.bearer_auth(token);
    }
    response(req.send().await?).await
}
