//! MCP legal tools delegate to the same ownership/permission-checked HTTP domain handlers.
use super::*;
pub(crate) fn permission(name: &str) -> Option<&'static str> {
    match name {
        "merchant.legal.requests" => Some("customers.read"),
        "merchant.legal.review" => Some("customers.write"),
        _ => None,
    }
}
pub(crate) fn schema(name: &str) -> Option<Value> {
    let properties = match name {
        "privacy.policy" | "merchant.legal.requests" => json!({}),
        "privacy.consent" => {
            json!({"policyVersion":{"type":"string"},"choices":{"type":"object","additionalProperties":{"type":"boolean"}}})
        }
        "legal.accept" => {
            json!({"policyVersion":{"type":"string"},"terms":{"type":"boolean"},"digitalImmediate":{"type":"boolean"}})
        }
        "legal.request" => {
            json!({"kind":{"type":"string"},"name":{"type":"string"},"email":{"type":"string"},"reference":{"type":"string"},"message":{"type":"string"},"requestKey":{"type":"string"}})
        }
        "merchant.legal.review" => {
            json!({"id":{"type":"string"},"state":{"type":"string"},"revision":{"type":"integer"},"note":{"type":"string"}})
        }
        _ => return None,
    };
    let required = properties
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    Some(
        json!({"type":"object","properties":properties,"required":required,"additionalProperties":false}),
    )
}
pub(crate) async fn invoke(a: &App, h: &HeaderMap, name: &str, v: &Value) -> Result<Value> {
    match name {
        "privacy.policy" => Ok(policy(State(a.clone()), h.clone()).await?.0),
        "privacy.consent" => Ok(consent::write(
            State(a.clone()),
            h.clone(),
            Json(serde_json::from_value(v.clone()).map_err(|_| bad("Invalid consent"))?),
        )
        .await?
        .0),
        "legal.accept" => Ok(checkout::accept(
            State(a.clone()),
            h.clone(),
            Json(serde_json::from_value(v.clone()).map_err(|_| bad("Invalid acceptance"))?),
        )
        .await?
        .0),
        "legal.request" => Ok(requests::create(
            State(a.clone()),
            h.clone(),
            Json(serde_json::from_value(v.clone()).map_err(|_| bad("Invalid request"))?),
        )
        .await?
        .0),
        "merchant.legal.requests" => Ok(requests::list(State(a.clone()), h.clone()).await?.0),
        "merchant.legal.review" => Ok(requests::update(
            State(a.clone()),
            h.clone(),
            Path(v["id"].as_str().ok_or(bad("Request ID required"))?.into()),
            Json(v.clone()),
        )
        .await?
        .0),
        _ => Err(bad("Unknown legal capability")),
    }
}
