//! SKU loading with parent translation fallback.
use super::*;

pub(crate) async fn sku_products(a: &App, t: &str, chain: &[String]) -> Result<Vec<Product>> {
    let roots = localized_products(a, t, chain).await?;
    let rows =
        sqlx::query("SELECT * FROM products WHERE tenant=$1 AND parent_id IS NOT NULL ORDER BY id")
            .bind(t)
            .fetch_all(&a.db)
            .await?;
    let mut result = roots.clone();
    for r in rows {
        let mut p = product(&r);
        if let Some(parent) = roots.iter().find(|v| Some(&v.id) == p.parent_id.as_ref()) {
            p.name = parent.name.clone();
            p.description = parent.description.clone();
        }
        result.push(p);
    }
    Ok(result)
}
