//! Tenant-scoped, resumable AI translation drafts; applying is revision checked and emits native product events.
use crate::*;
mod apply;
mod fields;
mod routes;
mod worker;
pub(crate) use apply::apply;
pub(crate) use routes::{control, create, detail, list};
pub(crate) use worker::once;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .secure_route(
            "/api/merchant/translations",
            &[("GET", "catalog.read"), ("POST", "catalog.write")],
            get(routes::list).post(routes::create),
        )
        .secure_route(
            "/api/merchant/translations/{id}",
            &[("GET", "catalog.read"), ("PUT", "catalog.write")],
            get(routes::detail).put(routes::control),
        )
        .secure_route(
            "/api/merchant/translations/{id}/apply",
            &[("POST", "catalog.write")],
            post(apply::apply),
        )
}
