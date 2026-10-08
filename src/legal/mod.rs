//! Connected legal/privacy boundary: configuration, consent, checkout snapshots and durable requests.
use crate::*;
mod model;
pub(crate) use model::{Config, validate};
mod consent;
pub(crate) use consent::{policy, require, require_locked};
mod checkout;
pub(crate) use checkout::snapshot;
mod product;
mod requests;
pub(crate) use product::{product_gaps, validate_product};
mod capabilities;
pub(crate) use capabilities::{invoke, permission, schema};
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/store-api/legal", get(policy))
        .route(
            "/store-api/privacy/consent",
            get(consent::read).put(consent::write),
        )
        .route(
            "/store-api/legal/acceptance",
            axum::routing::put(checkout::accept),
        )
        .route("/store-api/legal/requests", post(requests::create))
        .route("/store-api/legal/requests/{id}", get(requests::receipt))
        .secure_route(
            "/api/merchant/legal/requests",
            &[("GET", "customers.read")],
            get(requests::list),
        )
        .secure_route(
            "/api/merchant/legal/requests/{id}",
            &[("PUT", "customers.write")],
            axum::routing::put(requests::update),
        )
}
