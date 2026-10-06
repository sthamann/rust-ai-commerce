//! Revision-bound deletion and reference admission share HTTP/MCP authorization and tenant locks.
use super::*;
pub(crate) async fn lock(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, t: &str) -> Result<()> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,17))")
        .bind(format!("{t}:automation"))
        .execute(&mut **tx)
        .await?;
    Ok(())
}
async fn revision(
    conn: &mut sqlx::PgConnection,
    t: &str,
    kind: &str,
    id: &str,
    locked: bool,
) -> Result<i64> {
    let table = routes::table(kind)?;
    let sql = format!(
        "SELECT revision FROM {table} WHERE tenant=$1 AND id=$2 {}",
        if locked { "FOR UPDATE" } else { "" }
    );
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(t)
        .bind(id)
        .fetch_optional(conn)
        .await?
        .ok_or(Error(
            StatusCode::NOT_FOUND,
            "Configuration not found".into(),
        ))
}
pub(super) async fn dependencies(
    State(a): State<App>,
    h: HeaderMap,
    Path((kind, id)): Path<(String, String)>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.read")?;
    let t = merchant(&a, &h)?;
    let mut conn = a.db.acquire().await?;
    let rev = revision(&mut conn, &t, &kind, &id, false).await?;
    let mut v = super::dependencies::inspect(&mut conn, &t, &kind, &id).await?;
    v["revision"] = json!(rev);
    Ok(Json(v))
}
pub(super) async fn delete(
    State(a): State<App>,
    h: HeaderMap,
    Path((kind, id)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.write")?;
    let t = merchant(&a, &h)?;
    let expected = v["revision"].as_i64().ok_or(bad("Revision required"))?;
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    lock(&mut tx, &t).await?;
    let rev = revision(&mut tx, &t, &kind, &id, true).await?;
    if rev != expected {
        return Err(conflict("Configuration revision changed"));
    }
    let deps = super::dependencies::inspect(&mut tx, &t, &kind, &id).await?;
    if deps["blocked"] == true {
        return Err(conflict(
            "Configuration is in use; remove references or deactivate it first",
        ));
    }
    let table = routes::table(&kind)?;
    let sql = format!("DELETE FROM {table} WHERE tenant=$1 AND id=$2 AND revision=$3");
    sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(&t)
        .bind(&id)
        .bind(rev)
        .execute(&mut *tx)
        .await
        .map_err(|e| match &e {
            sqlx::Error::Database(db) if db.code().as_deref() == Some("23503") => {
                conflict("Configuration gained a dependency; reload and deactivate it instead")
            }
            _ => e.into(),
        })?;
    tx.commit().await?;
    Ok(Json(json!({"deleted":true,"id":id,"revision":rev})))
}
pub(crate) async fn validate_references(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    kind: &str,
    id: &str,
    data: &Value,
) -> Result<()> {
    fn collect(v: &Value, ids: &mut std::collections::HashSet<String>) {
        match v {
            Value::Object(o) => {
                if o.get("type").and_then(Value::as_str) == Some("ruleReference")
                    && let Some(id) = o.get("ruleId").and_then(Value::as_str)
                {
                    ids.insert(id.into());
                }
                for v in o.values() {
                    collect(v, ids);
                }
            }
            Value::Array(a) => {
                for v in a {
                    collect(v, ids);
                }
            }
            _ => (),
        }
    }
    let mut pending = std::collections::HashSet::new();
    collect(data, &mut pending);
    let mut seen = std::collections::HashSet::new();
    for _ in 0..=8 {
        let ids = pending
            .drain()
            .filter(|id| !seen.contains(id))
            .collect::<Vec<_>>();
        if ids.is_empty() {
            return Ok(());
        }
        if seen.len() + ids.len() > 100 || (kind == "rules" && ids.iter().any(|i| i == id)) {
            return Err(bad("Cyclic or excessive rule references"));
        }
        let rows =
            sqlx::query("SELECT id,condition FROM commerce_rules WHERE tenant=$1 AND id=ANY($2)")
                .bind(t)
                .bind(&ids)
                .fetch_all(&mut **tx)
                .await?;
        if rows.len() != ids.len() {
            return Err(bad("Referenced rule not found in this shop"));
        }
        seen.extend(ids);
        for row in rows {
            collect(&row.get::<Value, _>("condition"), &mut pending);
        }
    }
    Err(bad("Rule reference depth exceeded"))
}
