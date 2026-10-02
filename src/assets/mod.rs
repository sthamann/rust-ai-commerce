//! Product attachments and paid digital downloads: bounded binary persistence and tenant/account ACL.
use crate::*;
mod download;
mod rich;
mod upload;
pub(crate) use rich::validate_rich;
pub(crate) use upload::{list, publish};
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route(
            "/api/merchant/products/{id}/assets",
            get(upload::list).post(upload::upload),
        )
        .route(
            "/api/merchant/assets/{id}",
            axum::routing::put(upload::publish),
        )
        .route(
            "/store-api/product/{id}/attachments",
            get(download::attachments),
        )
        .route("/store-api/assets/{id}", get(download::attachment))
        .route("/store-api/account/downloads", get(download::owned))
        .route(
            "/store-api/orders/{order}/downloads/{asset}",
            get(download::file),
        )
        .layer(axum::extract::DefaultBodyLimit::max(
            8 * 1024 * 1024 + 65536,
        ))
}
pub(crate) async fn snapshot(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
    order: &str,
) -> Result<()> {
    for item in &c.data.items {
        let r = sqlx::query("SELECT id,parent_id,extra FROM products WHERE tenant=$1 AND id=$2")
            .bind(&c.tenant)
            .bind(&item.id)
            .fetch_one(&mut **tx)
            .await?;
        let extra: Value = r.get("extra");
        let parent: Option<String> = r.get("parent_id");
        let parent_extra: Value = if let Some(parent) = &parent {
            sqlx::query_scalar("SELECT extra FROM products WHERE tenant=$1 AND id=$2")
                .bind(&c.tenant)
                .bind(parent)
                .fetch_one(&mut **tx)
                .await?
        } else {
            json!({})
        };
        let digital = extra.get("digital").unwrap_or(&parent_extra["digital"]) == true;
        if digital {
            let n=sqlx::query("INSERT INTO order_downloads(tenant,order_id,asset_id) SELECT tenant,$1,id FROM product_assets WHERE tenant=$2 AND product_id=ANY($3) AND kind='download' AND public ON CONFLICT DO NOTHING").bind(order).bind(&c.tenant).bind(vec![item.id.clone(),parent.unwrap_or_default()]).execute(&mut **tx).await?.rows_affected();
            if n == 0 {
                return Err(bad("Digital product has no published download"));
            }
        }
    }
    Ok(())
}
