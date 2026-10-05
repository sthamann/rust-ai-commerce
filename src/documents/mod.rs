//! Source-bound knowledge ingestion, retrieval and product questions share tenant/product visibility.
use crate::*;
mod content;
mod ingestion;
mod lifecycle;
mod preview;
mod product_knowledge;
mod tools;
mod workspace;
pub(crate) use tools::{knowledge_invoke, knowledge_schema};
mod parser;
mod questions;
mod retrieval;
pub(crate) use ingestion::*;
pub(crate) use parser::extract_pdf;
pub(crate) use questions::*;
pub(crate) use retrieval::*;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route(
            "/api/knowledge/documents",
            get(list)
                .post(ingest)
                .layer(axum::extract::DefaultBodyLimit::max(256 * 1024)),
        )
        .route(
            "/api/knowledge/documents/upload",
            post(upload).layer(axum::extract::DefaultBodyLimit::max(2 * 1024 * 1024)),
        )
        .route("/api/knowledge/workspace", get(workspace::workspace))
        .route(
            "/api/knowledge/product/{id}",
            get(product_knowledge::product_knowledge),
        )
        .route("/api/knowledge/preview", post(preview::preview))
        .route(
            "/api/knowledge/documents/{id}",
            get(lifecycle::detail)
                .put(publish)
                .patch(lifecycle::edit)
                .layer(axum::extract::DefaultBodyLimit::max(256 * 1024)),
        )
        .route(
            "/api/knowledge/documents/{id}/lifecycle",
            post(lifecycle::lifecycle),
        )
        .route("/api/knowledge/documents/{id}/index", post(index))
        .route("/store-api/product/{id}/questions", post(question))
}
