//! Revision-bound workflow configuration used by installed apps and selective sandbox releases.
use super::*;
pub(super) async fn get(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "orders.read")?;
    let (m, r) = commerce::machine(&a.db, &t).await?;
    Ok(Json(json!({"data":m,"revision":r})))
}
pub(super) async fn save(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "settings.write")?;
    let m: commerce::OrderMachine =
        serde_json::from_value(v["data"].clone()).map_err(|_| bad("Invalid workflow schema"))?;
    m.validate()?;
    let revision = v["revision"].as_i64().ok_or(bad("revision required"))?;
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,27))")
        .bind(&t)
        .execute(&mut *tx)
        .await?;
    if let Some(app) = &m.source_app {
        auth::permit(&h, "apps.manage")?;
        let active: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM app_packages WHERE tenant=$1 AND id=$2 AND active)",
        )
        .bind(&t)
        .bind(app)
        .fetch_one(&mut *tx)
        .await?;
        if !active {
            return Err(bad("Workflow source app is not installed"));
        }
    }
    let old: Option<i64> =
        sqlx::query_scalar("SELECT revision FROM order_state_machines WHERE tenant=$1 FOR UPDATE")
            .bind(&t)
            .fetch_optional(&mut *tx)
            .await?;
    if old.unwrap_or(0) != revision {
        return Err(conflict("Workflow revision changed"));
    }
    // Keep every persisted state represented so changing a definition cannot strand existing orders.
    let states = m.states.iter().map(|s| s.id.clone()).collect::<Vec<_>>();
    let stranded:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM orders WHERE tenant=$1 AND NOT (data->>'state'=ANY($2)) AND data->>'state' NOT IN ('expired','payment_review'))").bind(&t).bind(&states).fetch_one(&mut *tx).await?;
    if stranded {
        return Err(conflict("Workflow removes an active order state"));
    }
    sqlx::query("INSERT INTO order_state_machines(tenant,data) VALUES($1,$2) ON CONFLICT(tenant) DO UPDATE SET data=EXCLUDED.data,revision=order_state_machines.revision+1").bind(&t).bind(json!(m)).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'order.workflow.updated',$2)")
        .bind(&t)
        .bind(
            json!({"revision":revision+1,"actor":header(&h,"x-rac-user"),"sourceApp":m.source_app}),
        )
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"saved":true,"revision":revision+1})))
}
