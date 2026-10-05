//! Public navigation is localized and restricted to the selected channel's active category ancestry.
use super::*;
async fn rows(a: &App, h: &HeaderMap) -> Result<Vec<sqlx::postgres::PgRow>> {
    let t = tenant(h)?;
    let (locale, _) = language_context(a, h).await?;
    let channel = marketing::channel(a, &t, marketing::channel_id(h), &locale).await?;
    let root = channel
        .and_then(|c| c.navigation_category_id)
        .unwrap_or_else(|| "catalog-root".into());
    let result = sqlx::query("WITH RECURSIVE tree AS (SELECT * FROM categories WHERE tenant=$1 AND id=$2 AND data->>'active'='true' UNION ALL SELECT c.* FROM categories c JOIN tree p ON c.parent_id=p.id WHERE c.tenant=$1 AND c.data->>'active'='true') SELECT * FROM tree ORDER BY position,id LIMIT 2001").bind(&t).bind(root).fetch_all(&a.db).await?;
    if result.len() > 2000 {
        return Err(bad("Category navigation exceeds limit"));
    }
    Ok(result)
}
pub(crate) async fn admit(a: &App, h: &HeaderMap, id: &str) -> Result<()> {
    if !rows(a, h)
        .await?
        .iter()
        .any(|r| r.get::<String, _>("id") == id)
    {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Category unavailable in this sales channel".into(),
        ));
    }
    Ok(())
}
pub(super) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (locale, _) = language_context(&a, &h).await?;
    let lang = &locale[..2];
    let rows = rows(&a, &h).await?;
    if rows.len() > 2000 {
        return Err(bad("Category navigation exceeds limit"));
    }
    // A hidden ancestor hides its entire navigation branch; direct active listings remain available.
    let parents: HashMap<String, (Option<String>, bool)> = rows
        .iter()
        .map(|r| {
            (
                r.get("id"),
                (
                    r.get("parent_id"),
                    r.get::<Value, _>("data")["visible"] != false,
                ),
            )
        })
        .collect();
    let visible = |id: &str| {
        let mut next = Some(id.to_owned());
        while let Some(current) = next {
            match parents.get(&current) {
                Some((parent, true)) => next = parent.clone(),
                Some((_, false)) => return false,
                None => break,
            }
        }
        true
    };
    let entries = rows.iter().filter(|r|visible(&r.get::<String,_>("id"))).map(|r| {
        let d: Value = r.get("data");
        let tr = d["translations"].get(lang).unwrap_or(&d["translations"]["en"]);
        json!({"id":r.get::<String,_>("id"),"parentId":r.get::<Option<String>,_>("parent_id"),"name":tr["name"],"description":tr["description"],"slug":tr["slug"],"type":d["type"],"url":d["url"],"position":r.get::<i32,_>("position")})
    }).collect::<Vec<_>>();
    Ok(Json(json!({"elements":entries,"locale":locale})))
}
