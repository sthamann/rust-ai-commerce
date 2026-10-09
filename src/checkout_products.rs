//! Localized immutable checkout SKU snapshots read under the purchase transaction's locks.
use crate::*;

pub(crate) async fn snapshot(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
    rows: Vec<sqlx::postgres::PgRow>,
    chain: &[String],
    locales: &[String],
) -> Result<Vec<Product>> {
    let ids = rows
        .iter()
        .map(|r| r.get::<String, _>("id"))
        .collect::<Vec<_>>();
    let translations = sqlx::query("SELECT product_id,language_id,name,description FROM product_translations WHERE tenant=$1 AND product_id=ANY($2) AND language_id=ANY($3) FOR SHARE")
        .bind(&c.tenant).bind(&ids).bind(chain).fetch_all(&mut **tx).await?;
    let locked = rows.iter().map(product).collect::<Vec<_>>();
    let roots = localization::hydrate_products(
        locked
            .iter()
            .filter(|p| p.parent_id.is_none())
            .cloned()
            .collect(),
        &translations,
        &chain,
        &locales,
    );
    let selected = locked
        .into_iter()
        .filter(|p| c.data.items.iter().any(|i| i.id == p.id))
        .map(|mut p| {
            if let Some(parent) = roots.iter().find(|r| Some(&r.id) == p.parent_id.as_ref()) {
                p.name = parent.name.clone();
                p.description = parent.description.clone();
                p.extra = commerce::inherited_extra(&parent.extra, &p.extra);
            }
            p
        })
        .collect();
    Ok(localization::hydrate_products(
        selected,
        &translations,
        &chain,
        &locales,
    ))
}

/// Prepare language metadata before the checkout holds a pool connection.
pub(crate) async fn language(a: &App, c: &StoredCart) -> Result<(Vec<String>, Vec<String>)> {
    let mut h = RequestContext::new();
    h.insert(
        "x-tenant",
        c.tenant.parse().map_err(|_| bad("Invalid tenant"))?,
    );
    if !c.data.locale.is_empty() {
        h.insert(
            "x-commerce-locale",
            c.data
                .locale
                .parse()
                .map_err(|_| bad("Invalid stored locale"))?,
        );
    }
    let (_, chain) = language_context(a, &h).await?;
    let languages = performance::languages(a).await?;
    let locales = chain
        .iter()
        .filter_map(|id| {
            languages
                .iter()
                .find(|l| l.id == *id)
                .map(|l| l.locale.clone())
        })
        .collect();
    Ok((chain, locales))
}
