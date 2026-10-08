//! Hybrid exact/lexical + dense RRF; hydrate current tenant rows and retrieve only connected evidence.
use super::*;
pub async fn search(
    db: &PgPool,
    tenant: &str,
    query: &str,
    vector: Option<Vec<f32>>,
    model: &str,
) -> Result<Value, sqlx::Error> {
    let candidates = if let Some(vector) = vector {
        vectors::query("product", tenant, model, vector).await.ok()
    } else {
        None
    };
    let mode = if candidates.is_some() {
        "hybrid"
    } else {
        "lexical"
    };
    let hits: Vec<Value> = sqlx::query_scalar(include_str!("search.sql"))
        .bind(tenant)
        .bind(query)
        .bind(json!(candidates.unwrap_or_default()))
        .bind(model)
        .fetch_all(db)
        .await?;
    // The application caller admits optional reranking through its shared inference budget.
    let reranked = false;
    let ids = hits
        .iter()
        .filter_map(|p| p["id"].as_str().map(str::to_owned))
        .collect::<Vec<_>>();
    Ok(
        json!({"mode":mode,"searchEngine":"Qdrant+PostgreSQL","fusion":"rrf","reranked":reranked,"hits":hits,"graph":neighborhood(db,tenant,&ids).await?}),
    )
}
/// An inference context is a bounded relevant subgraph, never a shop-wide graph dump.
pub async fn neighborhood(db: &PgPool, tenant: &str, ids: &[String]) -> Result<Value, sqlx::Error> {
    let edges: Vec<Value> = sqlx::query_scalar(include_str!("neighborhood.sql"))
        .bind(tenant)
        .bind(ids)
        .fetch_all(db)
        .await?;
    Ok(
        json!({"tenant":tenant,"engine":"PostgreSQL","edges":edges,"limit":48,"provenance":"curated or observed; association is not causal evidence"}),
    )
}
