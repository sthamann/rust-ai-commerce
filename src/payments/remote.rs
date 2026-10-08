//! Dedicated payment RPC, pinned service version and operator-owned egress; never ordinary app-action receipts.
use super::{Attempt, return_urls};
use crate::{App, Error, Result, StatusCode, Value, bad, http_limits, json};

pub(crate) fn config(provider: &str, version: &str, environment: &str) -> Result<Value> {
    let all = &crate::runtime_config::get().payment_services;
    // Keep environments side by side so switching a channel to live does not strand sandbox receipts.
    let version = &all[provider][version];
    let c = if version[environment].is_object() {
        version[environment].clone()
    } else {
        version.clone()
    };
    validate_service(&c, environment)?;
    Ok(c)
}
pub(crate) fn validate_service(c: &Value, environment: &str) -> Result<()> {
    let url = reqwest::Url::parse(c["url"].as_str().ok_or(Error(
        StatusCode::SERVICE_UNAVAILABLE,
        "Payment service version unavailable".into(),
    ))?)
    .map_err(|_| bad("Invalid payment service URL"))?;
    let fixture = url.scheme() == "http"
        && ["127.0.0.1", "localhost"].contains(&url.host_str().unwrap_or(""));
    if !["sandbox", "live", "contract-fixture"].contains(&environment)
        || (!fixture && url.scheme() != "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || c["environment"] != environment
        || (fixture && environment != "contract-fixture")
        || c["token"].as_str().is_none_or(|v| v.len() < 24)
    {
        return Err(bad(
            "Payment service requires matching environment, HTTPS and a private credential",
        ));
    }
    Ok(())
}
pub(crate) async fn call(
    a: &App,
    t: &str,
    provider: &str,
    version: &str,
    environment: &str,
    path: &str,
    body: &Value,
) -> Result<Value> {
    if crate::staging::parent(a, t).await?.is_some() {
        return Err(bad("External payments are disabled in private sandboxes"));
    }
    let c = config(provider, version, environment)?;
    let _cluster =
        crate::performance::cluster_lease::Lease::acquire(a, t, "payment-provider", 8).await?;
    let _permit = a.app_limits.enter(t, provider)?;
    if body.to_string().len() > 65536 {
        return Err(bad("Payment request exceeds limit"));
    }
    // The shared client disables redirects and reuses its connection pool.
    let r = a
        .http
        .post(format!(
            "{}/v1/{path}",
            c["url"].as_str().unwrap().trim_end_matches('/')
        ))
        .timeout(std::time::Duration::from_secs(15))
        .bearer_auth(c["token"].as_str().unwrap())
        .header("x-tenant", t)
        .json(body)
        .send()
        .await
        .map_err(|_| {
            Error(
                StatusCode::BAD_GATEWAY,
                "Payment service outcome uncertain; reconcile with the same request key".into(),
            )
        })?;
    if !r.status().is_success() {
        return Err(Error(
            StatusCode::BAD_GATEWAY,
            "Payment service rejected operation".into(),
        ));
    }
    http_limits::json_body(r).await
}
pub(crate) async fn execute(
    a: &App,
    p: &Attempt,
    op: &str,
    key: &str,
    input: &Value,
) -> Result<Value> {
    let mut order: Value = sqlx::query_scalar("SELECT data FROM orders WHERE tenant=$1 AND id=$2")
        .bind(&p.tenant)
        .bind(&p.order)
        .fetch_one(&a.db)
        .await?;
    if let Some(c) = order["cart"].as_object_mut() {
        c.remove("token");
    }
    let (return_url, cancel_url) = if let Some(origin) = p.context["returnOrigin"].as_str() {
        return_urls::build(
            origin,
            &p.tenant,
            p.context["channel"].as_str().unwrap_or("default"),
            &p.id,
            p.environment == "live",
        )?
    } else {
        return_urls::urls(
            &p.tenant,
            p.context["channel"].as_str().unwrap_or("default"),
            &p.id,
            p.environment == "live",
        )?
    };
    let body = json!({"apiVersion":"1","provider":p.provider,"adapterVersion":p.adapter_version,"tenant":p.tenant,"attemptId":p.id,"orderId":p.order,"environment":p.environment,"accountRef":p.context["accountRef"],"method":p.context["method"],"intent":p.context["intent"],"amountMinor":p.amount,"currency":p.currency,"currencyScale":p.currency_scale,"reference":p.provider_order,"captureId":p.capture,"context":p.context,"operation":op,"requestKey":key,"input":input,"order":order,"returnUrl":return_url,"cancelUrl":cancel_url});
    call(
        a,
        &p.tenant,
        &p.provider,
        &p.adapter_version,
        &p.environment,
        "payments/execute",
        &body,
    )
    .await
}
pub(crate) fn approval_url(p: &Attempt, value: &Value) -> Result<Option<String>> {
    let Some(s) = value.as_str() else {
        if value.is_null() {
            return Ok(None);
        }
        return Err(bad("Invalid approval URL"));
    };
    let u = reqwest::Url::parse(s).map_err(|_| bad("Invalid provider approval URL"))?;
    let c = config(&p.provider, &p.adapter_version, &p.environment)?;
    if u.scheme() != "https"
        || !u.username().is_empty()
        || u.password().is_some()
        || !c["approvalOrigins"].as_array().is_some_and(|origins| {
            origins
                .iter()
                .any(|v| v.as_str() == Some(u.origin().ascii_serialization().as_str()))
        })
    {
        return Err(bad("Provider approval origin is not authorized"));
    }
    Ok(Some(s.into()))
}
