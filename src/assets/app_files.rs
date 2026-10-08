//! Scoped app access to the existing asset store. Binary callbacks are explicit and private; publishing still uses the native asset lifecycle.
use super::*;
use base64::{Engine as _, engine::general_purpose::STANDARD};
pub(crate) async fn callback(
    a: &App,
    h: &RequestContext,
    operation: &str,
    v: &Value,
) -> Result<Value> {
    let t = merchant(a, h)?;
    auth::permit(h, "catalog.read")?;
    if operation == "assets" {
        let product = v["productId"].as_str();
        let after = v["after"].as_str().unwrap_or("");
        if product.is_some_and(|s| s.len() > 100) || after.len() > 100 {
            return Err(bad("Invalid asset cursor"));
        }
        let rows:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',id,'productId',product_id,'title',title,'filename',filename,'mime',mime,'kind',kind,'public',public,'digest',digest,'bytes',octet_length(content)) FROM product_assets WHERE tenant=$1 AND ($2::text IS NULL OR product_id=$2) AND id>$3 ORDER BY id LIMIT 51").bind(&t).bind(product).bind(after).fetch_all(&a.db).await?;
        let more = rows.len() > 50;
        let items: Vec<_> = rows.into_iter().take(50).collect();
        let cursor = more.then(|| items.last().unwrap()["id"].clone());
        return Ok(json!({"elements":items,"nextCursor":cursor}));
    }
    let id = v["id"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 100)
        .ok_or(bad("Asset ID required"))?;
    let row=sqlx::query("SELECT content,mime,digest,filename,product_id FROM product_assets WHERE tenant=$1 AND id=$2").bind(&t).bind(id).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Asset not found".into()))?;
    if v["productId"]
        .as_str()
        .is_some_and(|p| row.get::<String, _>("product_id") != p)
    {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Asset differs from surface product".into(),
        ));
    }
    let bytes: Vec<u8> = row.get("content");
    if operation == "asset_preview"
        && (!row.get::<String, _>("mime").starts_with("image/") || bytes.len() > 256 * 1024)
    {
        return Err(bad(
            "Inline asset preview requires an image of at most 256 KiB",
        ));
    }
    Ok(
        json!({"id":id,"mime":row.get::<String,_>("mime"),"filename":row.get::<String,_>("filename"),"digest":row.get::<String,_>("digest"),"base64":STANDARD.encode(bytes)}),
    )
}
