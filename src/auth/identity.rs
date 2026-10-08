//! Resolve the current credential and membership once; bootstrap and sandbox checks share the same boundary.
use super::{credentials, permissions, resolve_identity_channel};
use crate::{App, Error, RequestContext, Result, StatusCode, bad, header, tenant};
use serde_json::json;
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
        if selected.is_some()
            || path.starts_with("/store-api/")
            || path.starts_with("/ucp/")
            || path == "/mcp"
            || path.starts_with("/webhooks/")
        {
            ensure_access(a, h).await?;
        }
        let parent = h.access.as_ref().and_then(|s| s.parent.as_deref());
        environment_allowed(parent, path)?;
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
        ensure_access(a, h).await?;
        let access = h.access.as_ref().expect("Admission snapshot loaded");
        h.tenant_status = access.status.clone();
        environment_allowed(access.parent.as_deref(), path)?;
        h.principal.user = Some("bootstrap".into());
        h.principal.role = Some("owner".into());
        h.principal.tenant = Some(t);
        return Ok(());
    }
    let channel_id = crate::marketing::channel_id(h).to_owned();
    let identity =
        resolve_identity_channel(a, &token, selected.as_deref(), Some(&channel_id)).await?;
    let chosen = identity.tenant.unwrap_or_default();
    environment_allowed(identity.parent.as_deref(), path)?;
    let scope = identity.parent.clone().unwrap_or_else(|| chosen.clone());
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
    // Hosted proxies retain their original mount snapshot. Personal identity still
    // uses the freshly read membership/status and channel, never a cross-request cache.
    if h.access.is_none() {
        h.access = Some(std::sync::Arc::new(
            crate::performance::access_snapshot::AccessSnapshot {
                tenant: chosen.clone(),
                channel_id,
                exists: identity.status.is_some(),
                parent: identity.parent.clone(),
                status: identity.status.clone(),
                channel: identity.channel,
                mount: None,
            },
        ));
    }
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

// Identity remains uncached. This only reuses the same request's authoritative shop/channel read.
async fn ensure_access(a: &App, h: &mut RequestContext) -> Result<()> {
    if h.access
        .as_ref()
        .is_some_and(|s| s.matches(h) && s.channel_id == crate::marketing::channel_id(h))
    {
        return Ok(());
    }
    let t = tenant(h)?;
    h.access = Some(
        crate::performance::access_snapshot::AccessSnapshot::load(
            a,
            None,
            &t,
            crate::marketing::channel_id(h),
        )
        .await?,
    );
    Ok(())
}
