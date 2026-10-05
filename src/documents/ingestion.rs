//! Typed API and bounded upload write source hashes, chunks and graph relations atomically.
use super::*;
use axum::extract::Multipart;
pub(crate) async fn ingest(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    Ok(Json(save(&a, &h, &tenant(&h)?, &v, "api").await?))
}
pub(crate) async fn upload(
    State(a): State<App>,
    h: HeaderMap,
    mut form: Multipart,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    let mut v = json!({});
    let mut file = None;
    let mut names = std::collections::HashSet::new();
    while let Some(field) = form
        .next_field()
        .await
        .map_err(|_| bad("Invalid multipart document"))?
    {
        let name = field.name().unwrap_or("").to_owned();
        if !names.insert(name.clone()) {
            return Err(bad("Duplicate upload field"));
        }
        if name == "file" {
            let pdf = field
                .file_name()
                .is_some_and(|n| n.to_lowercase().ends_with(".pdf"));
            let bytes = field
                .bytes()
                .await
                .map_err(|_| bad("Invalid document upload"))?;
            file = Some((bytes.to_vec(), pdf));
        } else if name == "translations" {
            let text = field
                .text()
                .await
                .map_err(|_| bad("Invalid translations"))?;
            if text.len() > 200_000 {
                return Err(bad("Translations too long"));
            }
            v[name] = serde_json::from_str(&text).map_err(|_| bad("Invalid translation JSON"))?;
        } else if ["title", "productId", "kind", "locale"].contains(&name.as_str()) {
            let text = field
                .text()
                .await
                .map_err(|_| bad("Invalid document metadata"))?;
            if text.len() > 200 {
                return Err(bad("Metadata too long"));
            }
            v[name] = json!(text);
        } else {
            return Err(bad("Unsupported upload field"));
        }
    }
    let (bytes, pdf) = file.ok_or(bad("File required"))?;
    v["content"] = json!(parser::text(bytes, pdf).await?);
    Ok(Json(
        save(&a, &h, &t, &v, if pdf { "pdf" } else { "upload-text" }).await?,
    ))
}
async fn save(a: &App, h: &HeaderMap, t: &str, v: &Value, source: &str) -> Result<Value> {
    let data = content::validate(a, t, v).await?;
    let title = data["title"].as_str().unwrap();
    let text = data["content"].as_str().unwrap();
    let product = data["productId"].as_str();
    let digest = data["digest"].as_str().unwrap();
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, h, "merchant").await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,15))")
        .bind(t)
        .execute(&mut *tx)
        .await?;
    if let Some(product) = product {
        let row = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
            .bind(t)
            .bind(product)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(bad("Unknown owning product"))?;
        knowledge::sync_product(&mut tx, t, &json!(crate::product(&row))).await?;
    }
    if let Some(id)=sqlx::query_scalar::<_,String>("SELECT id FROM knowledge_documents WHERE tenant=$1 AND product_id IS NOT DISTINCT FROM $2 AND content_hash=$3").bind(t).bind(product).bind(digest).fetch_optional(&mut *tx).await? {return Ok(json!({"id":id,"reused":true,"visibility":"private-or-existing"}));}
    let id = uid();
    sqlx::query("INSERT INTO knowledge_documents(tenant,id,product_id,title,content_hash,content,source_type,kind,locale,translations) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)").bind(t).bind(&id).bind(product).bind(title).bind(digest).bind(text).bind(source).bind(data["kind"].as_str()).bind(data["locale"].as_str()).bind(&data["translations"]).execute(&mut *tx).await?;
    let chunks = content::chunks(&mut tx, t, &id, &data).await?;
    knowledge::sync_document(&mut tx, t, &id, product, title, digest).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'knowledge.document.ingested',$2)")
        .bind(t)
        .bind(json!({"documentId":id,"productId":product,"sourceType":source}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(
        json!({"id":id,"contentHash":digest,"revision":1,"visibility":"private","chunks":chunks,"sourceType":source}),
    )
}
pub(crate) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "knowledge.read")?;
    let rows=sqlx::query("SELECT id,product_id,title,source_type,visibility,revision,content_hash FROM knowledge_documents WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"productId":r.get::<Option<String>,_>("product_id"),"title":r.get::<String,_>("title"),"sourceType":r.get::<String,_>("source_type"),"visibility":r.get::<String,_>("visibility"),"revision":r.get::<i64,_>("revision"),"contentHash":r.get::<String,_>("content_hash")})).collect::<Vec<_>>() }),
    ))
}
pub(crate) async fn publish(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    let visibility = v["visibility"]
        .as_str()
        .filter(|v| ["private", "public"].contains(v))
        .ok_or(bad("Visibility must be private/public"))?;
    if v["approve"] != true {
        return Err(bad("Explicit publication decision required"));
    }
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    let n=sqlx::query("UPDATE knowledge_documents SET visibility=$1,revision=revision+1 WHERE tenant=$2 AND id=$3 AND revision=$4 AND NOT archived").bind(visibility).bind(&t).bind(&id).bind(v["revision"].as_i64()).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Document changed or unavailable"));
    }
    lifecycle::record(
        &mut tx,
        &t,
        &id,
        "knowledge.document.visibility",
        json!({"visibility":visibility}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"updated":true,"id":id,"visibility":visibility}),
    ))
}
