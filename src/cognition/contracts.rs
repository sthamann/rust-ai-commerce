//! Evidence APIs and MCP contracts dispatch into one authorized owner; the claim compiler rejects free prose.
use super::*;
pub(crate) fn schema(name: &str) -> Option<Value> {
    if let Some(schema) = experiments_schema(name) {
        return Some(schema);
    }
    let props = match name {
        "catalog.facts" => json!({"productId":{"type":"string"}}),
        "knowledge.autonomy.apply" => json!({"taskId":{"type":"string"}}),
        "knowledge.claims" => json!({"productId":{"type":"string"}}),
        "knowledge.claim.propose" => {
            json!({"productId":{"type":"string"},"sourceId":{"type":"string"},"contentHash":{"type":"string"},"text":{"type":"string","maxLength":1200},"quote":{"type":"string","maxLength":2400},"locale":{"type":"string"},"confidence":{"type":"number","minimum":0,"maximum":1},"nodeType":{"type":"string","enum":evidence::NODE_TYPES}})
        }
        "knowledge.claim.review" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer"},"state":{"type":"string","enum":["evidenced","confirmed","rejected"]},"approve":{"type":"boolean"}})
        }
        "knowledge.extract" => {
            json!({"sourceId":{"type":"string"},"productId":{"type":"string"},"locale":{"type":"string"},"inference":{"type":"object"}})
        }
        "knowledge.compile" => {
            json!({"productId":{"type":"string"},"claims":{"type":"array","maxItems":20,"items":{"type":"object","properties":{"id":{"type":"string"},"text":{"type":"string"}},"required":["id","text"],"additionalProperties":false}}})
        }
        _ => return None,
    };
    Some(json!({"type":"object","properties":props,"additionalProperties":false}))
}
pub(crate) async fn invoke_contract(
    a: &App,
    h: &RequestContext,
    name: &str,
    v: &Value,
) -> Result<Value> {
    let t = merchant(a, h)?;
    auth::permit(h, "knowledge.read")?;
    if name == "knowledge.experiments" || name.starts_with("knowledge.experiment.") {
        return experiments::invoke(a, h, name, v).await;
    }
    let product = || v["productId"].as_str().ok_or(bad("Product required"));
    match name {
        "knowledge.autonomy.apply" => {
            crate::proposal_apply::apply_mode(
                a,
                &t,
                v["taskId"].as_str().ok_or(bad("Task required"))?,
                h,
                true,
            )
            .await
        }
        "knowledge.claims" => evidence::claims(a, &t, product()?, false).await,
        "knowledge.claim.propose" => evidence::propose(a, h, v).await,
        "knowledge.claim.review" => evidence::decide(a, h, v).await,
        "knowledge.extract" => extraction::extract(a, h, v).await,
        "knowledge.compile" => compile(a, &t, product()?, v).await,
        _ => Err(bad("Unknown intelligence contract")),
    }
}
pub(crate) async fn compile(a: &App, t: &str, product: &str, v: &Value) -> Result<Value> {
    let facts = evidence::claims(a, t, product, true).await?;
    let statements = v["claims"]
        .as_array()
        .filter(|a| a.len() <= 20)
        .ok_or(bad("At most 20 fact statements required"))?;
    let facts = facts["claims"].as_array().unwrap();
    let mut rendered = Vec::new();
    for s in statements {
        let matched = facts
            .iter()
            .find(|f| f["id"] == s["id"] && f["data"]["text"] == s["text"]);
        if let Some(f) = matched.filter(|f| {
            verified_kernel::claim_render_admissible(
                f["state"] == "confirmed",
                f["sourcePublic"] == true,
                f["sourceCurrent"] == true,
                f["validTime"] == true,
                f["data"]["text"] == s["text"],
            )
        }) {
            rendered.push(json!({"id":f["id"],"text":f["data"]["text"],"locale":f["data"]["locale"],"sourceId":f["data"]["sourceId"],"contentHash":f["data"]["contentHash"]}));
        } else {
            return Err(conflict(
                "Statement is not an exact current confirmed public claim",
            ));
        }
    }
    Ok(
        json!({"productId":product,"statements":rendered,"compiled":true,"scope":"Only these exact statements are checked; free prose is not certified"}),
    )
}
async fn api(
    State(a): State<App>,
    h: RequestContext,
    Path(name): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    Ok(Json(
        invoke_contract(&a, &h, &format!("knowledge.{name}"), &v).await?,
    ))
}
async fn public_facts(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    // Reuse the Store API admission/visibility consumer, including channel restrictions.
    marketing::admit_product(&a, &h, &id).await?;
    Ok(Json(evidence::claims(&a, &tenant(&h)?, &id, true).await?))
}
async fn public_compile(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    marketing::admit_product(&a, &h, &id).await?;
    Ok(Json(compile(&a, &tenant(&h)?, &id, &v).await?))
}
pub(crate) fn router() -> Router<App> {
    Router::new()
        .secure_route(
            "/api/intelligence/{name}",
            &[("POST", "knowledge.read")],
            post(api),
        )
        .merge(super::claim_batches::router())
        .route("/store-api/product/{id}/facts", get(public_facts))
        .route(
            "/store-api/product/{id}/facts/compile",
            post(public_compile),
        )
}

fn experiments_schema(name: &str) -> Option<Value> {
    let props = match name {
        "knowledge.experiments" => json!({}),
        "knowledge.experiment.create" => {
            json!({"design":{"type":"object"},"approve":{"type":"boolean"}})
        }
        "knowledge.experiment.report" => json!({"id":{"type":"string"}}),
        "knowledge.experiment.start"
        | "knowledge.experiment.stop"
        | "knowledge.experiment.finish" => {
            json!({"id":{"type":"string"},"revision":{"type":"integer"},"approve":{"type":"boolean"}})
        }
        _ => return None,
    };
    Some(json!({"type":"object","properties":props,"additionalProperties":false}))
}
