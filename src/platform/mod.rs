//! Global SaaS control plane: operator-only aggregate statistics and audited shop provisioning.
use crate::*;
mod auth;
mod bootstrap;
pub(crate) use bootstrap::bootstrap_operator;
mod ai;
mod infrastructure;
mod lifecycle;
mod metrics;
mod quotas;
mod resources;
mod shop_detail;
pub(crate) use lifecycle::admit;
mod provision;
pub(crate) use auth::authenticate;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .secure_route(
            "/api/platform/session",
            &[("GET", "platform")],
            get(session),
        )
        .secure_route(
            "/api/platform/overview",
            &[("GET", "platform")],
            get(metrics::overview),
        )
        .secure_route(
            "/api/platform/shops",
            &[("GET", "platform"), ("POST", "platform")],
            get(metrics::shops).post(provision::create),
        )
        .secure_route(
            "/api/platform/shops/{id}",
            &[("GET", "platform")],
            get(shop_detail::detail),
        )
        .secure_route(
            "/api/platform/shops/{id}/status",
            &[("POST", "platform")],
            post(lifecycle::change),
        )
        .secure_route(
            "/api/platform/shops/{id}/quotas",
            &[("GET", "platform"), ("PUT", "platform")],
            get(quotas::get).put(quotas::save),
        )
        .secure_route(
            "/api/platform/ai",
            &[("GET", "platform"), ("PUT", "platform")],
            get(ai::get).put(ai::save),
        )
        .secure_route(
            "/api/platform/infrastructure",
            &[("GET", "platform")],
            get(infrastructure::snapshot),
        )
        .secure_route("/api/platform/audit", &[("GET", "platform")], get(audit))
}
async fn session(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let actor = auth::actor(&h)?;
    let row = sqlx::query("SELECT id,name,email FROM merchant_users WHERE id=$1")
        .bind(actor)
        .fetch_one(&a.db)
        .await?;
    Ok(Json(
        json!({"user":{"id":row.get::<String,_>("id"),"name":row.get::<String,_>("name"),"email":row.get::<String,_>("email")},"scope":"platform","canCreateShops":true}),
    ))
}
async fn audit(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    auth::actor(&h)?;
    let rows = sqlx::query("SELECT id,actor,action,tenant,created_at::text AS time FROM platform_audit ORDER BY id DESC LIMIT 100").fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r| json!({"id":r.get::<i64,_>("id"),"actor":r.get::<Option<String>,_>("actor"),"action":r.get::<String,_>("action"),"shop":r.get::<Option<String>,_>("tenant"),"time":r.get::<String,_>("time")})).collect::<Vec<_>>()}),
    ))
}
