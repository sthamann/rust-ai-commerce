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

pub(crate) async fn family_products(
    a: &App,
    t: &str,
    chain: &[String],
    id: &str,
    criteria: &CatalogCriteria,
) -> Result<(Vec<Product>, String, Option<String>)> {
    let limit = criteria.page_size()?;
    let selected = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
        .bind(t)
        .bind(id)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Product not found".into()))?;
    let selected = product(&selected);
    let family = selected
        .parent_id
        .as_deref()
        .unwrap_or(&selected.id)
        .to_owned();
    let roots = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=$2")
        .bind(t)
        .bind(&family)
        .fetch_all(&a.db)
        .await?;
    let roots = localize_products(a, t, chain, roots.iter().map(product).collect()).await?;
    let rows = sqlx::query(
        "SELECT * FROM products WHERE tenant=$1 AND parent_id=$2 AND id>$3 ORDER BY id LIMIT $4",
    )
    .bind(t)
    .bind(&family)
    .bind(criteria.after.as_deref().unwrap_or(""))
    .bind((limit + 1) as i64)
    .fetch_all(&a.db)
    .await?;
    let next_cursor = (rows.len() > limit).then(|| rows[limit - 1].get::<String, _>("id"));
    let mut result = roots;
    for row in rows.iter().take(limit) {
        result.push(product(row));
    }
    // A deep-linked SKU remains visible even when it is outside the requested page.
    if !result.iter().any(|p| p.id == id) {
        result.push(selected);
    }
    let parent = result
        .iter()
        .find(|p| p.id == family)
        .map(|p| (p.name.clone(), p.description.clone()));
    if let Some((name, description)) = parent {
        for p in &mut result {
            if p.parent_id.as_deref() == Some(&family) {
                p.name = name.clone();
                p.description = description.clone();
            }
        }
    }
    Ok((result, family, next_cursor))
}
