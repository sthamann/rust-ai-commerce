//! Process lifetime only. See docs/source-map.md for domain responsibilities.
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
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
use vendune::{
    inference::{Choice, Inference},
    knowledge,
    pricing::{PriceInput, calculate, math_round},
    sandbox::Sandbox,
    verified_kernel,
};
mod accounts;
mod agent;
mod apps;
mod assets;
mod categories;
mod chat_lease;
mod cognition;
mod developer;
mod documents;
mod history;
mod http_limits;
mod marketing;
mod operations;
mod payments;
mod staging;
mod translations;
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
mod catalog_page;
pub(crate) use catalog_page::*;
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
mod channel_metrics;
mod migrations;
mod platform;
mod routes;
mod shop_domains;
pub(crate) use routes::*;
fn main() {
    bootstrap::entry();
}
