//! Durable image jobs: tenant admission, revision-bound private previews and explicit publication, without automatic paid retries.
use crate::*;
use base64::{Engine, engine::general_purpose::STANDARD};
pub(super) async fn provider(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "catalog.read")?;
    Ok(Json(
        json!({"configured":super::image_provider::configured(),"model":super::image_provider::model()}),
    ))
}
pub(super) async fn enqueue(
    State(a): State<App>,
    h: HeaderMap,
    Path(product): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog")?;
    let t = merchant(&a, &h)?;
    let prompt = v["prompt"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 2000)
        .ok_or(bad("Image instructions required (up to 2000 bytes)"))?;
    let mode = v["mode"]
        .as_str()
        .filter(|s| ["generate", "optimize"].contains(s))
        .ok_or(bad("Invalid image mode"))?;
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE")
        .bind(&t)
        .fetch_one(&mut *tx)
        .await?;
    let p = sqlx::query(
        "SELECT revision,name,description FROM products WHERE tenant=$1 AND id=$2 FOR UPDATE",
    )
    .bind(&t)
    .bind(&product)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(Error(StatusCode::NOT_FOUND, "Product not found".into()))?;
    if v["revision"].as_i64() != Some(p.get("revision")) {
        return Err(conflict("Product changed; save or reload first"));
    }
    if mode == "optimize" {
        let source = v["sourceId"].as_str().ok_or(bad("Source asset required"))?;
        let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product_assets WHERE tenant=$1 AND product_id=$2 AND id=$3 AND mime IN ('image/png','image/jpeg','image/webp'))").bind(&t).bind(&product).bind(source).fetch_one(&mut *tx).await?;
        if !exists {
            return Err(bad(
                "Optimization needs an uploaded image belonging to this product",
            ));
        }
    }
    if !super::image_provider::configured() {
        return Err(bad("Image provider not configured"));
    }
    let count:i64=sqlx::query_scalar("SELECT count(*) FROM media_jobs WHERE tenant=$1 AND product_id=$2 AND state IN ('queued','processing')").bind(&t).bind(&product).fetch_one(&mut *tx).await?;
    if count > 0 {
        return Err(conflict("An image job is already running for this product"));
    }
    let queued: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM media_jobs WHERE tenant=$1 AND state IN ('queued','processing')",
    )
    .bind(&t)
    .fetch_one(&mut *tx)
    .await?;
    if queued >= 10 {
        return Err(bad("Maximum 10 pending image jobs per shop"));
    }
    let id = uid();
    let instruction = format!(
        "Product: {}. Description: {}. Merchant instructions: {prompt}. Preserve factual product shape, materials and proportions. Do not invent logos or product claims.",
        p.get::<String, _>("name"),
        p.get::<String, _>("description")
    );
    sqlx::query("INSERT INTO media_jobs(tenant,id,product_id,product_revision,request) VALUES($1,$2,$3,$4,$5)").bind(&t).bind(&id).bind(&product).bind(p.get::<i64,_>("revision")).bind(json!({"mode":mode,"sourceId":v["sourceId"],"prompt":instruction})).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id,"state":"queued"})))
}
pub(super) async fn list_jobs(
    State(a): State<App>,
    h: HeaderMap,
    Path(product): Path<String>,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog.read")?;
    let t = merchant(&a, &h)?;
    let rows = sqlx::query("SELECT id,state FROM media_jobs WHERE tenant=$1 AND product_id=$2 AND state IN ('queued','processing','ready') ORDER BY created_at DESC LIMIT 5")
        .bind(t).bind(product).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"jobs":rows.iter().map(|r| json!({"id":r.get::<String,_>("id"),"state":r.get::<String,_>("state")})).collect::<Vec<_>>()}),
    ))
}
pub(super) async fn detail(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog.read")?;
    let t = merchant(&a, &h)?;
    let row = sqlx::query("SELECT state,error,asset_id FROM media_jobs WHERE tenant=$1 AND id=$2")
        .bind(&t)
        .bind(&id)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Image job not found".into()))?;
    let mut v = json!({"id":id,"state":row.get::<String,_>("state"),"error":row.get::<Option<String>,_>("error"),"assetId":row.get::<Option<String>,_>("asset_id")});
    if let Some(asset) = row.get::<Option<String>, _>("asset_id") {
        let bytes: Vec<u8> =
            sqlx::query_scalar("SELECT content FROM product_assets WHERE tenant=$1 AND id=$2")
                .bind(&t)
                .bind(asset)
                .fetch_one(&a.db)
                .await?;
        v["preview"] = json!(format!("data:image/png;base64,{}", STANDARD.encode(bytes)));
    }
    Ok(Json(v))
}
pub(super) async fn apply(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog")?;
    let t = merchant(&a, &h)?;
    let mut tx = a.db.begin().await?;
    let job = sqlx::query("SELECT * FROM media_jobs WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(&t)
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Image job not found".into()))?;
    if job.get::<String, _>("state") != "ready" {
        return Err(conflict("Image is not ready for review"));
    }
    let revision: i64 =
        sqlx::query_scalar("SELECT revision FROM products WHERE tenant=$1 AND id=$2 FOR UPDATE")
            .bind(&t)
            .bind(job.get::<String, _>("product_id"))
            .fetch_one(&mut *tx)
            .await?;
    if v["revision"].as_i64() != Some(revision) || revision != job.get::<i64, _>("product_revision")
    {
        return Err(conflict(
            "Product changed since image generation; start a fresh draft",
        ));
    }
    let asset: String = job.get("asset_id");
    sqlx::query("UPDATE product_assets SET public=true WHERE tenant=$1 AND id=$2")
        .bind(&t)
        .bind(&asset)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE media_jobs SET state='applied' WHERE tenant=$1 AND id=$2")
        .bind(&t)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":asset,"url":format!("/store-api/assets/{asset}?shop={t}"),"view":"","alt":{}}),
    ))
}
pub(crate) async fn image_once(a: &App) -> Result<()> {
    // Interrupted provider calls are deliberately not retried: a lost response may already have incurred a charge.
    sqlx::query("UPDATE media_jobs SET state='failed',error='Image request interrupted; start a new job manually' WHERE state='processing' AND started_at < now()-interval '5 minutes'").execute(&a.db).await?;
    if !super::image_provider::configured() {
        return Ok(());
    }
    let job=sqlx::query("UPDATE media_jobs SET state='processing',started_at=now() WHERE (tenant,id)=(SELECT tenant,id FROM media_jobs WHERE state='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *").fetch_optional(&a.db).await?;
    let Some(job) = job else {
        return Ok(());
    };
    let t: String = job.get("tenant");
    let id: String = job.get("id");
    let product: String = job.get("product_id");
    let request: Value = job.get("request");
    let output = generate(a, &t, &product, &request).await;
    match output {
        Ok(asset) => {
            sqlx::query("UPDATE media_jobs SET state='ready',asset_id=$1 WHERE tenant=$2 AND id=$3 AND state='processing'").bind(asset).bind(&t).bind(&id).execute(&a.db).await?;
        }
        Err(e) => {
            sqlx::query("UPDATE media_jobs SET state='failed',error=$1 WHERE tenant=$2 AND id=$3")
                .bind(e.1)
                .bind(&t)
                .bind(&id)
                .execute(&a.db)
                .await?;
        }
    }
    Ok(())
}
async fn generate(a: &App, t: &str, product: &str, request: &Value) -> Result<String> {
    let source = if request["mode"] == "optimize" {
        let r = sqlx::query(
            "SELECT mime,content FROM product_assets WHERE tenant=$1 AND product_id=$2 AND id=$3",
        )
        .bind(t)
        .bind(product)
        .bind(request["sourceId"].as_str().unwrap_or(""))
        .fetch_one(&a.db)
        .await?;
        Some((r.get("mime"), r.get("content")))
    } else {
        None
    };
    let bytes = super::image_provider::create(
        request["prompt"]
            .as_str()
            .ok_or(bad("Invalid image instructions"))?,
        source,
    )
    .await?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let asset = uid();
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT id FROM products WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(t)
        .bind(product)
        .fetch_one(&mut *tx)
        .await?;
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM product_assets WHERE tenant=$1 AND product_id=$2")
            .bind(t)
            .bind(product)
            .fetch_one(&mut *tx)
            .await?;
    if count >= 50 {
        return Err(bad("Maximum 50 assets per product"));
    }
    sqlx::query("INSERT INTO product_assets(tenant,id,product_id,title,filename,mime,kind,content,digest) VALUES($1,$2,$3,'{}','generated-image.png','image/png','attachment',$4,$5)").bind(t).bind(&asset).bind(product).bind(bytes).bind(digest).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(asset)
}
