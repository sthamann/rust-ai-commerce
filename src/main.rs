//! Process lifetime only. See docs/source-map.md for domain responsibilities.
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use rust_ai_commerce::{
    inference::{Choice, Inference},
    knowledge,
    pricing::{PriceInput, calculate, math_round},
    sandbox::Sandbox,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use std::{
    collections::HashMap,
    env,
    sync::{Arc, RwLock},
};
use tower_http::services::ServeDir;
use uuid::Uuid;
mod accounts;
mod agent;
mod apps;
mod chat_lease;
mod cognition;
mod developer;
mod documents;
mod http_limits;
mod marketing;
mod payments;
mod staging;
mod workers;
use agent::*;
mod localization;
use localization::*;
mod studio;
use studio::*;
mod auth;
mod commerce;
mod foundation;
pub(crate) use foundation::*;
mod catalog_model;
pub(crate) use catalog_model::*;
mod cart_model;
pub(crate) use cart_model::*;
mod cart_storage;
pub(crate) use cart_storage::*;
mod cart_price;
pub(crate) use cart_price::*;
mod cart_mutation;
pub(crate) use cart_mutation::*;
mod order_checkout;
pub(crate) use order_checkout::*;
mod catalog_routes;
pub(crate) use catalog_routes::*;
mod cart_routes;
mod checkout_handoff;
pub(crate) use cart_routes::*;
mod customer;
pub(crate) use customer::*;
mod order_routes;
pub(crate) use order_routes::*;
mod proposal_model;
pub(crate) use proposal_model::*;
mod planner;
pub(crate) use planner::*;
mod proposal_apply;
pub(crate) use proposal_apply::*;
mod proposal_routes;
pub(crate) use proposal_routes::*;
mod experience;
pub(crate) use experience::*;
mod outbox;
pub(crate) use outbox::*;
mod concierge;
pub(crate) use concierge::*;
mod extensions;
pub(crate) use extensions::*;
mod capabilities;
pub(crate) use capabilities::*;
mod mcp;
pub(crate) use mcp::*;
mod ucp;
pub(crate) use ucp::*;
mod seed;
pub(crate) use seed::*;
mod bootstrap;
pub(crate) use bootstrap::*;
mod routes;
pub(crate) use routes::*;
fn main() {
    if env::args().nth(1).as_deref() == Some("--extract-pdf") {
        documents::extract_pdf();
        return;
    }
    tokio::runtime::Runtime::new().unwrap().block_on(run());
}
async fn run() {
    let a = bootstrap().await;
    if env::var("PROCESS_ROLE").is_ok_and(|s| s.ends_with("-worker")) {
        let _ = tokio::signal::ctrl_c().await;
        return;
    }
    let app = router(a);
    let addr = env::var("BIND_ADDR").unwrap_or("127.0.0.1:8787".into());
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("rust-ai-commerce listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .unwrap();
}
