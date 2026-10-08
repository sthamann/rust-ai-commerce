//! Audited, reversible lifecycle; preserved commerce records and current revision prevent accidental overwrites.
use super::*;
pub(super) async fn change(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let actor = auth::actor(&h)?;
    validate_tenant(&id)?;
    let target = v["status"]
        .as_str()
        .filter(|s| ["active", "paused", "archived"].contains(s))
        .ok_or(bad("Invalid shop status"))?;
    let reason = v["reason"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 500)
        .ok_or(bad("A reason is required"))?;
    if target == "archived" && v["confirmShopId"].as_str() != Some(&id) {
        return Err(bad("Confirm the shop ID before moving it to trash"));
    }
    let mut tx = a.db.begin().await?;
    let row=sqlx::query("SELECT status,status_revision FROM tenants t WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=t.id) FOR UPDATE").bind(&id).fetch_optional(&mut *tx).await?.ok_or(Error(StatusCode::NOT_FOUND,"Shop not found".into()))?;
    if !verified_kernel::revision_admissible(
        v["revision"]
            .as_u64()
            .filter(|r| *r > 0)
            .ok_or(bad("Positive revision required"))?,
        row.get::<i64, _>("status_revision") as u64,
    ) {
        return Err(conflict("Shop status changed; reload before editing"));
    }
    let before: String = row.get("status");
    sqlx::query("UPDATE tenants SET status=$2,status_revision=status_revision+1,status_updated_at=now() WHERE id=$1").bind(&id).bind(target).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO platform_audit(actor,action,tenant,data) VALUES($1,'shop.status_changed',$2,$3)").bind(actor).bind(&id).bind(json!({"before":before,"after":target,"reason":reason})).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"status":target,"revision":row.get::<i64,_>("status_revision")+1,"recoverable":true}),
    ))
}
/// Evaluate availability after identity derivation. Paused shops retain merchant GET access; deleted shops require restoration.
pub(crate) async fn admit(a: &App, h: &RequestContext, path: &str, method: &str) -> Result<bool> {
    if path.starts_with("/api/auth/")
        || path.starts_with("/api/platform/")
        || path.starts_with("/api/identity/")
        || path == "/api/capabilities"
        || path == "/api/workspaces"
        || path == "/health"
        || path.starts_with("/assets/")
        || !["/api/", "/store-api/", "/ucp/", "/mcp", "/webhooks/"]
            .iter()
            .any(|prefix| path.starts_with(prefix))
    {
        return Ok(false);
    }
    let t = tenant(h)?;
    let status = if h.principal.tenant.as_deref() == Some(t.as_str()) && h.tenant_status.is_some() {
        h.tenant_status.clone()
    } else if let Some(access) = h.access.as_ref().filter(|s| s.matches(h)) {
        access.status.clone()
    } else {
        sqlx::query_scalar::<_,String>("SELECT t.status FROM tenants t WHERE t.id=coalesce((SELECT live_tenant FROM shop_environments WHERE tenant=$1),$1)").bind(&t).fetch_optional(&a.db).await?
    };
    let Some(status) = status else {
        return Err(Error(StatusCode::NOT_FOUND, "Shop not found".into()));
    };
    let read = (method == "GET"
        || method == "POST"
            && [
                "/api/search/product",
                "/api/search/order",
                "/api/merchant/quote",
            ]
            .contains(&path))
        && header(h, "x-rac-user").is_some()
        && path.starts_with("/api/");
    // Reconciliation callbacks for already-created payments must remain usable during suspension/trash.
    // Route exemption is availability only: the handler still verifies HMAC and original attempt identity.
    let settlement = method == "POST"
        && (path == "/store-api/payments/paypal/webhooks"
            || path
                .strip_prefix("/store-api/payment-providers/")
                .is_some_and(|tail| {
                    tail.strip_suffix("/webhooks")
                        .is_some_and(|id| !id.is_empty() && !id.contains('/'))
                }));
    if !verified_kernel::shop_request_admissible(
        status == "active",
        status == "paused",
        read,
        settlement,
    ) {
        return Err(Error(
            if status == "archived" {
                StatusCode::GONE
            } else {
                StatusCode::SERVICE_UNAVAILABLE
            },
            "Shop is unavailable; contact the platform operator".into(),
        ));
    }
    Ok(true)
}
