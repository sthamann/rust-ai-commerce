//! Currency MCP operations reuse the native HTTP handlers and existing settings/catalog permissions.
use super::*;
pub(crate) fn permission(name: &str) -> Option<&'static str> {
    match name {
        "merchant.currencies.refresh" => Some("settings.write"),
        "merchant.currencies.generate" => Some("catalog.write"),
        "merchant.currencies.jobs" | "merchant.currencies.job" => Some("catalog.read"),
        _ => None,
    }
}
pub(crate) fn schema(name: &str) -> Option<Value> {
    let (props, required) = match name {
        "currency.list" => (json!({}), vec![]),
        "currency.select" => (
            json!({"currency":{"type":"string"},"revision":{"type":"integer"}}),
            vec!["currency", "revision"],
        ),
        "merchant.currencies.refresh" => (json!({"revision":{"type":"integer"}}), vec!["revision"]),
        "merchant.currencies.generate" => (
            json!({"currency":{"type":"string"},"revision":{"type":"integer"},"overwrite":{"type":"boolean"}}),
            vec!["currency", "revision"],
        ),
        "merchant.currencies.jobs" => (json!({}), vec![]),
        "merchant.currencies.job" => (json!({"id":{"type":"string"}}), vec!["id"]),
        _ => return None,
    };
    Some(
        json!({"type":"object","properties":props,"required":required,"additionalProperties":false}),
    )
}
pub(crate) async fn invoke(a: &App, h: &HeaderMap, name: &str, v: &Value) -> Result<Value> {
    let state = State(a.clone());
    let h = h.clone();
    let Json(result) = match name {
        "currency.list" => routes::discover(state, h).await?,
        "currency.select" => routes::select(state, h, Json(v.clone())).await?,
        "merchant.currencies.refresh" => routes::refresh(state, h, Json(v.clone())).await?,
        "merchant.currencies.generate" => jobs::create(state, h, Json(v.clone())).await?,
        "merchant.currencies.jobs" => jobs::list(state, h).await?,
        "merchant.currencies.job" => {
            jobs::detail(
                state,
                h,
                Path(v["id"].as_str().ok_or(bad("Job ID required"))?.into()),
            )
            .await?
        }
        _ => return Err(bad("Unknown currency capability")),
    };
    Ok(result)
}
