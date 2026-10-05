//! Category release units and dependency-ordered tree publication; stock is never part of a catalog release.
use super::*;
pub(super) async fn snapshot(
    tx: &mut Tx<'_>,
    t: &str,
    result: &mut serde_json::Map<String, Value>,
) -> Result<()> {
    for r in sqlx::query("SELECT to_jsonb(c)-'tenant'-'revision' AS data FROM categories c WHERE tenant=$1 ORDER BY id FOR UPDATE").bind(t).fetch_all(&mut **tx).await? {
        let v:Value=r.get("data");result.insert(format!("category:{}",v["id"].as_str().unwrap()),v);
    }
    Ok(())
}
pub(super) async fn publish(
    tx: &mut Tx<'_>,
    t: &str,
    current: &Value,
    keys: &[String],
) -> Result<()> {
    let mut remaining = keys
        .iter()
        .filter(|k| k.starts_with("category:"))
        .cloned()
        .collect::<Vec<_>>();
    while !remaining.is_empty() {
        let mut progressed = false;
        for key in remaining.clone() {
            let v = &current[&key];
            let parent = v["parent_id"].as_str();
            if let Some(parent) = parent {
                if remaining.contains(&format!("category:{parent}")) {
                    continue;
                }
                let exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM categories WHERE tenant=$1 AND id=$2)",
                )
                .bind(t)
                .bind(parent)
                .fetch_one(&mut **tx)
                .await?;
                if !exists {
                    return Err(bad("Publish the parent category with this release"));
                }
                let cycle:bool=sqlx::query_scalar("WITH RECURSIVE parents AS (SELECT id,parent_id FROM categories WHERE tenant=$1 AND id=$2 UNION ALL SELECT c.id,c.parent_id FROM categories c JOIN parents p ON c.id=p.parent_id WHERE c.tenant=$1) SELECT EXISTS(SELECT 1 FROM parents WHERE id=$3)").bind(t).bind(parent).bind(v["id"].as_str()).fetch_one(&mut **tx).await?;
                if cycle {
                    return Err(bad("Category release creates a cycle"));
                }
            }
            sqlx::query("INSERT INTO categories(tenant,id,parent_id,position,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,id) DO UPDATE SET parent_id=EXCLUDED.parent_id,position=EXCLUDED.position,data=EXCLUDED.data,revision=categories.revision+1").bind(t).bind(v["id"].as_str()).bind(parent).bind(v["position"].as_i64().unwrap_or(0) as i32).bind(&v["data"]).execute(&mut **tx).await?;
            remaining.retain(|k| k != &key);
            progressed = true;
        }
        if !progressed {
            return Err(bad("Cyclic category release"));
        }
    }
    Ok(())
}
