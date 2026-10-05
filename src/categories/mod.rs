//! Tenant-scoped category tree, localized navigation and product assignment boundaries.
use crate::*;
mod admin;
mod navigation;
pub(crate) use admin::{create as create_category, list as list_categories, save as save_category};
pub(crate) use navigation::admit;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route(
            "/api/merchant/categories",
            get(admin::list).post(admin::create),
        )
        .route(
            "/api/merchant/categories/{id}",
            axum::routing::put(admin::save),
        )
        .route(
            "/store-api/navigation",
            get(navigation::list).post(navigation::list),
        )
}
pub(crate) async fn assignments(
    tx: &mut sqlx::PgConnection,
    t: &str,
    id: &str,
    ids: &[String],
) -> Result<()> {
    if ids.len() > 100 {
        return Err(bad("Maximum 100 product categories"));
    }
    for category in ids {
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM categories WHERE tenant=$1 AND id=$2)")
                .bind(t)
                .bind(category)
                .fetch_one(&mut *tx)
                .await?;
        if !exists {
            return Err(bad("Category unavailable in this shop"));
        }
    }
    sqlx::query("DELETE FROM product_categories WHERE tenant=$1 AND product_id=$2")
        .bind(t)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for category in ids {
        sqlx::query("INSERT INTO product_categories VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
            .bind(t)
            .bind(id)
            .bind(category)
            .execute(&mut *tx)
            .await?;
    }
    Ok(())
}

/// Provision an independent root and legacy assignments for every newly created shop.
pub(crate) async fn seed(tx: &mut sqlx::PgConnection, t: &str) -> Result<()> {
    sqlx::query("UPDATE products SET product_number=id WHERE tenant=$1 AND product_number IS NULL")
        .bind(t)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO categories(tenant,id,data) VALUES($1,'catalog-root',$2) ON CONFLICT DO NOTHING").bind(t).bind(json!({"active":true,"visible":true,"type":"page","translations":{"en":{"name":"Catalog"},"de":{"name":"Katalog"},"fr":{"name":"Catalogue"},"es":{"name":"Catálogo"}}})).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO categories(tenant,id,parent_id,data) SELECT DISTINCT tenant,'legacy-'||md5(category),'catalog-root',jsonb_build_object('active',true,'visible',true,'type','page','translations',jsonb_build_object('en',jsonb_build_object('name',initcap(category)),'de',jsonb_build_object('name',CASE category WHEN 'furniture' THEN 'Möbel' WHEN 'lighting' THEN 'Leuchten' WHEN 'objects' THEN 'Accessoires' ELSE initcap(category) END),'fr',jsonb_build_object('name',CASE category WHEN 'furniture' THEN 'Meubles' WHEN 'lighting' THEN 'Éclairage' WHEN 'objects' THEN 'Accessoires' ELSE initcap(category) END),'es',jsonb_build_object('name',CASE category WHEN 'furniture' THEN 'Muebles' WHEN 'lighting' THEN 'Iluminación' WHEN 'objects' THEN 'Accesorios' ELSE initcap(category) END))) FROM products WHERE tenant=$1 ON CONFLICT DO NOTHING").bind(t).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO product_categories SELECT tenant,id,'legacy-'||md5(category) FROM products WHERE tenant=$1 ON CONFLICT DO NOTHING").bind(t).execute(tx).await?;
    Ok(())
}
