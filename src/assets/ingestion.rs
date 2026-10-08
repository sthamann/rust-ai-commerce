//! Shared bounded multipart parser for product uploads and scoped app uploads; file validation/persistence stays in the asset owner.
use super::*;
pub(crate) struct Upload {
    pub bytes: Vec<u8>,
    pub filename: String,
    pub mime: String,
    pub kind: String,
    pub title: Value,
    pub grant: Option<String>,
    pub product: Option<String>,
}
pub(crate) async fn parse(
    mut multipart: axum::extract::Multipart,
    surface: bool,
) -> Result<Upload> {
    let mut bytes = None;
    let mut filename = String::new();
    let mut mime = String::new();
    let mut kind = "attachment".to_string();
    let mut title = json!({});
    let mut seen = vec![];
    let mut grant = None;
    let mut product = None;
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
            "grant" if surface => {
                grant = Some(
                    field
                        .text()
                        .await
                        .map_err(|_| bad("Invalid surface grant"))?,
                )
            }
            "productId" if surface => {
                product = Some(field.text().await.map_err(|_| bad("Invalid product ID"))?)
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
    let bytes = bytes.ok_or(bad("File required"))?;
    if grant.as_ref().is_some_and(|s| s.len() != 64)
        || product.as_ref().is_some_and(|s| s.len() > 100)
    {
        return Err(bad("Invalid upload context"));
    }
    Ok(Upload {
        bytes,
        filename,
        mime,
        kind,
        title,
        grant,
        product,
    })
}
