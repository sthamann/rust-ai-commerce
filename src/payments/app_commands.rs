//! App/Flow/MCP payment actions enqueue core jobs; provider-bound attempts prevent cross-app command authority.
use super::enqueue;
use crate::{
    App, Error, RequestContext, Result, StatusCode, Value, auth, bad, json, merchant, tenant,
};

pub(crate) async fn app_command(
    a: &App,
    h: &RequestContext,
    provider: &str,
    v: &Value,
) -> Result<Value> {
    merchant(a, h)?;
    auth::permit(h, "payments.manage")?;
    let t = tenant(h)?;
    let attempt_id = if let Some(id) = v["attemptId"].as_str() {
        id.to_owned()
    } else {
        let order = v["event"]["orderId"]
            .as_str()
            .ok_or(bad("Payment action requires attemptId or an order event"))?;
        sqlx::query_scalar::<_, Option<String>>(
            "SELECT data->'payment'->>'attemptId' FROM orders WHERE tenant=$1 AND id=$2",
        )
        .bind(&t)
        .bind(order)
        .fetch_optional(&a.db)
        .await?
        .flatten()
        .ok_or(Error(
            StatusCode::NOT_FOUND,
            "Order payment not found".into(),
        ))?
    };
    let owned: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM payment_attempts WHERE tenant=$1 AND id=$2 AND provider=$3)",
    )
    .bind(&t)
    .bind(&attempt_id)
    .bind(provider)
    .fetch_one(&a.db)
    .await?;
    if !owned {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Provider payment not found".into(),
        ));
    }
    let op = v["operation"]
        .as_str()
        .ok_or(bad("Payment operation required"))?;
    if ![
        "capture",
        "authorize",
        "void",
        "cancel",
        "refund",
        "reconcile",
    ]
    .contains(&op)
        || v["approve"] != true
    {
        return Err(bad("Explicit approved payment command required"));
    }
    enqueue(
        a,
        h,
        &attempt_id,
        op,
        v["requestKey"]
            .as_str()
            .ok_or(bad("Request key required"))?,
        &json!({"amountMinor":v["amountMinor"]}),
    )
    .await
}
/// Shared schema for generated apps, visual editors and explicit Flow Builder actions.
pub(crate) fn command_action() -> Value {
    json!({"name":"payment_command","description":"Queue provider payment operation","handler":"payment_command","public":false,"permission":"payments.manage","mcp":true,"flowAllowed":true,"inputSchema":{"type":"object","properties":{"operation":{"type":"string","enum":["capture","authorize","void","cancel","refund","reconcile"]},"attemptId":{"type":"string"},"event":{"type":"object"},"requestKey":{"type":"string"},"approve":{"type":"boolean"},"amountMinor":{"type":"integer"}},"required":["operation","requestKey","approve"],"additionalProperties":false}})
}
