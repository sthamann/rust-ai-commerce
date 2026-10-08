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
        .secure_route(
            "/api/knowledge/documents",
            &[("GET", "knowledge.read"), ("POST", "catalog.write")],
            get(list)
                .post(ingest)
                .layer(axum::extract::DefaultBodyLimit::max(256 * 1024)),
        )
        .secure_route(
            "/api/knowledge/documents/upload",
            &[("POST", "catalog.write")],
            post(upload).layer(axum::extract::DefaultBodyLimit::max(2 * 1024 * 1024)),
        )
        .secure_route(
            "/api/knowledge/workspace",
            &[("GET", "knowledge.read")],
            get(workspace::workspace),
        )
        .secure_route(
            "/api/knowledge/product/{id}",
            &[("GET", "knowledge.read")],
            get(product_knowledge::product_knowledge),
        )
        .secure_route(
            "/api/knowledge/preview",
            &[("POST", "knowledge.read")],
            post(preview::preview),
        )
        .secure_route(
            "/api/knowledge/documents/{id}",
            &[
                ("GET", "knowledge.read"),
                ("PUT", "catalog.write"),
                ("PATCH", "catalog.write"),
            ],
            get(lifecycle::detail)
                .put(publish)
                .patch(lifecycle::edit)
                .layer(axum::extract::DefaultBodyLimit::max(256 * 1024)),
        )
        .secure_route(
            "/api/knowledge/documents/{id}/lifecycle",
            &[("POST", "catalog.write")],
            post(lifecycle::lifecycle),
        )
        .secure_route(
            "/api/knowledge/documents/{id}/index",
            &[("POST", "catalog.write")],
            post(index),
        )
        .route("/store-api/product/{id}/questions", post(question))
}

pub(crate) use lifecycle::edit as restore_edit;
