//! Merchant-approved associations are consumed by the public shop without exposing order counts or identities.
use super::*;
pub(crate) async fn public_pairs(a: &App, t: &str) -> Result<Value> {
    let rows=sqlx::query("SELECT evidence->>'left' AS left_id,evidence->>'right' AS right_id FROM knowledge_hypotheses WHERE tenant=$1 AND state='published' ORDER BY updated_at DESC LIMIT 24").bind(t).fetch_all(&a.db).await?;
    Ok(json!(rows.iter().map(|r|json!({"left":r.get::<String,_>("left_id"),"right":r.get::<String,_>("right_id"),"source":"merchant-approved-order-association","causalUpliftProven":false})).collect::<Vec<_>>()))
}
pub(crate) async fn recommendations(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = tenant(&h)?;
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
    let (_, chain) = language_context(&a, &h).await?;
    let rows=sqlx::query("SELECT p.id,coalesce(tr.name,p.name) AS name,p.price,p.stock FROM products p LEFT JOIN LATERAL (SELECT name FROM product_translations WHERE tenant=p.tenant AND product_id=p.id AND language_id=ANY($3) AND name IS NOT NULL ORDER BY array_position($3,language_id) LIMIT 1) tr ON true WHERE p.tenant=$1 AND p.id=ANY($2) AND p.stock>0 ORDER BY p.id LIMIT 8").bind(t).bind(ids).bind(chain).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"source":"merchant-approved-order-association","causalUpliftProven":false,"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"price":r.get::<f64,_>("price"),"stock":r.get::<i32,_>("stock")})).collect::<Vec<_>>()}),
    ))
}
