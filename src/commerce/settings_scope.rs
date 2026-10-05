//! Scoped checkout configuration: basis row lock orders all override writes and authoritative checkout reads.
use super::*;
pub(crate) async fn scoped_config(a: &App, t: &str, channel: &str) -> Result<(Settings, i64)> {
    performance::settings(a, t, channel).await
}
pub(crate) async fn scoped_locked(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    channel: &str,
) -> Result<(Settings, i64)> {
    let row = sqlx::query("SELECT data,revision FROM commerce_settings WHERE tenant=$1 FOR SHARE")
        .bind(t)
        .fetch_one(&mut **tx)
        .await?;
    let base = decode_config(row.get("data"))?;
    let revision: i64 = row.get("revision");
    if channel == "default" {
        return Ok((base, revision));
    }
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sales_channels WHERE tenant=$1 AND id=$2)")
            .bind(t)
            .bind(channel)
            .fetch_one(&mut **tx)
            .await?;
    if !exists {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Sales channel not found".into(),
        ));
    }
    let patch: Option<Value> =
        sqlx::query_scalar("SELECT data FROM commerce_overrides WHERE tenant=$1 AND channel_id=$2")
            .bind(t)
            .bind(channel)
            .fetch_optional(&mut **tx)
            .await?;
    Ok((
        super::settings_patch::resolve(&base, patch.unwrap_or(json!([])))?,
        revision,
    ))
}
pub(crate) async fn get_scope(
    State(a): State<App>,
    h: HeaderMap,
    Path(channel): Path<String>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.read")?;
    let t = merchant(&a, &h)?;
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    let (data, base_revision) = scoped_locked(&mut tx, &t, &channel).await?;
    let row = sqlx::query(
        "SELECT data,revision FROM commerce_overrides WHERE tenant=$1 AND channel_id=$2",
    )
    .bind(&t)
    .bind(&channel)
    .fetch_optional(&mut *tx)
    .await?;
    let base = decode_config(
        sqlx::query_scalar("SELECT data FROM commerce_settings WHERE tenant=$1")
            .bind(&t)
            .fetch_one(&mut *tx)
            .await?,
    )?;
    let patch = row
        .as_ref()
        .map(|r| r.get::<Value, _>("data"))
        .unwrap_or(json!([]));
    let revision = row.map(|r| r.get::<i64, _>("revision")).unwrap_or(0);
    tx.commit().await?;
    Ok(Json(
        json!({"data":data,"revision":revision,"baseRevision":base_revision,"inherited":base,"overrides":patch,"channelId":channel}),
    ))
}
pub(crate) async fn save_scope(
    State(a): State<App>,
    h: HeaderMap,
    Path(channel): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.write")?;
    let t = merchant(&a, &h)?;
    if channel == "default" {
        return Err(bad("Default channel uses the shared settings basis"));
    }
    let next = decode_config(v["data"].clone())?;
    validate_config(&next)?;
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    let row = sqlx::query("SELECT data,revision FROM commerce_settings WHERE tenant=$1 FOR UPDATE")
        .bind(&t)
        .fetch_one(&mut *tx)
        .await?;
    let base = decode_config(row.get("data"))?;
    if v["baseRevision"].as_i64() != Some(row.get("revision")) {
        return Err(conflict("Settings basis changed; reload first"));
    }
    let (old, _) = scoped_locked(&mut tx, &t, &channel).await?;
    let revision: Option<i64> = sqlx::query_scalar(
        "SELECT revision FROM commerce_overrides WHERE tenant=$1 AND channel_id=$2",
    )
    .bind(&t)
    .bind(&channel)
    .fetch_optional(&mut *tx)
    .await?;
    if v["revision"].as_i64() != Some(revision.unwrap_or(0)) {
        return Err(conflict("Channel settings changed; reload first"));
    }
    super::method_usage::guard(&mut tx, &t, &old, &next, Some(&channel)).await?;
    // Channel language availability belongs to the existing sales-channel contract.
    if next.main_locale != base.main_locale
        || next.locales != base.locales
        || json!(next.country_definitions) != json!(base.country_definitions)
        || json!(next.customer_groups) != json!(base.customer_groups)
    {
        return Err(bad(
            "Manage languages and country definitions in the shared basis",
        ));
    }
    let patch = super::settings_patch::difference(&base, &next);
    sqlx::query("INSERT INTO commerce_overrides(tenant,channel_id,data) VALUES($1,$2,$3) ON CONFLICT(tenant,channel_id) DO UPDATE SET data=EXCLUDED.data,revision=commerce_overrides.revision+1").bind(&t).bind(&channel).bind(&patch).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'commerce.configured',$2)")
        .bind(&t)
        .bind(json!({"channelId":channel,"revision":revision.unwrap_or(0)+1}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"data":next,"revision":revision.unwrap_or(0)+1,"baseRevision":v["baseRevision"],"inherited":base,"overrides":patch,"channelId":channel}),
    ))
}
