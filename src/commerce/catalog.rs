//! SKU loading with parent translation fallback.
use super::*;

pub(crate) async fn cart_products(
    a: &App,
    t: &str,
    chain: &[String],
    items: &[Item],
) -> Result<Vec<Product>> {
    if items.is_empty() {
        return Ok(vec![]);
    }
    let ids = items.iter().map(|i| i.id.clone()).collect::<Vec<_>>();
    // Load only the actual SKUs and their parents. A 20-line cart must not
    // hydrate every product and translation in a 1,000-product shop.
    let rows = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND (id=ANY($2) OR id IN (SELECT parent_id FROM products WHERE tenant=$1 AND id=ANY($2))) ORDER BY id")
        .bind(t).bind(&ids).fetch_all(&a.db).await?;
    let mut selected = rows.iter().map(product).collect::<Vec<_>>();
    let roots = localize_products(
        a,
        t,
        chain,
        selected
            .iter()
            .filter(|p| p.parent_id.is_none())
            .cloned()
            .collect(),
    )
    .await?;
    let parents: HashMap<_, _> = roots.iter().map(|p| (p.id.as_str(), p)).collect();
    for p in &mut selected {
        let parent_id = p.parent_id.as_deref().unwrap_or(&p.id);
        if let Some(parent) = parents.get(parent_id) {
            p.name = parent.name.clone();
            p.description = parent.description.clone();
        }
    }
    Ok(selected)
}

pub(crate) async fn sku_products(a: &App, t: &str, chain: &[String]) -> Result<Vec<Product>> {
    let roots = localized_products(a, t, chain).await?;
    let rows =
        sqlx::query("SELECT * FROM products WHERE tenant=$1 AND parent_id IS NOT NULL ORDER BY id")
            .bind(t)
            .fetch_all(&a.db)
            .await?;
    let mut result = roots.clone();
    let parents: HashMap<_, _> = roots.iter().map(|p| (p.id.as_str(), p)).collect();
    for r in rows {
        let mut p = product(&r);
        if let Some(parent) = p.parent_id.as_deref().and_then(|id| parents.get(id)) {
            p.name = parent.name.clone();
            p.description = parent.description.clone();
        }
        result.push(p);
    }
    Ok(result)
}
