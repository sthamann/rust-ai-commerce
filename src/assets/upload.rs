//! File admission, immutable bytes and explicit publishing; binary content never enters merchant list responses.
use super::*;
pub(crate) async fn list(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog.read")?;
    let rows=sqlx::query("SELECT id,title,filename,mime,kind,public,digest,octet_length(content) AS bytes FROM product_assets WHERE tenant=$1 AND product_id=$2 ORDER BY created_at DESC LIMIT 50").bind(t).bind(id).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"title":r.get::<Value,_>("title"),"filename":r.get::<String,_>("filename"),"mime":r.get::<String,_>("mime"),"kind":r.get::<String,_>("kind"),"public":r.get::<bool,_>("public"),"digest":r.get::<String,_>("digest"),"bytes":r.get::<i32,_>("bytes")})).collect::<Vec<_>>()}),
    ))
}
pub(super) async fn upload(
    State(a): State<App>,
    h: RequestContext,
    Path(product): Path<String>,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    let mut bytes = None;
    let mut filename = String::new();
    let mut mime = String::new();
    let mut kind = "attachment".to_string();
    let mut title = json!({});
    let mut seen = vec![];
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| bad("Invalid asset upload"))?
    {
        let name = field.name().unwrap_or("").to_string();
        if seen.contains(&name) {
            return Err(bad("Duplicate upload field"));
        }
        seen.push(name.clone());
        match name.as_str() {
            "file" => {
                filename = field.file_name().unwrap_or("file").to_string();
                mime = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let content = field
                    .bytes()
                    .await
                    .map_err(|_| bad("Asset exceeds upload limit"))?;
                if content.is_empty() || content.len() > 8 * 1024 * 1024 {
                    return Err(bad("Asset must contain 1 byte..8 MiB"));
                }
                bytes = Some(content.to_vec());
            }
            "kind" => kind = field.text().await.map_err(|_| bad("Invalid kind"))?,
            "title" => {
                title = serde_json::from_str(&field.text().await.map_err(|_| bad("Invalid title"))?)
                    .map_err(|_| bad("Translated title required"))?
            }
            _ => return Err(bad("Unknown upload field")),
        }
    }
    if !["attachment", "download"].contains(&kind.as_str())
        || filename.len() > 180
        || filename.contains(['\\', '/', '\r', '\n', '"'])
        || filename.is_empty()
    {
        return Err(bad("Invalid asset filename or kind"));
    }
    let (settings, _) = commerce::config(&a, &t).await?;
    commerce::validate_names(&title, &settings, 200)?;
    let content = bytes.ok_or(bad("File required"))?;
    validate_bytes(&mime, &content)?;
    let id = uid();
    let digest = format!("{:x}", Sha256::digest(&content));
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT id FROM products WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(&t)
        .bind(&product)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Product not found".into()))?;
    let n: i64 =
        sqlx::query_scalar("SELECT count(*) FROM product_assets WHERE tenant=$1 AND product_id=$2")
            .bind(&t)
            .bind(&product)
            .fetch_one(&mut *tx)
            .await?;
    if n >= 50 {
        return Err(bad("Maximum 50 assets per product"));
    }
    sqlx::query("INSERT INTO product_assets(tenant,id,product_id,title,filename,mime,kind,content,digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)").bind(&t).bind(&id).bind(product).bind(title).bind(filename).bind(mime).bind(kind).bind(content).bind(&digest).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"shop":t,"digest":digest,"public":false}),
    ))
}
fn validate_bytes(mime: &str, b: &[u8]) -> Result<()> {
    let ok = match mime {
        "application/pdf" => b.starts_with(b"%PDF-"),
        "image/png" => b.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => b.starts_with(&[255, 216, 255]),
        "image/webp" => b.starts_with(b"RIFF") && b.get(8..12) == Some(b"WEBP"),
        "video/mp4" => b.get(4..8) == Some(b"ftyp"),
        "application/zip" => b.starts_with(b"PK\x03\x04"),
        "text/plain" => std::str::from_utf8(b).is_ok(),
        _ => false,
    };
    if ok {
        Ok(())
    } else {
        Err(bad("Unsupported file type or mismatched content"))
    }
}
pub(crate) async fn publish(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "catalog")?;
    let public = v["public"].as_bool().ok_or(bad("public required"))?;
    let n =
        sqlx::query("UPDATE product_assets SET public=$1 WHERE tenant=$2 AND id=$3 AND digest=$4")
            .bind(public)
            .bind(t)
            .bind(id)
            .bind(v["digest"].as_str().ok_or(bad("digest required"))?)
            .execute(&a.db)
            .await?
            .rows_affected();
    if n != 1 {
        return Err(conflict("Asset digest changed or unavailable"));
    }
    Ok(Json(json!({"saved":true})))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unsafe_files_rejected() {
        assert!(validate_bytes("text/html", b"<script>bad</script>").is_err());
        assert!(validate_bytes("application/pdf", b"bad").is_err());
        assert!(validate_bytes("text/plain", b"Manual").is_ok());
    }
}
