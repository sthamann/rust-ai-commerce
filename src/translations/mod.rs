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
        .route(
            "/api/merchant/translations",
            get(routes::list).post(routes::create),
        )
        .route(
            "/api/merchant/translations/{id}",
            get(routes::detail).put(routes::control),
        )
        .route("/api/merchant/translations/{id}/apply", post(apply::apply))
}
