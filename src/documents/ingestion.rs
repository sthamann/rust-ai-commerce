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
    Ok(Json(save(&a, &tenant(&h)?, &v, "api").await?))
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
        } else if ["title", "productId"].contains(&name.as_str()) {
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
        save(&a, &t, &v, if pdf { "pdf" } else { "upload-text" }).await?,
    ))
}
async fn save(a: &App, t: &str, v: &Value, source: &str) -> Result<Value> {
    if v.as_object().is_none_or(|o| {
        o.keys()
            .any(|k| !["title", "content", "productId"].contains(&k.as_str()))
    }) {
        return Err(bad("Unsupported source field"));
    }
    let title = v["title"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 200)
        .ok_or(bad("Title required, maximum 200 bytes"))?;
    let text = v["content"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 100_000)
        .ok_or(bad("Document text must be 1..100000 UTF-8 bytes"))?;
    let product = v["productId"].as_str().filter(|s| !s.is_empty());
    let digest = hash(text);
    let mut tx = a.db.begin().await?;
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
    if let Some(id)=sqlx::query_scalar::<_,String>("SELECT id FROM knowledge_documents WHERE tenant=$1 AND product_id IS NOT DISTINCT FROM $2 AND content_hash=$3").bind(t).bind(product).bind(&digest).fetch_optional(&mut *tx).await? {return Ok(json!({"id":id,"reused":true,"visibility":"private-or-existing"}));}
    let id = uid();
    sqlx::query("INSERT INTO knowledge_documents(tenant,id,product_id,title,content_hash,content,source_type) VALUES($1,$2,$3,$4,$5,$6,$7)").bind(t).bind(&id).bind(product).bind(title).bind(&digest).bind(text).bind(source).execute(&mut *tx).await?;
    let chars = text.chars().collect::<Vec<_>>();
    for (position, chunk) in chars.chunks(1200).enumerate() {
        sqlx::query(
            "INSERT INTO knowledge_chunks(tenant,document_id,position,text) VALUES($1,$2,$3,$4)",
        )
        .bind(t)
        .bind(&id)
        .bind(position as i32)
        .bind(chunk.iter().collect::<String>())
        .execute(&mut *tx)
        .await?;
    }
    knowledge::sync_document(&mut tx, t, &id, product, title, &digest).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'knowledge.document.ingested',$2)")
        .bind(t)
        .bind(json!({"documentId":id,"productId":product,"sourceType":source}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(
        json!({"id":id,"contentHash":digest,"revision":1,"visibility":"private","chunks":chars.len().div_ceil(1200),"sourceType":source}),
    )
}
pub(crate) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
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
    let n=sqlx::query("UPDATE knowledge_documents SET visibility=$1,revision=revision+1 WHERE tenant=$2 AND id=$3 AND revision=$4").bind(visibility).bind(t).bind(&id).bind(v["revision"].as_i64()).execute(&a.db).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Document changed or unavailable"));
    }
    Ok(Json(
        json!({"updated":true,"id":id,"visibility":visibility}),
    ))
}
