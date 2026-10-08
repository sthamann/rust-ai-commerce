//! Bounded public claim intake/compilation shares current channel admission and source-bound evidence, without per-SKU HTTP round trips.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Intake {
    product_ids: Vec<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Statement {
    id: String,
    text: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Binding {
    product_id: String,
    claims: Vec<Statement>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Compile {
    products: Vec<Binding>,
}
async fn facts(a: &App, h: &RequestContext, ids: &[String]) -> Result<Vec<Value>> {
    marketing::admit_products(a, h, ids).await?;
    let locale = language_context(a, h).await?.0;
    let rows: Vec<Value> = sqlx::query_scalar(include_str!("claim_batch.sql"))
        .bind(tenant(h)?)
        .bind(ids)
        .bind(locale)
        .fetch_all(&a.db)
        .await?;
    Ok(rows)
}
async fn intake(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Intake>,
) -> Result<Json<Value>> {
    let current = facts(&a, &h, &v.product_ids).await?;
    Ok(Json(
        json!({"products":v.product_ids.iter().map(|id|json!({"productId":id,"statements":current.iter().filter(|c|c["productId"]==*id).collect::<Vec<_>>()})).collect::<Vec<_>>() }),
    ))
}
async fn compile(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Compile>,
) -> Result<Json<Value>> {
    if v.products.iter().any(|p| {
        p.claims.len() > 20
            || p.claims
                .iter()
                .any(|s| s.text.is_empty() || s.text.len() > 1200 || s.id.len() > 128)
    }) {
        return Err(bad("Claim compilation batch exceeds bounds"));
    }
    let ids = v
        .products
        .iter()
        .map(|p| p.product_id.clone())
        .collect::<Vec<_>>();
    let current = facts(&a, &h, &ids).await?;
    for binding in &v.products {
        for statement in &binding.claims {
            let exact = current.iter().any(|f| {
                f["productId"] == binding.product_id
                    && f["id"] == statement.id
                    && f["text"] == statement.text
            });
            if !verified_kernel::claim_render_admissible(true, true, true, true, exact) {
                return Err(conflict(
                    "Statement is not an exact current confirmed public claim",
                ));
            }
        }
    }
    Ok(Json(
        json!({"compiled":true,"products":v.products.iter().map(|p|json!({"productId":p.product_id,"statements":p.claims})).collect::<Vec<_>>(),"scope":"Exact current claims in this language and channel; surrounding prose is not certified"}),
    ))
}
pub(super) fn router() -> Router<App> {
    Router::new()
        .route("/store-api/intelligence/claims", post(intake))
        .route("/store-api/intelligence/claims/compile", post(compile))
}
