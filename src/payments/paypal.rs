//! Native PayPal Orders v2 sandbox wire adapter; credentials never enter prompts or browser responses.
use super::*;
async fn access(a: &App, t: &str) -> Result<String> {
    let c = account(t)?;
    let r = a
        .http
        .post(format!("{}/v1/oauth2/token", base()?))
        .timeout(std::time::Duration::from_secs(10))
        .basic_auth(c.client, Some(c.secret))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body("grant_type=client_credentials")
        .send()
        .await
        .map_err(|_| {
            Error(
                StatusCode::BAD_GATEWAY,
                "PayPal authentication unavailable".into(),
            )
        })?;
    let v: Value = r
        .json()
        .await
        .map_err(|_| bad("Invalid PayPal authentication response"))?;
    v["access_token"].as_str().map(str::to_string).ok_or(Error(
        StatusCode::BAD_GATEWAY,
        "PayPal credentials rejected".into(),
    ))
}
pub(crate) async fn wire(
    a: &App,
    t: &str,
    method: reqwest::Method,
    path: &str,
    key: &str,
    body: Option<&Value>,
) -> Result<Value> {
    let bn = account(t)?.bn_code;
    if bn.is_empty()
        || bn.len() > 100
        || !bn.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
    {
        return Err(bad("Invalid PayPal BN code"));
    }
    let auth = access(a, t).await?;
    let mut req = a
        .http
        .request(method, format!("{}{path}", base()?))
        .timeout(std::time::Duration::from_secs(10))
        .bearer_auth(auth)
        .header("PayPal-Request-Id", &hash(key)[..38])
        .header("Prefer", "return=representation")
        .header("PayPal-Partner-Attribution-Id", bn);
    if let Some(body) = body {
        req = req.json(body);
    }
    let r = req.send().await.map_err(|_| {
        Error(
            StatusCode::BAD_GATEWAY,
            "PayPal request uncertain; worker will reconcile/retry with the same request id".into(),
        )
    })?;
    let status = r.status();
    if !status.is_success() {
        return Err(Error(
            StatusCode::BAD_GATEWAY,
            format!("PayPal rejected operation ({})", status.as_u16()),
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
    match op {
        "create" => {
            let origin = env::var("COMMERCE_PUBLIC_ORIGIN")
                .or_else(|_| env::var("PUBLIC_BASE_URL"))
                .unwrap_or("http://127.0.0.1:8787".into());
            let origin_url =
                reqwest::Url::parse(&origin).map_err(|_| bad("Invalid commerce public origin"))?;
            if environment() == "live" && origin_url.scheme() != "https" {
                return Err(bad("Live payment return URL requires HTTPS"));
            }
            let url = format!(
                "{}/?shop={}#payment/{}",
                origin.trim_end_matches('/'),
                p.tenant,
                p.id
            );
            let body = json!({"intent":"CAPTURE","purchase_units":[{"reference_id":p.id,"custom_id":p.id,"invoice_id":p.order,"amount":{"currency_code":p.currency,"value":amount_string(p.amount)}}],"payment_source":{"paypal":{"experience_context":{"user_action":"PAY_NOW","return_url":url,"cancel_url":url}}}});
            wire(
                a,
                &p.tenant,
                reqwest::Method::POST,
                "/v2/checkout/orders",
                key,
                Some(&body),
            )
            .await
        }
        "capture" | "reconcile" => {
            let id = p
                .provider_order
                .as_deref()
                .ok_or(conflict("Payment session is not ready"))?;
            if !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
                return Err(bad("Invalid provider order ID"));
            }
            let path = format!("/v2/checkout/orders/{id}");
            let current = wire(a, &p.tenant, reqwest::Method::GET, &path, key, None).await?;
            if op == "reconcile" || current["status"] == "COMPLETED" {
                return Ok(current);
            }
            if current["status"] != "APPROVED" {
                return Err(conflict("Customer must approve payment at PayPal first"));
            }
            wire(
                a,
                &p.tenant,
                reqwest::Method::POST,
                &format!("{path}/capture"),
                key,
                Some(&json!({})),
            )
            .await
        }
        "refund" => {
            if let Some(id) = sqlx::query_scalar::<_, String>(
                "SELECT provider_id FROM payment_refunds WHERE tenant=$1 AND job_id=$2",
            )
            .bind(&p.tenant)
            .bind(key)
            .fetch_optional(&a.db)
            .await?
            {
                return wire(
                    a,
                    &p.tenant,
                    reqwest::Method::GET,
                    &format!("/v2/payments/refunds/{id}"),
                    key,
                    None,
                )
                .await;
            }
            let id = p
                .capture
                .as_deref()
                .ok_or(conflict("No captured payment"))?;
            let amount = input["amountMinor"]
                .as_i64()
                .ok_or(bad("Refund amount required"))?;
            wire(
                a,
                &p.tenant,
                reqwest::Method::POST,
                &format!("/v2/payments/captures/{id}/refund"),
                key,
                Some(&json!({"amount":{"currency_code":p.currency,"value":amount_string(amount)}})),
            )
            .await
        }
        _ => Err(bad("Unsupported provider operation")),
    }
}
pub(crate) fn validate_order(p: &Attempt, v: &Value) -> Result<()> {
    let units = v["purchase_units"]
        .as_array()
        .filter(|v| v.len() == 1)
        .ok_or(bad("Provider purchase units do not match"))?;
    let u = &units[0];
    if u["custom_id"] != p.id
        || u["invoice_id"] != p.order
        || u["amount"]["currency_code"] != p.currency
        || parse_minor(u["amount"]["value"].as_str().unwrap_or(""))? != p.amount
        || p.provider_order.as_ref().is_some_and(|id| v["id"] != *id)
    {
        return Err(bad("Provider order/amount/currency binding mismatch"));
    }
    if let Some(expected) = account(&p.tenant)?.merchant
        && u["payee"]["merchant_id"] != expected
    {
        return Err(bad("Provider merchant account mismatch"));
    }
    Ok(())
}
