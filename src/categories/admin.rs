//! Revision-bound category writes, bounded translations and serialized cycle-safe tree moves.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Edit {
    revision: Option<i64>,
    parent_id: Option<String>,
    position: i32,
    data: Value,
}
fn validate(v: &Edit) -> Result<()> {
    let d = &v.data;
    if !d.is_object()
        || d.to_string().len() > 16000
        || !d["active"].is_boolean()
        || !d["visible"].is_boolean()
        || !["page", "folder", "structuring", "link"].contains(&d["type"].as_str().unwrap_or(""))
    {
        return Err(bad("Invalid category data"));
    }
    if d.get("displayNestedProducts")
        .is_some_and(|v| !v.is_boolean())
    {
        return Err(bad("Invalid nested category listing flag"));
    }
    for lang in ["en", "de", "fr", "es"] {
        let tr = &d["translations"][lang];
        if tr["name"]
            .as_str()
            .is_none_or(|s| s.trim().is_empty() || s.len() > 200)
            || tr["description"].as_str().is_some_and(|s| s.len() > 4000)
            || tr["slug"]
                .as_str()
                .is_some_and(|s| s.len() > 200 || s.contains(['?', '#', '/']))
        {
            return Err(bad("Four bounded category translations required"));
        }
    }
    if d["type"] == "link"
        && !d["url"].as_str().is_some_and(|s| {
            reqwest::Url::parse(s).is_ok_and(|u| {
                u.scheme() == "https" && u.username().is_empty() && u.password().is_none()
            })
        })
    {
        return Err(bad("Category links require HTTPS"));
    }
    Ok(())
}
pub(crate) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    auth::permit(&h, "catalog.read")?;
    let t = merchant(&a, &h)?;
    let rows =
        sqlx::query("SELECT * FROM categories WHERE tenant=$1 ORDER BY position,id LIMIT 2001")
            .bind(t)
            .fetch_all(&a.db)
            .await?;
    if rows.len() > 2000 {
        return Err(bad("Category tree exceeds interactive limit"));
    }
    Ok(Json(
        json!({"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"parentId":r.get::<Option<String>,_>("parent_id"),"position":r.get::<i32,_>("position"),"revision":r.get::<i64,_>("revision"),"data":r.get::<Value,_>("data")})).collect::<Vec<_>>()}),
    ))
}
pub(crate) async fn create(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    write(a, h, Uuid::new_v4().to_string(), v, true).await
}
pub(crate) async fn save(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    write(a, h, id, v, false).await
}
async fn write(a: App, h: HeaderMap, id: String, v: Value, create: bool) -> Result<Json<Value>> {
    auth::permit(&h, "catalog")?;
    let t = merchant(&a, &h)?;
    let v: Edit = serde_json::from_value(v).map_err(|_| bad("Invalid category edit"))?;
    validate(&v)?;
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,726))")
        .bind(&t)
        .execute(&mut *tx)
        .await?;
    if let Some(parent) = &v.parent_id {
        let valid:bool=sqlx::query_scalar("WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM categories WHERE tenant=$1 AND id=$2 UNION ALL SELECT c.id,c.parent_id FROM categories c JOIN ancestors x ON c.id=x.parent_id WHERE c.tenant=$1) SELECT EXISTS(SELECT 1 FROM ancestors) AND NOT EXISTS(SELECT 1 FROM ancestors WHERE id=$3)").bind(&t).bind(parent).bind(&id).fetch_one(&mut *tx).await?;
        if !valid {
            return Err(bad("Category parent is unavailable or creates a cycle"));
        }
    }
    let revision = if create {
        sqlx::query(
            "INSERT INTO categories(tenant,id,parent_id,position,data) VALUES($1,$2,$3,$4,$5)",
        )
        .bind(&t)
        .bind(&id)
        .bind(&v.parent_id)
        .bind(v.position)
        .bind(&v.data)
        .execute(&mut *tx)
        .await?;
        1
    } else {
        let rev = v.revision.ok_or(bad("Category revision required"))?;
        let n=sqlx::query("UPDATE categories SET parent_id=$1,position=$2,data=$3,revision=revision+1 WHERE tenant=$4 AND id=$5 AND revision=$6").bind(&v.parent_id).bind(v.position).bind(&v.data).bind(&t).bind(&id).bind(rev).execute(&mut *tx).await?.rows_affected();
        if n != 1 {
            return Err(conflict("Category changed"));
        }
        rev + 1
    };
    tx.commit().await?;
    Ok(Json(json!({"id":id,"revision":revision,"saved":true})))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_all_locales_and_links() {
        let mut d = json!({"active":false,"visible":true,"type":"page","translations":{}});
        for l in ["en", "de", "fr", "es"] {
            d["translations"][l] = json!({"name":"Catalog"});
        }
        let mut e = Edit {
            revision: None,
            parent_id: None,
            position: 0,
            data: d,
        };
        assert!(validate(&e).is_ok());
        e.data["type"] = json!("link");
        e.data["url"] = json!("javascript:alert(1)");
        assert!(validate(&e).is_err());
    }
}
