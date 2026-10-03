//! Resolve only referenced tenant rule IDs with indexed batched reads; freeze active definitions and revisions into the event snapshot.
use super::*;
pub(crate) async fn attach(
    conn: &mut sqlx::PgConnection,
    t: &str,
    definitions: &Value,
    facts: &mut Value,
) -> Result<()> {
    fn refs(v: &Value, ids: &mut std::collections::HashSet<String>) {
        match v {
            Value::Object(o) => {
                if o.get("type").and_then(Value::as_str) == Some("ruleReference")
                    && let Some(id) = o.get("ruleId").and_then(Value::as_str)
                {
                    ids.insert(id.into());
                }
                for child in o.values() {
                    refs(child, ids)
                }
            }
            Value::Array(a) => {
                for child in a {
                    refs(child, ids)
                }
            }
            _ => {}
        }
    }
    let mut pending = std::collections::HashSet::new();
    refs(definitions, &mut pending);
    let mut seen = std::collections::HashSet::new();
    let mut snapshot = json!({});
    for _ in 0..=8 {
        let ids = pending
            .drain()
            .filter(|id| !seen.contains(id))
            .collect::<Vec<_>>();
        if ids.is_empty() {
            break;
        }
        if seen.len() + ids.len() > 100 {
            return Err(bad("Maximum 100 referenced rules"));
        }
        let rows=sqlx::query("SELECT id,condition,active,revision FROM commerce_rules WHERE tenant=$1 AND id=ANY($2)").bind(t).bind(&ids).fetch_all(&mut *conn).await?;
        seen.extend(ids);
        for row in rows {
            let id: String = row.get("id");
            let condition: Value = row.get("condition");
            refs(&condition, &mut pending);
            snapshot[&id] = json!({"condition":condition,"active":row.get::<bool,_>("active"),"revision":row.get::<i64,_>("revision")});
        }
    }
    facts["rules"] = snapshot;
    Ok(())
}
