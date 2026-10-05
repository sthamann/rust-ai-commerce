//! Durable outbox and audit projection worker.
use crate::*;

pub(crate) async fn runtime(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let r=sqlx::query("SELECT (SELECT count(*) FROM outbox WHERE tenant=$1 AND delivered_at IS NULL) AS pending,(SELECT count(*) FROM projections WHERE tenant=$1) AS consumed").bind(t).fetch_one(&a.db).await?;
    Ok(Json(
        json!({"outboxPending":r.get::<i64,_>("pending"),"eventsConsumed":r.get::<i64,_>("consumed"),"consumer":"durable audit projection; no external messages sent",
            // Instance-wide diagnostic counters are visible only to the existing instance credential.
            "performance":if header(&h,"x-rac-user")==Some("bootstrap") {Some(json!({"reads":a.reads.snapshot(),"pool":{"size":a.db.size(),"idle":a.db.num_idle()}}))}else{None}}),
    ))
}
pub(crate) async fn consume_once(a: &App) -> Result<()> {
    let mut tx = a.db.begin().await?;
    let rows=sqlx::query("SELECT * FROM outbox WHERE delivered_at IS NULL ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED").fetch_all(&mut *tx).await?;
    for r in rows {
        let id = r.get::<i64, _>("id");
        let t = r.get::<String, _>("tenant");
        let kind = r.get::<String, _>("kind");
        cognition::project(&mut tx, &t, id, &kind, &r.get::<Value, _>("data")).await?;
        apps::project_events(&mut tx, &t, id, &kind).await?;
        marketing::project_flows(&mut tx, &t, id, &kind, &r.get::<Value, _>("data")).await?;
        sqlx::query("INSERT INTO projections(event_id,tenant,kind,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(id).bind(r.get::<String,_>("tenant")).bind(r.get::<String,_>("kind")).bind(r.get::<Value,_>("data")).execute(&mut *tx).await?;
        sqlx::query("UPDATE outbox SET delivered_at=now() WHERE id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
