//! Uniform tenant-scoped history from transactional database snapshots; restoration delegates to existing domain validators.
use crate::*;
mod capability;
mod product;
mod restore;
mod routes;
pub(crate) use capability::{invoke, schema, visible};
pub(crate) fn router() -> Router<App> {
    Router::new()
        .secure_route(
            "/api/history/{entity}/{id}",
            &[("GET", "read")],
            get(routes::list),
        )
        .secure_route(
            "/api/history/{entity}/{id}/{version}",
            &[("GET", "read")],
            get(routes::detail),
        )
        .secure_route(
            "/api/history/{entity}/{id}/{version}/restore",
            &[("POST", "read")],
            post(routes::restore),
        )
        .layer(axum::extract::DefaultBodyLimit::max(256 * 1024))
}
pub(crate) async fn context(
    conn: &mut sqlx::PgConnection,
    h: &RequestContext,
    source: &str,
) -> Result<()> {
    sqlx::query("SELECT set_config('vendune.actor',$1,true),set_config('vendune.source',$2,true),set_config('vendune.reason',$3,true)")
 .bind(header(h,"x-rac-user").unwrap_or(""))
 .bind(source).bind(header(h,"x-rac-history-reason").unwrap_or(""))
 .execute(conn).await?;
    Ok(())
}
pub(crate) async fn customer_context(conn: &mut sqlx::PgConnection, email: &str) -> Result<()> {
    sqlx::query(
        "SELECT set_config('vendune.actor',$1,true),set_config('vendune.source','customer',true)",
    )
    .bind(format!("customer:{email}"))
    .execute(conn)
    .await?;
    Ok(())
}
pub(super) fn rights(entity: &str) -> Result<(&'static str, Option<&'static str>)> {
    Ok(match entity {
        "product" | "category" => ("catalog.read", Some("catalog.write")),
        "source" => ("knowledge.read", Some("catalog.write")),
        "customer" => ("customers.read", Some("customers.write")),
        "order" => ("orders.read", None),
        "settings" | "checkoutChannel" | "company" | "companyChannel" | "rule" | "flow"
        | "promotion" | "channel" => ("settings.read", Some("settings.write")),
        _ => return Err(bad("Unsupported history entity")),
    })
}
