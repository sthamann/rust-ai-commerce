//! Compile-time mail setting types plus bounded runtime validation and write-only credentials.
use super::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Smtp,
    Resend,
    Sendgrid,
}
#[derive(Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Security {
    Starttls,
    Tls,
    TestPlain,
}
#[derive(Clone, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct Template {
    pub subject: Option<String>,
    pub text: Option<String>,
    pub html: Option<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct Settings {
    pub provider: Provider,
    pub enabled: bool,
    pub dry_run: bool,
    pub notify_orders: bool,
    pub notify_consumer_requests: bool,
    pub from_email: String,
    pub from_name: String,
    pub reply_to: String,
    pub locale: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_security: Security,
    pub smtp_username: String,
    pub region: String,
    pub templates: BTreeMap<String, Template>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            provider: Provider::Smtp,
            enabled: false,
            dry_run: true,
            notify_orders: false,
            notify_consumer_requests: true,
            from_email: String::new(),
            from_name: String::new(),
            reply_to: String::new(),
            locale: "en".into(),
            smtp_host: String::new(),
            smtp_port: 587,
            smtp_security: Security::Starttls,
            smtp_username: String::new(),
            region: "global".into(),
            templates: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct Credentials {
    pub api_key: String,
    pub smtp_password: String,
}
pub fn address(raw: &str) -> Result<String> {
    let regex=regex::Regex::new(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$").unwrap();
    checked(
        raw.len() <= 254 && regex.is_match(raw),
        "Invalid email address",
    )?;
    Ok(raw.into())
}
pub fn parse(value: &Value) -> Result<Settings> {
    let s: Settings = serde_json::from_value(value.clone())
        .map_err(|_| Error::Invalid("Unknown or incorrectly typed email setting"))?;
    for v in [
        &s.from_email,
        &s.from_name,
        &s.reply_to,
        &s.locale,
        &s.smtp_host,
        &s.smtp_username,
        &s.region,
    ] {
        checked(
            v.len() <= 254 && !v.contains(['\r', '\n', '\0']),
            "Invalid email setting text",
        )?;
    }
    checked(
        ["en", "de", "fr", "es"].contains(&s.locale.as_str())
            && ["global", "eu"].contains(&s.region.as_str())
            && s.smtp_port > 0,
        "Unknown locale, region or port",
    )?;
    for v in [&s.from_email, &s.reply_to] {
        if !v.is_empty() {
            address(v)?;
        }
    }
    checked(
        s.smtp_host.is_empty()
            || regex::Regex::new(r"^[a-zA-Z0-9.-]{1,253}$")
                .unwrap()
                .is_match(&s.smtp_host),
        "Invalid SMTP hostname",
    )?;
    for (locale, t) in &s.templates {
        checked(
            ["en", "de", "fr", "es"].contains(&locale.as_str()),
            "Invalid template language",
        )?;
        for v in [&t.subject, &t.text, &t.html].into_iter().flatten() {
            checked(v.len() <= 12000, "Mail template exceeds limit")?;
        }
        checked(
            t.subject
                .as_ref()
                .is_none_or(|v| !v.contains(['\r', '\n', '\0'])),
            "Invalid mail subject",
        )?;
    }
    Ok(s)
}
pub fn credentials(value: &Value) -> Result<Credentials> {
    serde_json::from_value(value.clone())
        .map_err(|_| Error::Invalid("Invalid encrypted credentials"))
}
pub fn configured(s: &Settings, c: &Credentials) -> bool {
    !s.from_email.is_empty()
        && if s.provider == Provider::Smtp {
            !s.smtp_host.is_empty()
        } else {
            !c.api_key.is_empty()
        }
}
pub async fn public(store: &Store, t: &str) -> Result<Value> {
    let v = store.get(t, "email").await?;
    let s = parse(&v["settings"])?;
    let c = credentials(v.get("credentials").unwrap_or(&json!({})))?;
    Ok(
        json!({"revision":v["revision"],"settings":s,"connected":configured(&s,&c),"credentialsConfigured":{"apiKey":!c.api_key.is_empty(),"smtpPassword":!c.smtp_password.is_empty()},"smtpHostApprovalRequired":true,"jobs":store.jobs(t,"email").await?}),
    )
}
pub async fn configure(store: &Store, t: &str, v: &Value) -> Result<Value> {
    let s = parse(&v["settings"])?;
    let changes = v.get("credentials").cloned().unwrap_or(json!({}));
    let _ = credentials(&changes)?;
    for c in changes
        .as_object()
        .ok_or(Error::Invalid("Credential object required"))?
        .values()
    {
        checked(
            c.as_str()
                .is_some_and(|s| s.len() <= 4000 && !s.contains(['\r', '\n', '\0'])),
            "Invalid mail credential",
        )?;
    }
    if s.enabled && !s.dry_run && s.provider == Provider::Smtp {
        smtp::target(&s).await?;
    }
    let mut tx = store.tx(t).await?;
    store.lock(&mut tx, t, "email").await?;
    let mut current = store.get_tx(&mut tx, t, "email").await?;
    if current["revision"] != v["revision"] {
        return Err(Error::Conflict);
    }
    let old = parse(&current["settings"])?;
    let mut c = credentials(current.get("credentials").unwrap_or(&json!({})))?;
    if old.provider != s.provider {
        c.api_key.clear();
    }
    if old.smtp_host != s.smtp_host || old.smtp_username != s.smtp_username {
        c.smtp_password.clear();
    }
    if changes.get("apiKey").is_some() {
        c.api_key = text(&changes, "apiKey");
    }
    if changes.get("smtpPassword").is_some() {
        c.smtp_password = text(&changes, "smtpPassword");
    }
    if s.enabled && !s.dry_run {
        checked(
            configured(&s, &c),
            "Sender and provider credentials required",
        )?;
        checked(
            s.provider != Provider::Smtp
                || s.smtp_username.is_empty()
                || !c.smtp_password.is_empty(),
            "SMTP password required",
        )?;
    }
    current["settings"] = serde_json::to_value(s).unwrap();
    current["credentials"] = serde_json::to_value(c).unwrap();
    current["revision"] = json!(current["revision"].as_u64().unwrap_or(0) + 1);
    store.save(&mut tx, t, "email", &current).await?;
    tx.commit().await?;
    public(store, t).await
}
