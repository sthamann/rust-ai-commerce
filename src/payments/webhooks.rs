//! PayPal verifies webhook signatures before inbox insertion; provider reconciliation confirms monetary state.
use super::*;
pub(crate) async fn webhook(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let c = account(&t)?;
    if c.webhook.is_empty() {
        return Err(Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "PayPal webhook ID is not configured".into(),
        ));
    }
    let body = json!({"auth_algo":header(&h,"paypal-auth-algo").ok_or(bad("Signature header missing"))?,"cert_url":header(&h,"paypal-cert-url").ok_or(bad("Certificate header missing"))?,"transmission_id":header(&h,"paypal-transmission-id").ok_or(bad("Transmission header missing"))?,"transmission_sig":header(&h,"paypal-transmission-sig").ok_or(bad("Signature missing"))?,"transmission_time":header(&h,"paypal-transmission-time").ok_or(bad("Timestamp missing"))?,"webhook_id":c.webhook,"webhook_event":v});
    let checked = paypal::wire(
        &a,
        &t,
        reqwest::Method::POST,
        "/v1/notifications/verify-webhook-signature",
        "verify-webhook",
        Some(&body),
    )
    .await?;
    if checked["verification_status"] != "SUCCESS" {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "Invalid payment webhook signature".into(),
        ));
    }
    let event = v["id"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 100)
        .ok_or(bad("Event id missing"))?;
    let order = v["resource"]["supplementary_data"]["related_ids"]["order_id"]
        .as_str()
        .or_else(|| v["resource"]["id"].as_str())
        .ok_or(bad("Provider order missing"))?;
    let mut tx = a.db.begin().await?;
    let fresh=sqlx::query("INSERT INTO payment_inbox(tenant,provider,event_id,data) VALUES($1,'paypal',$2,$3) ON CONFLICT DO NOTHING").bind(&t).bind(event).bind(&v).execute(&mut *tx).await?.rows_affected();
    if fresh == 1
        && let Some(id) = sqlx::query_scalar::<_, String>(
            "SELECT id FROM payment_attempts WHERE tenant=$1 AND provider_order=$2",
        )
        .bind(&t)
        .bind(order)
        .fetch_optional(&mut *tx)
        .await?
    {
        enqueue_tx(
            &mut tx,
            &t,
            &id,
            "reconcile",
            &format!("webhook:{}", &hash(event)[..32]),
            &json!({}),
        )
        .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({"accepted":true,"duplicate":fresh==0})))
}
