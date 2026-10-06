//! Operator-only per-shop daily interactive AI limits, optimistic revisions and durable audit.
use super::*;
pub(super) async fn get(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    auth::actor(&h)?;
    validate_tenant(&id)?;
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1)")
        .bind(&id)
        .fetch_one(&a.db)
        .await?;
    if !exists {
        return Err(Error(StatusCode::NOT_FOUND, "Shop not found".into()));
    }
    let r = sqlx::query("SELECT daily_ai,revision FROM tenant_resource_limits WHERE tenant=$1")
        .bind(&id)
        .fetch_optional(&a.db)
        .await?;
    let usage: Option<i64> = sqlx::query_scalar("SELECT attempts FROM tenant_ai_usage WHERE tenant=$1 AND day=(now() AT TIME ZONE 'UTC')::date").bind(&id).fetch_optional(&a.db).await?;
    Ok(Json(
        json!({"tenant":id,"dailyAi":r.as_ref().map(|r|r.get::<i64,_>("daily_ai")),"revision":r.map(|r|r.get::<i64,_>("revision")).unwrap_or(1),"usedToday":usage.unwrap_or(0),"scope":"database / UTC day; interactive HTTP AI attempts","defaults":a.admission.snapshot()}),
    ))
}
pub(super) async fn save(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let actor = auth::actor(&h)?;
    validate_tenant(&id)?;
    let daily = v["dailyAi"]
        .as_u64()
        .filter(|n| verified_kernel::resource_quota_admissible(*n))
        .ok_or(bad("dailyAi must be 1..1000000"))? as i64;
    let revision = v["revision"].as_u64().ok_or(bad("Revision required"))?;
    let mut tx = a.db.begin().await?;
    // Tenant row serializes first insert and every update without a missing-row race.
    sqlx::query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE")
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Shop not found".into()))?;
    let current: Option<i64> =
        sqlx::query_scalar("SELECT revision FROM tenant_resource_limits WHERE tenant=$1")
            .bind(&id)
            .fetch_optional(&mut *tx)
            .await?;
    if !verified_kernel::revision_admissible(current.unwrap_or(1) as u64, revision) {
        return Err(conflict("Quota revision changed"));
    }
    sqlx::query("INSERT INTO tenant_resource_limits(tenant,daily_ai,revision) VALUES($1,$2,$3) ON CONFLICT(tenant) DO UPDATE SET daily_ai=excluded.daily_ai,revision=tenant_resource_limits.revision+1").bind(&id).bind(daily).bind(revision as i64+1).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO platform_audit(actor,action,tenant,data) VALUES($1,'shop.quota_changed',$2,$3)").bind(actor).bind(&id).bind(json!({"dailyAi":daily,"revision":revision+1})).execute(&mut *tx).await?;
    tx.commit().await?;
    get(State(a), h, Path(id)).await
}
