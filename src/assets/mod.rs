//! Product attachments and paid digital downloads: bounded binary persistence and tenant/account ACL.
use crate::*;
mod download;
mod image_jobs;
mod image_provider;
mod rich;
mod rich_document;
pub(crate) use rich_document::safe_url;
mod upload;
pub(crate) use image_jobs::image_once;
pub(crate) use rich::validate_rich;
pub(crate) use upload::{list, publish};
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/api/merchant/media/provider", get(image_jobs::provider))
        .route(
            "/api/merchant/products/{id}/media/jobs",
            get(image_jobs::list_jobs).post(image_jobs::enqueue),
        )
        .route("/api/merchant/media/jobs/{id}", get(image_jobs::detail))
        .route(
            "/api/merchant/media/jobs/{id}/apply",
            post(image_jobs::apply),
        )
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

pub(crate) fn media_permission(name: &str) -> Option<&'static str> {
    match name {
        "merchant.media.provider" | "merchant.media.list" | "merchant.media.detail" => {
            Some("catalog.read")
        }
        "merchant.media.create" | "merchant.media.apply" => Some("catalog.write"),
        _ => None,
    }
}
pub(crate) async fn media_invoke(a: &App, h: &HeaderMap, name: &str, v: &Value) -> Result<Value> {
    let state = State(a.clone());
    let headers = h.clone();
    let id = || {
        v["id"]
            .as_str()
            .map(String::from)
            .ok_or(bad("Image ID required"))
    };
    let Json(result) = match name {
        "merchant.media.provider" => image_jobs::provider(state, headers).await?,
        "merchant.media.create" => {
            image_jobs::enqueue(
                state,
                headers,
                Path(
                    v["productId"]
                        .as_str()
                        .ok_or(bad("Product ID required"))?
                        .into(),
                ),
                Json(v.clone()),
            )
            .await?
        }
        "merchant.media.list" => {
            image_jobs::list_jobs(
                state,
                headers,
                Path(
                    v["productId"]
                        .as_str()
                        .ok_or(bad("Product ID required"))?
                        .into(),
                ),
            )
            .await?
        }
        "merchant.media.detail" => image_jobs::detail(state, headers, Path(id()?)).await?,
        "merchant.media.apply" => {
            image_jobs::apply(state, headers, Path(id()?), Json(v.clone())).await?
        }
        _ => return Err(bad("Unknown media capability")),
    };
    Ok(result)
}
