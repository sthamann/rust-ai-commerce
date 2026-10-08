//! Transactional PostgreSQL knowledge relations and separately indexed Qdrant retrieval.
use crate::scoped_pool::ScopedPool as PgPool;
use serde_json::{Value, json};
use sqlx::{PgConnection, Row};
mod relations;
mod search;
pub mod vectors;
pub use relations::{
    graph, seed_relations, sync_document, sync_integration, sync_observation, sync_product,
};
pub use search::search;
pub async fn embedding(
    http: &reqwest::Client,
    url: &str,
    key: Option<&str>,
    model: &str,
    text: &str,
) -> Result<Vec<f32>, String> {
    let mut request = http
        .post(format!("{}/api/embed", url.trim_end_matches('/')))
        .json(&json!({"model":model,"input":text,"truncate":false}))
        .timeout(std::time::Duration::from_secs(10));
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Embedding service unavailable")?;
    if !response.status().is_success() {
        return Err("Embedding service rejected request".into());
    }
    let raw: Value = response
        .json()
        .await
        .map_err(|_| "Invalid embedding response")?;
    let vector: Vec<f32> = serde_json::from_value(raw["embeddings"][0].clone())
        .map_err(|_| "Invalid embedding vector")?;
    if vector.len() != 1024 || vector.iter().any(|v| !v.is_finite()) {
        return Err("Embedding model must return 1024 finite dimensions".into());
    }
    Ok(vector)
}

/// Persist a graph product on an explicitly scoped transaction, also behind transaction poolers.
pub async fn sync_product_scoped(
    db: &PgPool,
    tenant: &str,
    product: &Value,
) -> Result<(), sqlx::Error> {
    let mut tx = db.begin().await?;
    sync_product(&mut tx, tenant, product).await?;
    tx.commit().await
}
