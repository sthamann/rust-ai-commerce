//! Durable sequence execution records each action before dispatch, persists delay cursors and reports uncertain effects.
use super::pipeline::Node;
use super::*;
pub(crate) async fn run(
    a: &App,
    t: &str,
    id: &str,
    f: &flows::Flow,
    definition: &Value,
    cursor: Option<String>,
) -> Result<Value> {
    let p = f.pipeline.as_ref().ok_or(bad("Pipeline required"))?;
    p.validate()?;
    let mut next = cursor.or_else(|| Some(p.entry.clone()));
    let previous: Value =
        sqlx::query_scalar("SELECT execution FROM flow_jobs WHERE id=$1 AND tenant=$2")
            .bind(id)
            .bind(t)
            .fetch_one(&a.db)
            .await?;
    let mut trace = previous["trace"].as_array().cloned().unwrap_or_default();
    while let Some(node_id) = next {
        let held = sqlx::query("UPDATE flow_jobs SET lease_until=now()+interval '5 minutes' WHERE id=$1 AND tenant=$2 AND state='running' AND lease_until>=now()").bind(id).bind(t).execute(&a.db).await?.rows_affected();
        if held != 1 {
            return Err(conflict("Flow worker lost its lease"));
        }
        super::flow_access::headers(a, t, f.actor.as_deref()).await?;
        let node = p
            .nodes
            .iter()
            .find(|n| n.id() == node_id)
            .ok_or(bad("Unknown flow cursor"))?;
        match node {
            Node::Condition {
                condition,
                on_true,
                on_false,
                ..
            } => {
                let data: Cart = serde_json::from_value(definition["cartData"].clone())
                    .map_err(|_| bad("Missing flow cart context"))?;
                let cart = StoredCart {
                    id: String::new(),
                    tenant: t.into(),
                    token: String::new(),
                    data,
                    revision: 0,
                    status: "event".into(),
                };
                let matched = condition.checked_matches(&cart, &definition["ruleContext"])?;
                next = if matched {
                    on_true.clone()
                } else {
                    on_false.clone()
                };
                trace.push(json!({"node":node_id,"matched":matched}));
            }
            Node::Stop { .. } => return Ok(json!({"stopped":true,"trace":trace})),
            Node::Delay {
                seconds,
                next: target,
                ..
            } => {
                sqlx::query("UPDATE flow_jobs SET state='queued',cursor=$1,available_at=now()+make_interval(secs=>$2),lease_until=NULL,execution=$3 WHERE id=$4 AND state='running'").bind(target).bind(*seconds as f64).bind(json!({"trace":trace,"delayCompleted":node_id,"finishAfterDelay":target.is_none()})).bind(id).execute(&a.db).await?;
                return Ok(json!({"scheduled":true,"node":node_id,"seconds":seconds}));
            }
            Node::Action {
                action,
                config,
                next: target,
                ..
            } => {
                if action == "action.stop.flow" {
                    return Ok(json!({"stopped":true,"trace":trace}));
                }
                let existing =
                    sqlx::query("SELECT state,result FROM flow_steps WHERE job=$1 AND node=$2")
                        .bind(id)
                        .bind(&node_id)
                        .fetch_optional(&a.db)
                        .await?;
                let result = if let Some(r) = existing {
                    if r.get::<String, _>("state") != "completed" {
                        return Err(bad("Flow step has an uncertain previous execution"));
                    }
                    r.get::<Value, _>("result")
                } else {
                    sqlx::query("INSERT INTO flow_steps(job,node) VALUES($1,$2)")
                        .bind(id)
                        .bind(&node_id)
                        .execute(&a.db)
                        .await?;
                    let result = super::flow_actions::execute(
                        a,
                        t,
                        f,
                        &format!("flow:{id}:{node_id}"),
                        action,
                        config,
                        definition,
                    )
                    .await;
                    match result {
                        Ok(v) => {
                            sqlx::query("UPDATE flow_steps SET state='completed',result=$1,finished_at=now() WHERE job=$2 AND node=$3").bind(&v).bind(id).bind(&node_id).execute(&a.db).await?;
                            v
                        }
                        Err(e) => {
                            sqlx::query("UPDATE flow_steps SET state='failed',error=$1,finished_at=now() WHERE job=$2 AND node=$3").bind(&e.1).bind(id).bind(&node_id).execute(&a.db).await?;
                            return Err(e);
                        }
                    }
                };
                trace.push(json!({"node":node_id,"action":action,"result":result}));
                next = target.clone();
            }
        }
        sqlx::query("UPDATE flow_jobs SET cursor=$1,execution=$2 WHERE id=$3 AND state='running'")
            .bind(&next)
            .bind(json!({"trace":trace}))
            .bind(id)
            .execute(&a.db)
            .await?;
    }
    Ok(json!({"completed":true,"trace":trace}))
}
