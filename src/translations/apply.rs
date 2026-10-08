//! Apply at most 50 reviewed drafts per request; stale products become conflicts rather than being overwritten.
use super::*;
pub(crate) async fn apply(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog")?;
    let t = merchant(&a, &h)?;
    let mut tx = a.db.begin().await?;
    let data: Value =
        sqlx::query_scalar("SELECT data FROM commerce_settings WHERE tenant=$1 FOR SHARE")
            .bind(&t)
            .fetch_one(&mut *tx)
            .await?;
    let settings = commerce::decode_config(data)?;
    let job = sqlx::query(
        "SELECT * FROM translation_jobs WHERE tenant=$1 AND id=$2 AND status='ready' FOR UPDATE",
    )
    .bind(&t)
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(conflict("Translation job is not ready"))?;
    let target: String = job.get("target_locale");
    if !settings.locales.contains(&target)
        || settings.main_locale != job.get::<String, _>("source_locale")
    {
        return Err(conflict("Shop languages changed during translation"));
    }
    let key = fields::key(&target, &settings.locales);
    let selected = v["productId"].as_str();
    let items=sqlx::query("SELECT * FROM translation_items WHERE tenant=$1 AND job_id=$2 AND status='ready' AND ($3::text IS NULL OR product_id=$3) ORDER BY product_id FOR UPDATE LIMIT 50").bind(&t).bind(&id).bind(selected).fetch_all(&mut *tx).await?;
    let mut applied = 0;
    let mut conflicts = 0;
    for item in items {
        let pid: String = item.get("product_id");
        let revision: i64 = item.get("revision");
        let product = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2 FOR UPDATE")
            .bind(&t)
            .bind(&pid)
            .fetch_optional(&mut *tx)
            .await?;
        let status = if let Some(row) = product.filter(|p| {
            u64::try_from(p.get::<i64, _>("revision"))
                .ok()
                .zip(u64::try_from(revision).ok())
                .is_some_and(|(current, expected)| {
                    verified_kernel::revision_admissible(current, expected)
                })
        }) {
            let result: Value = item.get("result");
            let mut extra: Value = row.get("extra");
            for name in ["seo", "specifications", "richDescription"] {
                if !result[name].is_null() {
                    if !extra[name].is_object() {
                        extra[name] = json!({});
                    }
                    extra[name][&key] = result[name].clone();
                }
            }
            // Persist through the same safe rich-content validator used by manual edits.
            if !extra["richDescription"].is_null() {
                assets::validate_rich(&extra["richDescription"])?;
            }
            sqlx::query("INSERT INTO product_translations(tenant,product_id,language_id,name,description) SELECT $1,$2,id,$3,$4 FROM languages WHERE locale=$5 ON CONFLICT(tenant,product_id,language_id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description").bind(&t).bind(&pid).bind(result["name"].as_str()).bind(result["description"].as_str()).bind(&target).execute(&mut *tx).await?;
            sqlx::query(
                "UPDATE products SET extra=$1,revision=revision+1 WHERE tenant=$2 AND id=$3",
            )
            .bind(extra)
            .bind(&t)
            .bind(&pid)
            .execute(&mut *tx)
            .await?;
            sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'product.updated',$2)")
                .bind(&t)
                .bind(json!({"productId":pid,"locale":target,"revision":revision+1,"jobId":id}))
                .execute(&mut *tx)
                .await?;
            applied += 1;
            "applied"
        } else {
            conflicts += 1;
            "conflict"
        };
        sqlx::query("UPDATE translation_items SET status=$1 WHERE tenant=$2 AND job_id=$3 AND product_id=$4").bind(status).bind(&t).bind(&id).bind(pid).execute(&mut *tx).await?;
    }
    let remaining: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM translation_items WHERE tenant=$1 AND job_id=$2 AND status='ready'",
    )
    .bind(&t)
    .bind(&id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"applied":applied,"conflicts":conflicts,"remaining":remaining}),
    ))
}
