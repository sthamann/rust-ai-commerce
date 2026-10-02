//! Bounded localized catalog retrieval before inference; full catalog size never expands the prompt.
use super::*;
pub(crate) async fn context_products(
    a: &App,
    t: &str,
    chain: &[String],
    query: &str,
) -> Result<Vec<Product>> {
    let rows=sqlx::query("SELECT p.* FROM products p WHERE p.tenant=$1 AND p.parent_id IS NULL ORDER BY (position(lower(p.id) in lower($2))>0) DESC,ts_rank_cd(to_tsvector('simple',p.name||' '||p.description),plainto_tsquery('simple',$2)) DESC,p.id LIMIT 24").bind(t).bind(query).fetch_all(&a.db).await?;
    let mut ps = rows.iter().map(product).collect::<Vec<_>>();
    let ids = ps.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
    let rows=sqlx::query("SELECT product_id,language_id,name,description FROM product_translations WHERE tenant=$1 AND product_id=ANY($2) AND language_id=ANY($3)").bind(t).bind(ids).bind(chain).fetch_all(&a.db).await?;
    for p in &mut ps {
        for field in ["name", "description"] {
            for language in chain {
                if let Some(row) = rows.iter().find(|r| {
                    r.get::<String, _>("product_id") == p.id
                        && r.get::<String, _>("language_id") == *language
                }) && let Some(value) = row.get::<Option<String>, _>(field)
                {
                    if field == "name" {
                        p.name = value.chars().take(160).collect();
                    } else {
                        p.description = value.chars().take(1000).collect();
                    }
                    break;
                }
            }
        }
    }
    // Base-language fields are bounded as well.
    for p in &mut ps {
        p.name = p.name.chars().take(160).collect();
        p.description = p.description.chars().take(1000).collect();
    }
    Ok(ps)
}
