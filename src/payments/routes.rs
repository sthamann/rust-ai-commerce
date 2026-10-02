//! Customer payment status/capture and merchant refund operations share the durable command API.
use super::*;
pub(crate) fn payment_router() -> Router<App> {
    Router::new()
        .route("/api/payments", get(status))
        .route("/store-api/payments/{id}", get(customer_status))
        .route(
            "/store-api/payments/{id}/{operation}",
            post(customer_command),
        )
        .route("/api/payments/{id}/{operation}", post(merchant_command))
        .route(
            "/store-api/payments/paypal/webhooks",
            post(webhooks::webhook),
        )
}
pub(crate) async fn status(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rows=sqlx::query("SELECT id,order_id,state,amount_minor,currency,refunded_minor,adapter_version,environment FROM payment_attempts WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(&t).fetch_all(&a.db).await?;
    let jobs=sqlx::query("SELECT id,attempt_id,operation,state,error FROM payment_jobs WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(&t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"providers":[{"id":"paypal","environment":"sandbox","configured":account(&t).is_ok(),"apiContract":"PayPal Orders v2","realMoneyCharged":false},{"id":"shopware_payments","configured":false,"status":"connector-contract-required","reason":"Official documentation requires a valid Shopware installation. Standalone API/onboarding compatibility is not verified."}],"attempts":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"orderId":r.get::<String,_>("order_id"),"state":r.get::<String,_>("state"),"amountMinor":r.get::<i64,_>("amount_minor"),"currency":r.get::<String,_>("currency"),"refundedMinor":r.get::<i64,_>("refunded_minor"),"adapterVersion":r.get::<String,_>("adapter_version"),"environment":r.get::<String,_>("environment")})).collect::<Vec<_>>(),"jobs":jobs.iter().map(|r|json!({"id":r.get::<String,_>("id"),"attemptId":r.get::<String,_>("attempt_id"),"operation":r.get::<String,_>("operation"),"state":r.get::<String,_>("state"),"error":r.get::<Option<String>,_>("error")})).collect::<Vec<_>>()}),
    ))
}
async fn customer_status(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    customer(&a, &h, &id).await?;
    Ok(Json(read(&a, &tenant(&h)?, &id).await?))
}
pub(crate) async fn read(a: &App, t: &str, id: &str) -> Result<Value> {
    let r=sqlx::query("SELECT state,approval_url,amount_minor,currency,refunded_minor,revision,environment FROM payment_attempts WHERE tenant=$1 AND id=$2").bind(t).bind(id).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Payment not found".into()))?;
    Ok(
        json!({"id":id,"state":r.get::<String,_>("state"),"approvalUrl":r.get::<Option<String>,_>("approval_url"),"amountMinor":r.get::<i64,_>("amount_minor"),"currency":r.get::<String,_>("currency"),"refundedMinor":r.get::<i64,_>("refunded_minor"),"revision":r.get::<i64,_>("revision"),"environment":r.get::<String,_>("environment"),"realMoneyCharged":false}),
    )
}
async fn customer_command(
    State(a): State<App>,
    h: HeaderMap,
    Path((id, op)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    customer(&a, &h, &id).await?;
    if !["capture", "reconcile", "cancel"].contains(&op.as_str()) {
        return Err(bad("Unsupported customer payment operation"));
    }
    Ok(Json(
        enqueue(
            &a,
            &h,
            &id,
            &op,
            header(&h, "idempotency-key").ok_or(bad("Idempotency-Key required"))?,
            &v,
        )
        .await?,
    ))
}
async fn merchant_command(
    State(a): State<App>,
    h: HeaderMap,
    Path((id, op)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "operations")?;
    if !["refund", "reconcile", "cancel"].contains(&op.as_str()) || v["approve"] != true {
        return Err(bad("Supported payment operation and approve=true required"));
    }
    Ok(Json(
        enqueue(
            &a,
            &h,
            &id,
            &op,
            header(&h, "idempotency-key").ok_or(bad("Idempotency-Key required"))?,
            &v,
        )
        .await?,
    ))
}
