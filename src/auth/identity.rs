//! Resolve the current credential and membership once; bootstrap and sandbox checks share the same boundary.
use super::{credentials, permissions, resolve_identity};
use crate::{App, Error, RequestContext, Result, StatusCode, bad, header, tenant};
use serde_json::json;
use sqlx::Row;
fn denied(message: &str) -> Error {
    Error(StatusCode::FORBIDDEN, message.into())
}
fn environment_allowed(parent: Option<&str>, path: &str) -> Result<()> {
    if parent.is_some()
        && (path.starts_with("/api/workspace") || path.starts_with("/api/environments"))
    {
        return Err(denied(
            "Manage membership and environments in the live workspace",
        ));
    }
    Ok(())
}
pub(super) async fn resolve(
    a: &App,
    h: &mut RequestContext,
    path: &str,
    protected: bool,
) -> Result<()> {
    let selected = header(h, "x-tenant").map(str::to_string);
    let token = header(h, "authorization")
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(str::to_string);
    let Some(token) = token else {
        let parent = match selected {
            Some(t) => crate::staging::parent(a, &t).await?,
            None => None,
        };
        environment_allowed(parent.as_deref(), path)?;
        if protected
            || parent.is_some()
                && (path.starts_with("/store-api/")
                    || path.starts_with("/api/")
                    || path.starts_with("/ucp/")
                    || path == "/mcp")
        {
            return Err(Error(
                StatusCode::UNAUTHORIZED,
                "Merchant login required".into(),
            ));
        }
        return Ok(());
    };
    if credentials::bootstrap_matches(&token, &a.token) {
        if !crate::runtime_config::get().allow_bootstrap {
            return Err(Error(
                StatusCode::UNAUTHORIZED,
                "Personal merchant session required".into(),
            ));
        }
        let t = tenant(h)?;
        let record=sqlx::query("SELECT e.live_tenant AS parent,t.status FROM (SELECT $1::text AS tenant) selected LEFT JOIN shop_environments e ON e.tenant=selected.tenant LEFT JOIN tenants t ON t.id=coalesce(e.live_tenant,selected.tenant)")
            .bind(&t).fetch_one(&a.db).await?;
        let parent: Option<String> = record.get("parent");
        h.tenant_status = record.get("status");
        environment_allowed(parent.as_deref(), path)?;
        h.principal.user = Some("bootstrap".into());
        h.principal.role = Some("owner".into());
        h.principal.tenant = Some(t);
        return Ok(());
    }
    let identity = resolve_identity(a, &token, selected.as_deref()).await?;
    let chosen = identity.tenant.unwrap_or_default();
    environment_allowed(identity.parent.as_deref(), path)?;
    let scope = identity.parent.unwrap_or_else(|| chosen.clone());
    if identity.scopes.is_some() && scope != identity.default {
        return Err(denied("Integration key is bound to one workspace"));
    }
    let member = identity
        .members
        .iter()
        .find(|m| m.tenant == scope)
        .ok_or(denied("No active membership in this workspace"))?;
    h.insert(
        "x-tenant",
        chosen.parse().map_err(|_| bad("Invalid tenant"))?,
    );
    h.principal.tenant = Some(chosen);
    h.principal.user = Some(identity.user);
    h.principal.role = Some(member.role.clone());
    h.tenant_status = identity.status;
    h.principal.permissions =
        (!member.permissions.is_null()).then(|| member.permissions.to_string());
    if let Some(scopes) = identity.scopes {
        let allowed: Vec<_> = scopes
            .into_iter()
            .filter(|s| permissions::allowed(h, s))
            .collect();
        h.principal.permissions = Some(json!(allowed).to_string());
        h.principal.role = Some("admin".into());
    }
    Ok(())
}
