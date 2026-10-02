//! Global SaaS control plane: operator-only aggregate statistics and audited shop provisioning.
use crate::*;
mod auth;
mod bootstrap;
pub(crate) use bootstrap::bootstrap_operator;
mod metrics;
mod provision;
pub(crate) use auth::authenticate;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/api/platform/session", get(session))
        .route("/api/platform/overview", get(metrics::overview))
        .route(
            "/api/platform/shops",
            get(metrics::shops).post(provision::create),
        )
        .route("/api/platform/shops/{id}", get(metrics::detail))
        .route("/api/platform/audit", get(audit))
}
async fn session(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let actor = auth::actor(&h)?;
    let row = sqlx::query("SELECT id,name,email FROM merchant_users WHERE id=$1")
        .bind(actor)
        .fetch_one(&a.db)
        .await?;
    Ok(Json(
        json!({"user":{"id":row.get::<String,_>("id"),"name":row.get::<String,_>("name"),"email":row.get::<String,_>("email")},"scope":"platform","canCreateShops":true}),
    ))
}
async fn audit(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    auth::actor(&h)?;
    let rows = sqlx::query("SELECT id,actor,action,tenant,created_at::text AS time FROM platform_audit ORDER BY id DESC LIMIT 100").fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r| json!({"id":r.get::<i64,_>("id"),"actor":r.get::<Option<String>,_>("actor"),"action":r.get::<String,_>("action"),"shop":r.get::<Option<String>,_>("tenant"),"time":r.get::<String,_>("time")})).collect::<Vec<_>>()}),
    ))
}
