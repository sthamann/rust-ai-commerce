//! Single-use tenant/app-bound OAuth state, PKCE, encrypted tokens and serialized refresh/disconnect.
use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sha2::{Digest, Sha256};
fn client(a: &str) -> Result<(String, String)> {
    let prefix = if a == "slack" { "SLACK" } else { "GOOGLE" };
    let id = env::var(format!("{prefix}_CLIENT_ID")).unwrap_or_default();
    let secret = env::var(format!("{prefix}_CLIENT_SECRET")).unwrap_or_default();
    checked(
        !id.is_empty() && !secret.is_empty(),
        "Operator OAuth client not configured",
    )?;
    Ok((id, secret))
}
fn callback() -> Result<String> {
    let base = env::var("CONNECTOR_PUBLIC_URL")
        .map_err(|_| Error::Invalid("Public callback URL required"))?;
    let parsed = reqwest::Url::parse(&base).map_err(|_| Error::Invalid("Invalid callback URL"))?;
    checked(
        parsed.scheme() == "https"
            || parsed.scheme() == "http"
                && ["localhost", "127.0.0.1"].contains(&parsed.host_str().unwrap_or("")),
        "OAuth callback requires HTTPS",
    )?;
    Ok(format!("{}/oauth/callback", base.trim_end_matches('/')))
}
fn scope(a: &str) -> &'static str {
    match a {
        "slack" => "chat:write,channels:read,groups:read",
        "gmail" => "https://www.googleapis.com/auth/gmail.readonly",
        _ => "https://www.googleapis.com/auth/analytics.readonly",
    }
}
fn random() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
fn expires(tokens: &mut Value) {
    tokens["expires_at"] =
        json!(chrono::Utc::now().timestamp() + tokens["expires_in"].as_i64().unwrap_or(3600));
}
pub async fn start(store: &Store, t: &str, a: &str) -> Result<Value> {
    let (id, _) = client(a)?;
    let verifier = random();
    let state = random();
    let mut tx = store.tx(t).await?;
    store.lock(&mut tx, t, a).await?;
    let current = store.get_tx(&mut tx, t, a).await?;
    sqlx::query("INSERT INTO connector_oauth(digest,tenant,app,data,expires_at) VALUES($1,$2,$3,$4,now()+interval '600 seconds')").bind(digest(state.as_bytes())).bind(t).bind(a).bind(store.crypto.seal(t,a,&json!({"verifier":verifier,"revision":current["revision"]}))?).execute(&mut *tx).await?;
    tx.commit().await?;
    let mut url = reqwest::Url::parse(&network::endpoint(if a == "slack" {
        "slack_authorize"
    } else {
        "google_authorize"
    })?)
    .map_err(|_| Error::Database)?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs
            .append_pair("client_id", &id)
            .append_pair("redirect_uri", &callback()?)
            .append_pair("state", &state)
            .append_pair("scope", scope(a));
        if a != "slack" {
            pairs
                .append_pair("response_type", "code")
                .append_pair("access_type", "offline")
                .append_pair("prompt", "consent")
                .append_pair("code_challenge_method", "S256")
                .append_pair(
                    "code_challenge",
                    &URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())),
                );
        }
    }
    Ok(json!({"authorizationUrl":url.as_str()}))
}
pub async fn complete(store: &Store, state: &str, code: &str) -> Result<String> {
    checked(
        state.len() <= 200 && code.len() <= 4000 && !code.is_empty(),
        "Invalid authorization response",
    )?;
    let mut tx = store.system().await?;
    let row=sqlx::query("DELETE FROM connector_oauth WHERE digest=$1 RETURNING tenant,app,data,expires_at>now() AS fresh").bind(digest(state.as_bytes())).fetch_optional(&mut *tx).await?;
    tx.commit().await?;
    let row = row.ok_or(Error::Invalid("OAuth state invalid or expired"))?;
    checked(row.get("fresh"), "OAuth state expired")?;
    let t: String = row.get("tenant");
    let a: String = row.get("app");
    let pending = store.crypto.open(&t, &a, &row.get::<Vec<u8>, _>("data"))?;
    let (id, secret) = client(&a)?;
    let mut body =
        json!({"client_id":id,"client_secret":secret,"code":code,"redirect_uri":callback()?});
    if a != "slack" {
        body["grant_type"] = json!("authorization_code");
        body["code_verifier"] = pending["verifier"].clone();
    }
    let mut tokens = network::request(
        &network::endpoint(if a == "slack" {
            "slack_token"
        } else {
            "google_token"
        })?,
        Some(&body),
        None,
        true,
    )
    .await?;
    checked(
        tokens["access_token"].is_string() && (a != "slack" || tokens["ok"] == true),
        "Provider authorization rejected",
    )?;
    let granted = text(&tokens, "scope");
    checked(
        if a == "slack" {
            granted.split(',').any(|s| s == "chat:write")
        } else {
            granted.split_whitespace().any(|s| s == scope(&a))
        },
        "Required provider scope was not granted",
    )?;
    checked(
        a == "slack" || tokens["refresh_token"].is_string(),
        "Offline access missing; reconnect with consent",
    )?;
    expires(&mut tokens);
    let mut tx = store.tx(&t).await?;
    store.lock(&mut tx, &t, &a).await?;
    let mut current = store.get_tx(&mut tx, &t, &a).await?;
    if current["revision"] != pending["revision"] {
        return Err(Error::Conflict);
    }
    current["tokens"] = tokens;
    current["revision"] = json!(current["revision"].as_u64().unwrap_or(0) + 1);
    store.save(&mut tx, &t, &a, &current).await?;
    tx.commit().await?;
    Ok(a)
}
pub async fn token(store: &Store, t: &str, a: &str) -> Result<String> {
    let mut tx = store.tx(t).await?;
    store.lock(&mut tx, t, a).await?;
    let mut current = store.get_tx(&mut tx, t, a).await?;
    let tokens = &mut current["tokens"];
    checked(
        tokens["access_token"].is_string(),
        "Connect this provider account first",
    )?;
    if a != "slack"
        && tokens["expires_at"].as_i64().unwrap_or(0) < chrono::Utc::now().timestamp() + 60
    {
        checked(
            tokens["refresh_token"].is_string(),
            "Reconnect account to refresh access",
        )?;
        let (id, secret) = client(a)?;
        let fresh=network::request(&network::endpoint("google_token")?,Some(&json!({"client_id":id,"client_secret":secret,"refresh_token":tokens["refresh_token"],"grant_type":"refresh_token"})),None,true).await?;
        checked(
            fresh["access_token"].is_string(),
            "Provider refresh rejected",
        )?;
        for (key, v) in fresh
            .as_object()
            .ok_or(Error::Invalid("Invalid refresh response"))?
        {
            tokens[key] = v.clone();
        }
        expires(tokens);
        store.save(&mut tx, t, a, &current).await?;
    }
    let token = text(&current["tokens"], "access_token");
    tx.commit().await?;
    Ok(token)
}
pub async fn disconnect(store: &Store, t: &str, a: &str) -> Result<Value> {
    let mut tx = store.tx(t).await?;
    store.lock(&mut tx, t, a).await?;
    let mut current = store.get_tx(&mut tx, t, a).await?;
    let tokens = &current["tokens"];
    if let Some(token) = tokens["access_token"].as_str() {
        if a == "slack" {
            network::request(
                &format!("{}/auth.revoke", network::endpoint("slack")?),
                Some(&json!({})),
                Some(token),
                false,
            )
            .await?;
        } else {
            network::request(
                &network::endpoint("google_revoke")?,
                Some(&json!({"token":tokens["refresh_token"].as_str().unwrap_or(token)})),
                None,
                true,
            )
            .await?;
        }
    }
    current.as_object_mut().unwrap().remove("tokens");
    current.as_object_mut().unwrap().remove("historyId");
    current["revision"] = json!(current["revision"].as_u64().unwrap_or(0) + 1);
    store.save(&mut tx, t, a, &current).await?;
    let cursor = store.purge(&mut tx, t, a).await?;
    tx.commit().await?;
    Ok(json!({"disconnected":true,"purgeSources":true,"exportCursor":cursor}))
}
