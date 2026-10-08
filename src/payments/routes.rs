//! Customer payment status/capture and merchant refund operations share the durable command API.
use super::{
    account, customer, enqueue, environment, onboarding_route, provider_webhooks, providers_route,
    sessions, webhooks,
};
use crate::{
    App, Error, Json, Path, RequestContext, Result, Router, Row, SecureRoutes, State, StatusCode,
    Value, auth, bad, get, header, json, merchant, post, tenant,
};

pub(crate) fn payment_router() -> Router<App> {
    Router::new()
        .route(
            "/store-api/payment-providers/{id}/webhooks",
            post(provider_webhooks::webhook),
        )
        .secure_route(
            "/api/payment-providers",
            &[("GET", "payments.read")],
            get(providers_route),
        )
        .secure_route(
            "/api/payment-providers/{id}/onboarding",
            &[("POST", "payments.manage")],
            post(onboarding_route),
        )
        .secure_route("/api/payments", &[("GET", "payments.read")], get(status))
        .secure_route(
            "/api/payments/jobs/{id}",
            &[("GET", "payments.read")],
            get(job_status),
        )
        .route("/store-api/payments/{id}", get(customer_status))
        .route("/store-api/payments/{id}/session", get(sessions::session))
        .route(
            "/store-api/payments/{id}/{operation}",
            post(customer_command),
        )
        .secure_route(
            "/api/payments/{id}/{operation}",
            &[("POST", "payments.manage")],
            post(merchant_command),
        )
        .route(
            "/store-api/payments/paypal/webhooks",
            post(webhooks::webhook),
        )
}
pub(crate) async fn status(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "payments.read")?;
    let rows=sqlx::query("SELECT id,order_id,state,provider,amount_minor,currency,currency_scale,refunded_minor,adapter_version,environment FROM payment_attempts WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(&t).fetch_all(&a.db).await?;
    let jobs=sqlx::query("SELECT id,attempt_id,operation,state,error FROM payment_jobs WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(&t).fetch_all(&a.db).await?;
    let generic = providers_route(State(a.clone()), h.clone()).await?.0;
    let mut providers = vec![
        json!({"id":"paypal","environment":environment(),"configured":account(&t).is_ok(),"apiContract":"PayPal Orders v2"}),
    ];
    for p in generic["providers"].as_array().unwrap() {
        let mut p = p.clone();
        p["configured"] = json!(
            p["active"] == true
                && generic["accounts"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|c| c["provider"] == p["id"] && c["ready"] == true)
        );
        providers.push(p);
    }
    if !providers.iter().any(|p| p["id"] == "shopware_payments") {
        providers.push(json!({"id":"shopware_payments","configured":false,"status":"private-adapter-required"}));
    }
    Ok(Json(
        json!({"providers":providers,"attempts":rows.iter().map(|r|json!({"provider":r.get::<String,_>("provider"),"id":r.get::<String,_>("id"),"orderId":r.get::<String,_>("order_id"),"state":r.get::<String,_>("state"),"amountMinor":r.get::<i64,_>("amount_minor"),"currency":r.get::<String,_>("currency"),"currencyScale":r.get::<i16,_>("currency_scale"),"refundedMinor":r.get::<i64,_>("refunded_minor"),"adapterVersion":r.get::<String,_>("adapter_version"),"environment":r.get::<String,_>("environment")})).collect::<Vec<_>>(),"jobs":jobs.iter().map(|r|json!({"id":r.get::<String,_>("id"),"attemptId":r.get::<String,_>("attempt_id"),"operation":r.get::<String,_>("operation"),"state":r.get::<String,_>("state"),"error":r.get::<Option<String>,_>("error")})).collect::<Vec<_>>()}),
    ))
}
async fn customer_status(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    customer(&a, &h, &id).await?;
    Ok(Json(read(&a, &tenant(&h)?, &id).await?))
}
pub(crate) async fn read(a: &App, t: &str, id: &str) -> Result<Value> {
    let r=sqlx::query("SELECT provider,provider_context,state,approval_url,amount_minor,currency,currency_scale,refunded_minor,revision,environment FROM payment_attempts WHERE tenant=$1 AND id=$2").bind(t).bind(id).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Payment not found".into()))?;
    let job = sqlx::query("SELECT id,operation,state FROM payment_jobs WHERE tenant=$1 AND attempt_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1")
        .bind(t).bind(id).fetch_optional(&a.db).await?.map(|j| json!({"id":j.get::<String,_>("id"),"operation":j.get::<String,_>("operation"),"state":j.get::<String,_>("state")}));
    Ok(
        json!({"provider":r.get::<String,_>("provider"),"checkout":r.get::<Value,_>("provider_context")["checkout"],"job":job,"id":id,"state":r.get::<String,_>("state"),"approvalUrl":r.get::<Option<String>,_>("approval_url"),"amountMinor":r.get::<i64,_>("amount_minor"),"currency":r.get::<String,_>("currency"),"currencyScale":r.get::<i16,_>("currency_scale"),"refundedMinor":r.get::<i64,_>("refunded_minor"),"revision":r.get::<i64,_>("revision"),"environment":r.get::<String,_>("environment"),"realMoneyCharged":r.get::<String,_>("environment")=="live" && ["captured","captured_late","partially_refunded","refunded"].contains(&r.get::<String,_>("state").as_str())}),
    )
}
async fn customer_command(
    State(a): State<App>,
    h: RequestContext,
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
            header(&h, "idempotency-key")
                .or_else(|| v["requestKey"].as_str())
                .ok_or(bad("Idempotency-Key required"))?,
            &v,
        )
        .await?,
    ))
}
async fn merchant_command(
    State(a): State<App>,
    h: RequestContext,
    Path((id, op)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "payments.manage")?;
    if ![
        "refund",
        "reconcile",
        "cancel",
        "capture",
        "authorize",
        "void",
    ]
    .contains(&op.as_str())
        || v["approve"] != true
    {
        return Err(bad("Supported payment operation and approve=true required"));
    }
    Ok(Json(
        enqueue(
            &a,
            &h,
            &id,
            &op,
            header(&h, "idempotency-key")
                .or_else(|| v["requestKey"].as_str())
                .ok_or(bad("Idempotency-Key required"))?,
            &v,
        )
        .await?,
    ))
}

/// Merchant polling observes the durable job instead of dispatching another financial command.
async fn job_status(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "payments.manage")?;
    let r =
        sqlx::query("SELECT id,state,error,attempt_id FROM payment_jobs WHERE tenant=$1 AND id=$2")
            .bind(&t)
            .bind(id)
            .fetch_optional(&a.db)
            .await?
            .ok_or(Error(StatusCode::NOT_FOUND, "Payment job not found".into()))?;
    Ok(Json(
        json!({"id":r.get::<String,_>("id"),"state":r.get::<String,_>("state"),"error":r.get::<Option<String>,_>("error"),"payment":read(&a,&t,&r.get::<String,_>("attempt_id")).await?}),
    ))
}
