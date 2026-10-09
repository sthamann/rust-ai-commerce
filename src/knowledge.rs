//! Transactional PostgreSQL knowledge relations and separately indexed Qdrant retrieval.
use crate::scoped_pool::ScopedPool as PgPool;
use serde_json::{Value, json};
use sqlx::{PgConnection, Row};
pub mod embeddings;
pub use embeddings::embedding;
mod relations;
pub mod rerank;
mod search;
mod vector_cache;
pub mod vectors;
pub use relations::{
    graph, seed_relations, sync_document, sync_integration, sync_observation, sync_product,
};
pub use search::{neighborhood, search};
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
