//! Durable outbox and audit projection worker.
use crate::*;
mod control;
mod retention;
pub(crate) use control::retry as retry_outbox;

pub(crate) async fn runtime(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let r=sqlx::query("SELECT (SELECT count(*) FROM outbox WHERE tenant=$1 AND delivered_at IS NULL AND dead_letter_at IS NULL) AS pending,(SELECT count(*) FROM outbox WHERE tenant=$1 AND dead_letter_at IS NOT NULL) AS quarantined,(SELECT count(*) FROM outbox WHERE tenant=$1 AND delivered_at IS NULL AND attempts>0 AND dead_letter_at IS NULL) AS retrying,(SELECT count(*) FROM projections WHERE tenant=$1) AS consumed").bind(t).fetch_one(&a.db).await?;
    Ok(Json(
        json!({"outboxPending":r.get::<i64,_>("pending"),"outboxQuarantined":r.get::<i64,_>("quarantined"),"outboxRetrying":r.get::<i64,_>("retrying"),"eventsConsumed":r.get::<i64,_>("consumed"),"consumer":"durable audit projection; no external messages sent",
            // Instance-wide diagnostic counters are visible only to the existing instance credential.
            "performance":if header(&h,"x-rac-user")==Some("bootstrap") {Some(json!({"reads":a.reads.snapshot(),"admission":a.admission.snapshot(),"pool":{"size":a.db.size(),"idle":a.db.num_idle()}}))}else{None}}),
    ))
}
pub(crate) async fn consume_once(a: &App) -> Result<bool> {
    let mut tx = a.db.begin().await?;
    let rows=sqlx::query("SELECT * FROM outbox WHERE delivered_at IS NULL AND dead_letter_at IS NULL AND available_at<=now() AND EXISTS(SELECT 1 FROM tenants t WHERE t.id=coalesce((SELECT live_tenant FROM shop_environments WHERE tenant=outbox.tenant),outbox.tenant) AND t.status='active') ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED").fetch_all(&mut *tx).await?;
    let worked = !rows.is_empty();
    for r in rows {
        let id = r.get::<i64, _>("id");
        let t = r.get::<String, _>("tenant");
        let kind = r.get::<String, _>("kind");
        sqlx::query("SAVEPOINT project_event")
            .execute(&mut *tx)
            .await?;
        let result:Result<()> = async {
            cognition::project(&mut tx,&t,id,&kind,&r.get::<Value,_>("data")).await?;
            apps::project_events(&mut tx,&t,id,&kind).await?;
            marketing::project_flows(&mut tx,&t,id,&kind,&r.get::<Value,_>("data")).await?;
            sqlx::query("INSERT INTO projections(event_id,tenant,kind,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(id).bind(&t).bind(&kind).bind(r.get::<Value,_>("data")).execute(&mut *tx).await?;
            sqlx::query("UPDATE outbox SET delivered_at=now(),error_code=NULL WHERE id=$1 AND tenant=$2").bind(id).bind(&t).execute(&mut *tx).await?;
            Ok(())
        }.await;
        if let Err(error) = result {
            sqlx::query("ROLLBACK TO SAVEPOINT project_event")
                .execute(&mut *tx)
                .await?;
            sqlx::query("UPDATE outbox SET attempts=attempts+1,available_at=now()+least(300,power(2,least(attempts+1,8))::int)*interval '1 second',dead_letter_at=CASE WHEN attempts+1>=8 THEN now() ELSE NULL END,error_code='projection_failed' WHERE id=$1 AND tenant=$2").bind(id).bind(&t).execute(&mut *tx).await?;
            // No event payload or provider credential in logs; correlate tenant/event/status.
            eprintln!(
                "outbox_projection_failed tenant={t} event_id={id} kind={kind} status={}",
                error.0.as_u16()
            );
        }
        sqlx::query("RELEASE SAVEPOINT project_event")
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    retention::once(a).await?;
    Ok(worked)
}
