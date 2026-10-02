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
            p.extra = inherited_extra(&parent.extra, &p.extra);
        }
    }
    localize_products(a, t, chain, selected).await
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
            p.extra = inherited_extra(&parent.extra, &p.extra);
        }
        result.push(p);
    }
    localize_products(a, t, chain, result).await
}

/// Absent SKU metadata inherits from the family; explicit values (including false) override.
fn inherited_extra(parent: &Value, child: &Value) -> Value {
    let mut merged = parent.as_object().cloned().unwrap_or_default();
    if let Some(fields) = child.as_object() {
        merged.extend(fields.clone());
    }
    Value::Object(merged)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sku_metadata_inherits_without_overwriting_explicit_values() {
        let parent = json!({"shippingFree":true,"specifications":{"fr":{"Matière":"Grès"}},"crossSelling":["notebook"]});
        assert_eq!(inherited_extra(&parent, &json!({})), parent);
        let child = inherited_extra(&parent, &json!({"shippingFree":false}));
        assert_eq!(child["shippingFree"], false);
        assert_eq!(child["specifications"], parent["specifications"]);
    }
}
