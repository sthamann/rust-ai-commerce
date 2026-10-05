//! Revisioned tenant company basis and sparse channel overrides, serialized with receipt issuance.
use super::*;
pub(crate) async fn lock(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, t: &str) -> Result<()> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,731))")
        .bind(t)
        .execute(&mut **tx)
        .await?;
    Ok(())
}
pub(super) async fn records(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    channel: Option<&str>,
) -> Result<Value> {
    let row = sqlx::query("SELECT data,revision FROM receipt_settings WHERE tenant=$1")
        .bind(t)
        .fetch_optional(&mut **tx)
        .await?;
    let base = row
        .as_ref()
        .map(|r| r.get::<Value, _>("data"))
        .unwrap_or(json!({}));
    let rev = row.map(|r| r.get::<i64, _>("revision")).unwrap_or(0);
    if let Some(channel) = channel {
        if channel == "default" {
            return Err(bad("Default channel uses the shared company basis"));
        }
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM sales_channels WHERE tenant=$1 AND id=$2)",
        )
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
        let patch = sqlx::query(
            "SELECT data,revision FROM company_overrides WHERE tenant=$1 AND channel_id=$2",
        )
        .bind(t)
        .bind(channel)
        .fetch_optional(&mut **tx)
        .await?;
        let data = patch
            .as_ref()
            .map(|r| r.get::<Value, _>("data"))
            .unwrap_or(json!({}));
        let revision = patch.map(|r| r.get::<i64, _>("revision")).unwrap_or(0);
        Ok(
            json!({"data":data,"revision":revision,"baseRevision":rev,"inherited":base,"effective":company_model::resolve(&base,&data),"channelId":channel}),
        )
    } else {
        Ok(json!({"data":base,"revision":rev}))
    }
}
pub(super) async fn read(a: &App, h: &HeaderMap, channel: Option<&str>) -> Result<Json<Value>> {
    let t = merchant(a, h)?;
    let mut tx = a.db.begin().await?;
    lock(&mut tx, &t).await?;
    let value = records(&mut tx, &t, channel).await?;
    tx.commit().await?;
    Ok(Json(value))
}
pub(super) async fn get(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "settings.read")?;
    read(&a, &h, None).await
}
pub(super) async fn get_channel(
    State(a): State<App>,
    h: HeaderMap,
    Path(channel): Path<String>,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "settings.read")?;
    read(&a, &h, Some(&channel)).await
}
pub(super) async fn put(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "settings.write")?;
    save(&a, &h, v, None).await
}
pub(super) async fn put_channel(
    State(a): State<App>,
    h: HeaderMap,
    Path(channel): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "settings.write")?;
    save(&a, &h, v, Some(&channel)).await
}
pub(super) async fn save(
    a: &App,
    h: &HeaderMap,
    v: Value,
    channel: Option<&str>,
) -> Result<Json<Value>> {
    let t = merchant(a, h)?;
    let expected = v["revision"]
        .as_i64()
        .filter(|n| *n >= 0)
        .ok_or(bad("revision required"))?;
    let mut tx = a.db.begin().await?;
    lock(&mut tx, &t).await?;
    let raw: Value =
        sqlx::query_scalar("SELECT data FROM commerce_settings WHERE tenant=$1 FOR SHARE")
            .bind(&t)
            .fetch_one(&mut *tx)
            .await?;
    let settings = commerce::decode_config(raw)?;
    company_model::validate(&v["data"], &settings, channel.is_some())?;
    let current = records(&mut tx, &t, channel).await?;
    if current["revision"].as_i64() != Some(expected)
        || channel.is_some() && current["baseRevision"] != v["baseRevision"]
    {
        return Err(conflict("Company settings changed; reload before saving"));
    }
    let data = if channel.is_some() {
        v["data"].clone()
    } else {
        company_model::resolve(&v["data"], &json!({}))
    };
    let effective = if channel.is_some() {
        company_model::resolve(&current["inherited"], &data)
    } else {
        data.clone()
    };
    company_model::validate(&effective, &settings, false)?;
    // A basis edit also checks all dependants: inherited country changes cannot leave a foreign subdivision.
    if channel.is_none() {
        let patches: Vec<Value> =
            sqlx::query_scalar("SELECT data FROM company_overrides WHERE tenant=$1")
                .bind(&t)
                .fetch_all(&mut *tx)
                .await?;
        for patch in patches {
            company_model::validate(&company_model::resolve(&data, &patch), &settings, false)?;
        }
    }
    if let Some(logo) = effective["logoId"].as_str().filter(|s| !s.is_empty()) {
        let owned: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM company_logos WHERE tenant=$1 AND id=$2)",
        )
        .bind(&t)
        .bind(logo)
        .fetch_one(&mut *tx)
        .await?;
        if !owned {
            return Err(bad("Company logo unavailable in this shop"));
        }
    }
    if let Some(channel) = channel {
        sqlx::query("INSERT INTO company_overrides(tenant,channel_id,data) VALUES($1,$2,$3) ON CONFLICT(tenant,channel_id) DO UPDATE SET data=EXCLUDED.data,revision=company_overrides.revision+1").bind(&t).bind(channel).bind(&data).execute(&mut *tx).await?;
    } else {
        sqlx::query("INSERT INTO receipt_settings(tenant,data) VALUES($1,$2) ON CONFLICT(tenant) DO UPDATE SET data=EXCLUDED.data,revision=receipt_settings.revision+1").bind(&t).bind(&data).execute(&mut *tx).await?;
    }
    sqlx::query(
        "INSERT INTO outbox(tenant,kind,data) VALUES($1,'settings.master_data_changed',$2)",
    )
    .bind(&t)
    .bind(json!({"revision":expected+1,"salesChannelId":channel}))
    .execute(&mut *tx)
    .await?;
    let value = records(&mut tx, &t, channel).await?;
    tx.commit().await?;
    Ok(Json(value))
}
pub(super) async fn seller(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    channel: &str,
) -> Result<Value> {
    lock(tx, t).await?;
    let basis = records(tx, t, None).await?;
    if basis["revision"] == 0 {
        return Err(bad("Configure seller details before creating receipts"));
    }
    let patch: Option<Value> =
        sqlx::query_scalar("SELECT data FROM company_overrides WHERE tenant=$1 AND channel_id=$2")
            .bind(t)
            .bind(channel)
            .fetch_optional(&mut **tx)
            .await?;
    Ok(company_model::resolve(
        &basis["data"],
        &patch.unwrap_or(json!({})),
    ))
}

/// Atomic release validates the resulting basis, all channel dependants and tenant-owned logo references.
pub(crate) async fn validate_release(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
) -> Result<()> {
    let raw: Value = sqlx::query_scalar("SELECT data FROM commerce_settings WHERE tenant=$1")
        .bind(t)
        .fetch_one(&mut **tx)
        .await?;
    let settings = commerce::decode_config(raw)?;
    let base: Option<Value> =
        sqlx::query_scalar("SELECT data FROM receipt_settings WHERE tenant=$1")
            .bind(t)
            .fetch_optional(&mut **tx)
            .await?;
    if let Some(base) = base {
        let mut values = vec![base.clone()];
        let patches: Vec<Value> =
            sqlx::query_scalar("SELECT data FROM company_overrides WHERE tenant=$1")
                .bind(t)
                .fetch_all(&mut **tx)
                .await?;
        values.extend(
            patches
                .into_iter()
                .map(|p| company_model::resolve(&base, &p)),
        );
        for value in values {
            company_model::validate(&value, &settings, false)?;
            if let Some(id) = value["logoId"].as_str().filter(|s| !s.is_empty()) {
                let exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM company_logos WHERE tenant=$1 AND id=$2)",
                )
                .bind(t)
                .bind(id)
                .fetch_one(&mut **tx)
                .await?;
                if !exists {
                    return Err(bad("Release company logo unavailable"));
                }
            }
        }
    }
    Ok(())
}
