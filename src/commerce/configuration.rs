//! Tenant checkout configuration loading.
use super::*;

pub(crate) fn decode_config(v: Value) -> Result<Settings> {
    serde_json::from_value(v)
        .map(super::settings_defaults::enrich_defaults)
        .map_err(|_| bad("Invalid commerce configuration"))
}
pub(crate) async fn config(a: &App, t: &str) -> Result<(Settings, i64)> {
    let r = sqlx::query("SELECT data,revision FROM commerce_settings WHERE tenant=$1")
        .bind(t)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Workspace not found".into()))?;
    Ok((decode_config(r.get("data"))?, r.get("revision")))
}
