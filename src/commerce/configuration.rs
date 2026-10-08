//! Tenant checkout configuration loading.
use super::*;

pub(crate) fn decode_config(v: Value) -> Result<Settings> {
    serde_json::from_value(v)
        .map(super::settings_defaults::enrich_defaults)
        .map_err(|_| bad("Invalid commerce configuration"))
}
pub(crate) async fn config(a: &App, t: &str) -> Result<(Arc<Settings>, i64)> {
    performance::settings(a, t, "default").await
}
