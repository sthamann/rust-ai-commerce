//! Optimistic settings persistence and audit event.
use super::*;

pub(crate) async fn save_config(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let s = decode_config(v["data"].clone())?;
    validate_config(&s)?;
    let revision = v["revision"]
        .as_i64()
        .ok_or(bad("Configuration revision required"))?;
    let mut tx = a.db.begin().await?;
    let r=sqlx::query("UPDATE commerce_settings SET data=$1,revision=revision+1 WHERE tenant=$2 AND revision=$3 RETURNING revision").bind(json!(s)).bind(&t).bind(revision).fetch_optional(&mut *tx).await?.ok_or(conflict("Configuration changed; reload first"))?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'commerce.configured',$2)")
        .bind(t)
        .bind(json!({"revision":r.get::<i64,_>("revision")}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"revision":r.get::<i64,_>("revision")})))
}
