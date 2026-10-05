//! Selective staging units for channel settings; all final aggregates and method dependencies use native validators.
use super::*;
pub(crate) async fn snapshot_scopes(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    result: &mut serde_json::Map<String, Value>,
) -> Result<()> {
    for row in sqlx::query("SELECT channel_id,data FROM commerce_overrides WHERE tenant=$1 ORDER BY channel_id FOR UPDATE").bind(t).fetch_all(&mut **tx).await? {
  result.insert(format!("settings-channel:{}",row.get::<String,_>("channel_id")),row.get("data"));
 }
    Ok(())
}
pub(crate) async fn publish_scope(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    channel: &str,
    value: &Value,
) -> Result<()> {
    let (old, _) = scoped_locked(tx, t, channel).await?;
    let base: Value =
        sqlx::query_scalar("SELECT data FROM commerce_settings WHERE tenant=$1 FOR UPDATE")
            .bind(t)
            .fetch_one(&mut **tx)
            .await?;
    let next = super::settings_patch::resolve(&decode_config(base)?, value.clone())?;
    super::method_usage::guard(tx, t, &old, &next, Some(channel)).await?;
    sqlx::query("INSERT INTO commerce_overrides(tenant,channel_id,data) VALUES($1,$2,$3) ON CONFLICT(tenant,channel_id) DO UPDATE SET data=EXCLUDED.data,revision=commerce_overrides.revision+1").bind(t).bind(channel).bind(value).execute(&mut **tx).await?;
    Ok(())
}
pub(crate) async fn validate_settings_release(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    previous: &Value,
) -> Result<()> {
    let value: Value =
        sqlx::query_scalar("SELECT data FROM commerce_settings WHERE tenant=$1 FOR UPDATE")
            .bind(t)
            .fetch_one(&mut **tx)
            .await?;
    let next = decode_config(value)?;
    validate_config(&next)?;
    super::method_usage::guard(tx, t, &decode_config(previous.clone())?, &next, None).await?;
    let tax_ids = next.taxes.iter().map(|v| v.id.clone()).collect::<Vec<_>>();
    let stranded:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND extra->>'taxClassId' IS NOT NULL AND NOT(extra->>'taxClassId'=ANY($2)))").bind(t).bind(tax_ids).fetch_one(&mut **tx).await?;
    if stranded {
        return Err(bad("Tax class is assigned to products"));
    }
    let patches: Vec<Value> =
        sqlx::query_scalar("SELECT data FROM commerce_overrides WHERE tenant=$1")
            .bind(t)
            .fetch_all(&mut **tx)
            .await?;
    for patch in patches {
        super::settings_patch::resolve(&next, patch)?;
    }
    super::product_languages::register(tx, &next).await?;
    Ok(())
}
