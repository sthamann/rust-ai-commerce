//! Language-neutral app HTTP contract backed by a Rust-only standard connector runtime.
mod actions;
mod config;
mod crypto;
mod email;
mod error;
mod exports;
mod legacy;
mod network;
mod oauth;
mod providers;
mod queue;
mod server;
mod smtp;
mod store;
mod templates;
#[cfg(test)]
mod tests;
mod worker;
use error::{Error, Result};
use serde_json::{Value, json};
pub use server::run;
use sqlx::{PgPool, Row};
use std::{env, sync::Arc, time::Duration};
use store::Store;
const APPS: [&str; 4] = ["email", "gmail", "google_analytics", "slack"];
fn digest(value: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(value))
}
fn text(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or("").to_owned()
}
fn checked(condition: bool, message: &'static str) -> Result<()> {
    if condition {
        Ok(())
    } else {
        Err(Error::Invalid(message))
    }
}
