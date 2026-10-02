//! Bounded tenant-scoped catalog reads. A cursor is a product ID, never an offset.
use crate::*;

#[derive(Default, Deserialize)]
pub(crate) struct CatalogCriteria {
    pub(crate) limit: Option<u32>,
    pub(crate) after: Option<String>,
    pub(crate) category: Option<String>,
    #[serde(alias = "query")]
    pub(crate) search: Option<String>,
    #[serde(skip)]
    pub(crate) product_ids: Option<Vec<String>>,
}

impl CatalogCriteria {
    pub(crate) fn page_size(&self) -> Result<usize> {
        let limit = self.limit.unwrap_or(50);
        if !(1..=100).contains(&limit) {
            return Err(bad("limit must be between 1 and 100"));
        }
        if self.after.as_ref().is_some_and(|s| s.len() > 200)
            || self.category.as_ref().is_some_and(|s| s.len() > 100)
            || self.search.as_ref().is_some_and(|s| s.len() > 200)
        {
            return Err(bad("Catalog filter is too long"));
        }
        Ok(limit as usize)
    }
}

pub(crate) struct CatalogPage {
    pub(crate) products: Vec<Product>,
    pub(crate) next_cursor: Option<String>,
    pub(crate) limit: usize,
}

pub(crate) async fn product_page(
    a: &App,
    t: &str,
    chain: &[String],
    criteria: &CatalogCriteria,
) -> Result<CatalogPage> {
    let limit = criteria.page_size()?;
    let category = criteria.category.as_deref().filter(|s| !s.is_empty());
    let after = criteria.after.as_deref().unwrap_or("");
    let search = criteria
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let rows = if let Some(ids) = &criteria.product_ids {
        // Explicit channel catalogs contain at most 500 IDs. Filter before pagination;
        // the unscoped million-product path keeps its specialized indexed queries.
        let pattern = search.map(|s| {
            format!(
                "%{}%",
                s.to_lowercase()
                    .replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_")
            )
        });
        sqlx::query(include_str!("catalog_channel.sql"))
            .bind(t)
            .bind(ids)
            .bind(after)
            .bind(category)
            .bind(chain)
            .bind(pattern)
            .bind((limit + 1) as i64)
            .fetch_all(&a.db)
            .await?
    } else if let Some(search) = search {
        // Trigram candidates are indexed independently; check the effective
        // fallback-chain text before returning a match in the requested locale.
        let literal_pattern = |s: &str| {
            format!(
                "%{}%",
                s.to_lowercase()
                    .replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_")
            )
        };
        // A phrase can span a translated name and a fallback description.
        // Use one word for indexed candidates, then check the full effective
        // phrase. Very short searches retain exact semantics without a trigram.
        let candidate = search
            .split_whitespace()
            .max_by_key(|s| s.len())
            .filter(|s| s.chars().count() >= 3)
            .unwrap_or("");
        sqlx::query(include_str!("catalog_search.sql"))
            // Common and rare terms need different plans. A cached generic
            // plan regressed to a catalog scan after repeated mixed searches.
            .persistent(false)
            .bind(t)
            .bind(after)
            .bind(category)
            .bind(literal_pattern(search))
            .bind(chain)
            .bind((limit + 1) as i64)
            .bind(literal_pattern(candidate))
            .fetch_all(&a.db)
            .await?
    } else if let Some(category) = category {
        sqlx::query("SELECT * FROM products WHERE tenant=$1 AND parent_id IS NULL AND id>$2 AND category=$3 ORDER BY id LIMIT $4")
            .bind(t).bind(after).bind(category).bind((limit+1) as i64).fetch_all(&a.db).await?
    } else {
        sqlx::query("SELECT * FROM products WHERE tenant=$1 AND parent_id IS NULL AND id>$2 ORDER BY id LIMIT $3")
            .bind(t).bind(after).bind((limit+1) as i64).fetch_all(&a.db).await?
    };
    let has_more = rows.len() > limit;
    let products =
        localize_products(a, t, chain, rows.iter().take(limit).map(product).collect()).await?;
    let next_cursor = has_more.then(|| products.last().unwrap().id.clone());
    Ok(CatalogPage {
        products,
        next_cursor,
        limit,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unbounded_and_invalid_pages() {
        assert_eq!(CatalogCriteria::default().page_size().unwrap(), 50);
        for limit in [0, 101, u32::MAX] {
            assert!(
                CatalogCriteria {
                    limit: Some(limit),
                    ..Default::default()
                }
                .page_size()
                .is_err()
            );
        }
        assert!(
            CatalogCriteria {
                after: Some("x".repeat(201)),
                ..Default::default()
            }
            .page_size()
            .is_err()
        );
    }
}
