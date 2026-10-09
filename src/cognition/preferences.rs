//! Consent-bound private cart preference graph: typed bounded input, export, erasure and native advisor context.
use crate::*;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Node {
    id: String,
    kind: String,
    value: String,
    product_id: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Edge {
    source: String,
    target: String,
    kind: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Graph {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
}
impl Graph {
    fn validate(&self) -> Result<()> {
        if self.nodes.len() > 32 || self.edges.len() > 64 {
            return Err(bad("Preference graph limit: 32 nodes and 64 edges"));
        }
        let mut ids = std::collections::HashSet::new();
        for n in &self.nodes {
            if n.id.is_empty()
                || n.id.len() > 64
                || !n
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                || !ids.insert(&n.id)
                || !["size", "style", "owned_product", "interest"].contains(&n.kind.as_str())
                || n.value.is_empty()
                || n.value.len() > 240
                || (n.kind == "owned_product" && n.product_id.is_none())
            {
                return Err(bad("Invalid private preference node"));
            }
        }
        if self.edges.iter().any(|e| {
            !ids.contains(&e.source)
                || !ids.contains(&e.target)
                || !["PREFERS", "FITS", "COMPLEMENTS"].contains(&e.kind.as_str())
        }) {
            return Err(bad("Invalid preference relation"));
        }
        Ok(())
    }
}
async fn read(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    legal::require(&a, &c, "personalization").await?;
    let r =
        sqlx::query("SELECT data,revision FROM private_preferences WHERE tenant=$1 AND cart_id=$2")
            .bind(&c.tenant)
            .bind(&c.id)
            .fetch_optional(&a.db)
            .await?;
    Ok(Json(r.map(|r|json!({"graph":r.get::<Value,_>("data")["graph"],"useForAdvice":r.get::<Value,_>("data")["useForAdvice"],"revision":r.get::<i64,_>("revision"),"scope":"private cart context"})).unwrap_or(json!({"graph":{"nodes":[],"edges":[]},"revision":0,"scope":"private cart context"}))))
}
async fn save(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    legal::require(&a, &c, "personalization").await?;
    let g: Graph =
        serde_json::from_value(v["graph"].clone()).map_err(|_| bad("Invalid preference graph"))?;
    g.validate()?;
    let revision = v["revision"]
        .as_i64()
        .filter(|r| *r >= 0)
        .ok_or(bad("Preference revision required"))?;
    for n in &g.nodes {
        if let Some(id) = &n.product_id {
            marketing::admit_product(&a, &h, id).await?;
        }
    }
    let mut tx = a.db.begin().await?;
    legal::require_locked(&mut tx, &c, "personalization").await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,18))")
        .bind(format!("{}:{}", c.tenant, hash(&c.id)))
        .execute(&mut *tx)
        .await?;
    for n in &g.nodes {
        if let Some(id) = &n.product_id {
            sqlx::query("SELECT id FROM products WHERE tenant=$1 AND id=$2 FOR KEY SHARE")
                .bind(&c.tenant)
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or(bad("Preference product disappeared"))?;
        }
    }
    let current: Option<i64> = sqlx::query_scalar(
        "SELECT revision FROM private_preferences WHERE tenant=$1 AND cart_id=$2 FOR UPDATE",
    )
    .bind(&c.tenant)
    .bind(&c.id)
    .fetch_optional(&mut *tx)
    .await?;
    if current.unwrap_or(0) != revision {
        return Err(conflict("Preference revision changed"));
    }
    sqlx::query("INSERT INTO private_preferences(tenant,cart_id,data) VALUES($1,$2,$3) ON CONFLICT(tenant,cart_id) DO UPDATE SET data=EXCLUDED.data,revision=private_preferences.revision+1,updated_at=now()").bind(&c.tenant).bind(&c.id).bind(json!({"graph":g,"useForAdvice":v["useForAdvice"]==true})).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"revision":revision+1,"saved":true})))
}
async fn delete(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let mut tx = a.db.begin().await?;
    forget(&mut tx, &c).await?;
    tx.commit().await?;
    Ok(Json(json!({"forgotten":true})))
}
pub(crate) async fn forget(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
) -> Result<()> {
    sqlx::query("DELETE FROM private_preferences WHERE tenant=$1 AND cart_id=$2")
        .bind(&c.tenant)
        .bind(&c.id)
        .execute(&mut **tx)
        .await?;
    // Erasure invalidates inference rather than silently introducing differential attrition into a randomized test.
    sqlx::query("WITH removed AS (DELETE FROM intelligence_assignments WHERE tenant=$1 AND cart_id=$2 RETURNING experiment_id) UPDATE intelligence_experiments e SET withdrawn=e.withdrawn+1 FROM removed r WHERE e.tenant=$1 AND e.id=r.experiment_id").bind(&c.tenant).bind(&c.id).execute(&mut **tx).await?;
    sqlx::query("UPDATE knowledge_relations r SET data=jsonb_set(jsonb_set(data,'{causalUpliftProven}','false'),'{interval95}','null') WHERE r.tenant=$1 AND r.kind='EXPERIMENT_RESULT' AND EXISTS(SELECT 1 FROM intelligence_experiments e WHERE e.tenant=r.tenant AND e.id=r.source_id AND e.withdrawn>0)").bind(&c.tenant).execute(&mut **tx).await?;
    Ok(())
}
/// A request-only source stamp; never persisted as a second memory ledger or exposed to the model.
pub(crate) struct AdviceContext {
    pub(crate) graph: Value,
    stamp: Option<String>,
}
pub(crate) async fn capture(a: &App, h: &RequestContext) -> Result<AdviceContext> {
    let empty = || AdviceContext {
        graph: Value::Null,
        stamp: None,
    };
    let Ok(c) = load_cart(a, h).await else {
        return Ok(empty());
    };
    if legal::require(a, &c, "personalization").await.is_err() {
        return Ok(empty());
    }
    let row = sqlx::query("SELECT data->'graph' AS graph,revision,updated_at::text AS changed FROM private_preferences WHERE tenant=$1 AND cart_id=$2 AND data->'useForAdvice'='true'::jsonb AND updated_at>now()-interval '30 days'").bind(&c.tenant).bind(&c.id).fetch_optional(&a.db).await?;
    Ok(row
        .map(|row| {
            let graph: Value = row.get("graph");
            let stamp = hash(
                &json!([
                    c.tenant,
                    c.id,
                    row.get::<i64, _>("revision"),
                    row.get::<String, _>("changed"),
                    graph
                ])
                .to_string(),
            );
            AdviceContext {
                graph,
                stamp: Some(stamp),
            }
        })
        .unwrap_or_else(empty))
}
pub(crate) async fn revalidate(a: &App, h: &RequestContext, prior: &AdviceContext) -> Result<()> {
    if capture(a, h).await?.stamp != prior.stamp {
        return Err(conflict(
            "Private advice context changed during inference; ask again",
        ));
    }
    Ok(())
}
pub(crate) fn router() -> Router<App> {
    Router::new().route(
        "/store-api/intelligence/preferences",
        get(read).put(save).delete(delete),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_graph_has_typed_bounded_non_dangling_relations() {
        let mut g = Graph {
            nodes: vec![Node {
                id: "size".into(),
                kind: "size".into(),
                value: "M".into(),
                product_id: None,
            }],
            edges: vec![],
        };
        assert!(g.validate().is_ok());
        g.edges.push(Edge {
            source: "size".into(),
            target: "foreign".into(),
            kind: "FITS".into(),
        });
        assert!(g.validate().is_err());
        g.edges.clear();
        g.nodes[0].kind = "payment_token".into();
        assert!(g.validate().is_err());
    }
}
