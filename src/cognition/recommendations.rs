//! Merchant-approved associations are consumed by the public shop without exposing order counts or identities.
use super::*;
pub(crate) async fn public_pairs(a: &App, t: &str) -> Result<Value> {
    let rows=sqlx::query("SELECT evidence->>'left' AS left_id,evidence->>'right' AS right_id FROM knowledge_hypotheses WHERE tenant=$1 AND state='published' ORDER BY updated_at DESC LIMIT 24").bind(t).fetch_all(&a.db).await?;
    Ok(json!(rows.iter().map(|r|json!({"left":r.get::<String,_>("left_id"),"right":r.get::<String,_>("right_id"),"source":"merchant-approved-order-association","causalUpliftProven":false})).collect::<Vec<_>>()))
}
pub(crate) async fn recommendations(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    marketing::admit_product(&a, &h, &id).await?;
    let pairs = public_pairs(&a, &t).await?;
    let ids = pairs
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|p| {
            if p["left"] == id {
                p["right"].as_str().map(str::to_string)
            } else if p["right"] == id {
                p["left"].as_str().map(str::to_string)
            } else {
                None
            }
        })
        .take(8)
        .collect::<Vec<_>>();
    let Json(mut result) = catalog_page(
        State(a),
        h,
        CatalogCriteria {
            product_ids: Some(ids),
            limit: Some(8),
            ..Default::default()
        },
    )
    .await?;
    if let Some(elements) = result["elements"].as_array_mut() {
        elements.retain(|p| p["stock"].as_i64().unwrap_or(0) > 0);
    }
    result["source"] = json!("merchant-approved-order-association");
    result["causalUpliftProven"] = json!(false);
    Ok(Json(result))
}
