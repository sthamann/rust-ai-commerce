//! Optimistic settings persistence and audit event.
use super::*;

pub(crate) async fn save_config(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.write")?;
    let t = merchant(&a, &h)?;
    let s = decode_config(v["data"].clone())?;
    validate_config(&s)?;
    let revision = v["revision"]
        .as_i64()
        .ok_or(bad("Configuration revision required"))?;
    let mut tx = a.db.begin().await?;
    // Serialize configuration with product assignments and translation apply, so
    // a concurrently removed class/language cannot be committed from an older read.
    let previous =
        sqlx::query("SELECT data,revision FROM commerce_settings WHERE tenant=$1 FOR UPDATE")
            .bind(&t)
            .fetch_one(&mut *tx)
            .await?;
    let previous = decode_config(previous.get("data"))?;
    super::method_usage::guard(&mut tx, &t, &previous, &s, None).await?;
    let patches: Vec<Value> =
        sqlx::query_scalar("SELECT data FROM commerce_overrides WHERE tenant=$1")
            .bind(&t)
            .fetch_all(&mut *tx)
            .await?;
    for patch in patches {
        super::settings_patch::resolve(&s, patch)?;
    }
    super::product_languages::register(&mut tx, &s).await?;
    let tax_ids = s.taxes.iter().map(|t| t.id.clone()).collect::<Vec<_>>();
    let stranded:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND extra->>'taxClassId' IS NOT NULL AND NOT(extra->>'taxClassId'=ANY($2)))").bind(&t).bind(tax_ids).fetch_one(&mut *tx).await?;
    if stranded {
        return Err(bad("Tax class is assigned to products"));
    }
    let r=sqlx::query("UPDATE commerce_settings SET data=$1,revision=revision+1 WHERE tenant=$2 AND revision=$3 RETURNING revision").bind(json!(s)).bind(&t).bind(revision).fetch_optional(&mut *tx).await?.ok_or(conflict("Configuration changed; reload first"))?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'commerce.configured',$2)")
        .bind(t)
        .bind(json!({"revision":r.get::<i64,_>("revision")}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"revision":r.get::<i64,_>("revision")})))
}
