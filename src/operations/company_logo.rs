//! Tenant-owned logo uploads: bounded decoding, metadata stripping, immutable PNG storage and linked public delivery.
use super::*;
use base64::Engine;
use image::ImageFormat;
use std::io::Cursor;
fn normalize(bytes: &[u8]) -> Result<(Vec<u8>, u32, u32)> {
    if bytes.is_empty() || bytes.len() > 2 * 1024 * 1024 {
        return Err(bad("Logo must contain 1 byte..2 MiB"));
    }
    let format = image::guess_format(bytes).map_err(|_| bad("Invalid company image"))?;
    if ![ImageFormat::Png, ImageFormat::Jpeg, ImageFormat::WebP].contains(&format) {
        return Err(bad("Logo requires PNG, JPEG or WebP"));
    }
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let img = reader
        .decode()
        .map_err(|_| bad("Invalid or oversized company image"))?;
    let (w, h) = (img.width(), img.height());
    let mut output = Cursor::new(Vec::new());
    img.write_to(&mut output, ImageFormat::Png)
        .map_err(|_| bad("Cannot normalize logo"))?;
    if output.get_ref().len() > 2 * 1024 * 1024 {
        return Err(bad("Normalized logo exceeds 2 MiB"));
    }
    Ok((output.into_inner(), w, h))
}
pub(super) async fn upload(
    State(a): State<App>,
    h: HeaderMap,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "settings.write")?;
    let field = multipart
        .next_field()
        .await
        .map_err(|_| bad("Invalid logo upload"))?
        .ok_or(bad("Logo file required"))?;
    if field.name() != Some("file") {
        return Err(bad("Logo file required"));
    }
    let bytes = field.bytes().await.map_err(|_| bad("Logo exceeds 2 MiB"))?;
    if multipart
        .next_field()
        .await
        .map_err(|_| bad("Invalid logo upload"))?
        .is_some()
    {
        return Err(bad("Exactly one logo file required"));
    }
    let (content, w, h) = tokio::task::spawn_blocking(move || normalize(&bytes))
        .await
        .map_err(|_| bad("Cannot decode logo"))??;
    let digest = format!("{:x}", Sha256::digest(&content));
    let mut tx = a.db.begin().await?;
    master_data::lock(&mut tx, &t).await?;
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM company_logos WHERE tenant=$1")
        .bind(&t)
        .fetch_one(&mut *tx)
        .await?;
    let exists: Option<String> =
        sqlx::query_scalar("SELECT id FROM company_logos WHERE tenant=$1 AND digest=$2")
            .bind(&t)
            .bind(&digest)
            .fetch_optional(&mut *tx)
            .await?;
    let id = if let Some(id) = exists {
        id
    } else {
        if count >= 50 {
            return Err(bad("Maximum 50 company logos per shop"));
        }
        let id = uid();
        sqlx::query("INSERT INTO company_logos(tenant,id,content,digest,mime,width,height) VALUES($1,$2,$3,$4,'image/png',$5,$6)").bind(&t).bind(&id).bind(content).bind(&digest).bind(w as i32).bind(h as i32).execute(&mut *tx).await?;
        id
    };
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"digest":digest,"width":w,"height":h,"published":false}),
    ))
}
async fn bytes(a: &App, t: &str, id: &str) -> Result<Response> {
    let data: Vec<u8> =
        sqlx::query_scalar("SELECT content FROM company_logos WHERE tenant=$1 AND id=$2")
            .bind(t)
            .bind(id)
            .fetch_optional(&a.db)
            .await?
            .ok_or(Error(
                StatusCode::NOT_FOUND,
                "Company logo not found".into(),
            ))?;
    Ok((
        [
            ("content-type", "image/png"),
            ("cache-control", "private, no-store"),
            ("x-content-type-options", "nosniff"),
        ],
        data,
    )
        .into_response())
}
pub(super) async fn preview(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "settings.read")?;
    let content: Vec<u8> =
        sqlx::query_scalar("SELECT content FROM company_logos WHERE tenant=$1 AND id=$2")
            .bind(&t)
            .bind(&id)
            .fetch_optional(&a.db)
            .await?
            .ok_or(Error(
                StatusCode::NOT_FOUND,
                "Company logo not found".into(),
            ))?;
    Ok(Json(
        json!({"id":id,"dataUrl":format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(content))}),
    ))
}
#[derive(Deserialize)]
pub(super) struct LogoScope {
    pub shop: String,
    #[serde(default = "default_channel")]
    pub channel: String,
}
fn default_channel() -> String {
    "default".into()
}
pub(super) async fn public(
    State(a): State<App>,
    mut h: HeaderMap,
    Path(id): Path<String>,
    axum::extract::Query(q): axum::extract::Query<LogoScope>,
) -> Result<Response> {
    if let Some(existing) = header(&h, "x-tenant")
        && existing != q.shop
    {
        return Err(bad("Logo shop scope mismatch"));
    }
    h.insert("x-tenant", q.shop.parse().map_err(|_| bad("Invalid shop"))?);
    let t = tenant(&h)?;

    if q.channel != "default" {
        let active:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sales_channels WHERE tenant=$1 AND id=$2 AND data->>'active'='true')").bind(&t).bind(&q.channel).fetch_one(&a.db).await?;
        if !active {
            return Err(Error(
                StatusCode::NOT_FOUND,
                "Sales channel not found".into(),
            ));
        }
    }
    let mut tx = a.db.begin().await?;
    let effective = master_data::seller(&mut tx, &t, &q.channel).await?;
    tx.commit().await?;
    if effective["logoId"] != id {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Company logo is not linked to this channel".into(),
        ));
    }
    bytes(&a, &t, &id).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn active_content_and_truncated_images_rejected() {
        assert!(normalize(b"<svg onload='alert(1)'/>").is_err());
        assert!(normalize(b"\x89PNG\r\n\x1a\n").is_err());
        assert!(normalize(&vec![0; 2 * 1024 * 1024 + 1]).is_err());
    }
    #[test]
    fn normalized_png_decodes_without_metadata() {
        let img = image::DynamicImage::new_rgba8(4, 3);
        let mut b = Cursor::new(Vec::new());
        img.write_to(&mut b, ImageFormat::Png).unwrap();
        let (out, w, h) = normalize(b.get_ref()).unwrap();
        assert_eq!((w, h), (4, 3));
        assert!(image::load_from_memory(&out).is_ok());
    }
}
