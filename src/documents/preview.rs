//! No-provider retrieval preview shares product-question scope and locale rules; merchant sources never enter customer previews.
use super::*;
pub(crate) async fn preview(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "knowledge.read")?;
    let query = v["query"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 2000)
        .ok_or(bad("Question must be 1..2000 bytes"))?;
    let audience = v["audience"]
        .as_str()
        .filter(|s| ["customer", "merchant"].contains(s))
        .ok_or(bad("Choose customer or merchant"))?;
    let product = v["productId"].as_str().filter(|s| !s.is_empty());
    let public = audience == "customer";
    if public && product.is_none() {
        return Err(bad("Customer preview requires product"));
    }
    let snapshot = if let Some(id) = product {
        Some(
            commerce::product_detail(
                State(a.clone()),
                h.clone(),
                Path(id.into()),
                axum::extract::Query(CatalogCriteria::default()),
            )
            .await?
            .0["product"]
                .clone(),
        )
    } else {
        None
    };
    let locale = language_context(&a, &h).await?.0;
    let sources = retrieval::search_in(&a, &t, product, query, public, &locale, false).await?;
    let external = if public {
        json!([])
    } else {
        apps::private_evidence(&a, &t, query).await?
    };
    Ok(Json(
        json!({"audience":audience,"locale":locale,"product":snapshot,"sources":sources,"external":external,"retrieval":"lexical","modelCalled":false,"sideEffects":false,"missingSources":sources.as_array().is_none_or(|s|s.is_empty()),"limit":8}),
    ))
}
