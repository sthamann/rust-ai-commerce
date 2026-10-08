//! Resolve sessions from PostgreSQL on every request: role changes/revocation work across replicas.
//! Remove all client-supplied principal headers before adding server-derived identities.
use crate::{
    App, Error, RequestContext, Response, Result, State, StatusCode, apps, bad, header, tenant,
};
use axum::response::IntoResponse;
use axum::{extract::Request, middleware::Next};
fn forbidden(s: &str) -> Error {
    Error(StatusCode::FORBIDDEN, s.into())
}
pub(crate) fn permit(h: &RequestContext, kind: &str) -> Result<()> {
    header(h, "x-rac-role").ok_or(Error(
        StatusCode::UNAUTHORIZED,
        "Personal login or instance administrator credential required".into(),
    ))?;
    let allowed = super::permissions::allowed(h, kind);
    if allowed {
        Ok(())
    } else {
        Err(forbidden("Role does not permit this action"))
    }
}
pub(crate) async fn authenticate(state: State<App>, request: Request, next: Next) -> Response {
    // Identity lookup is trusted; the admitted business request gets a narrower context below.
    vendune::tenant_scope::scoped(
        vendune::tenant_scope::Scope::System,
        authenticate_scoped(state, request, next),
    )
    .await
}
async fn authenticate_scoped(State(a): State<App>, mut request: Request, next: Next) -> Response {
    for key in [
        "x-rac-user",
        "x-rac-role",
        "x-rac-tenant",
        "x-rac-permissions",
        "x-rac-platform-user",
        "x-rac-history-reason",
        "x-rac-channel-preview",
    ] {
        request.headers_mut().remove(key);
    }
    let mut h = RequestContext::from_request(&request);
    let path = request.uri().path().to_string();
    let method = request.method().to_string();
    // Only the public native shell/assets bypass identity. Hosted shop assets still
    // require current tenant/channel admission and authorized private previews.
    if crate::verified_kernel::native_asset_bypass(
        crate::performance::delivery::native_static(&path),
        request
            .extensions()
            .get::<crate::shop_domains::HostShop>()
            .is_some(),
    ) {
        request.extensions_mut().insert(h);
        return next.run(request).await;
    }
    // Public image subrequests cannot carry frontend custom headers. Resolve only the scoped asset URL
    // before sandbox/session admission; private shops still require the same merchant credential.
    if (path.starts_with("/store-api/assets/")
        || path.starts_with("/store-api/company-logo/")
        || path.starts_with("/products/")
        || path.starts_with("/channel-preview/"))
        && header(&h, "x-tenant").is_none()
        && let Ok(url) = reqwest::Url::parse(&format!("http://local{}", request.uri()))
        && let Some((_, shop)) = url.query_pairs().find(|(k, _)| k == "shop")
    {
        match shop.parse() {
            Ok(value) => {
                h.insert("x-tenant", value);
            }
            Err(_) => return bad("Invalid asset shop scope").into_response(),
        }
    }
    if path.starts_with("/channel-preview/")
        && request
            .extensions()
            .get::<crate::shop_domains::HostShop>()
            .is_none()
        && let Ok(url) = reqwest::Url::parse(&format!("http://local{}", request.uri()))
        && let Some((_, channel)) = url.query_pairs().find(|(k, _)| k == "channel")
    {
        if !apps::identifier(&channel) {
            return bad("Invalid preview channel").into_response();
        }
        h.insert("sw-sales-channel-id", channel.parse().unwrap());
    }
    if path.starts_with("/api/platform/")
        && request
            .extensions()
            .get::<axum::extract::MatchedPath>()
            .and_then(|p| super::route_policy::lookup(p.as_str(), &method))
            != Some("platform")
    {
        return forbidden("Platform route has no registered permission").into_response();
    }
    // Global administration has its own personal-session grant; tenant/admin/bootstrap roles cannot inherit it.
    if path.starts_with("/api/platform/") {
        match crate::platform::authenticate(&a, &h).await {
            Ok(user) => {
                h.insert("x-rac-platform-user", user.parse().unwrap());
            }
            Err(e) => return e.into_response(),
        }
        request.extensions_mut().insert(h);
        return next.run(request).await;
    }

    let policy = if path.starts_with("/api/") {
        let matched = request
            .extensions()
            .get::<axum::extract::MatchedPath>()
            .map(|p| p.as_str());
        match matched.and_then(|p| super::route_policy::lookup(p, &method)) {
            Some(policy) => policy,
            None => return forbidden("API route has no registered permission").into_response(),
        }
    } else {
        "public"
    };
    let public = policy == "public";
    let protected = path.starts_with("/api/") && !public;
    let auth_result = async {
        super::identity::resolve(&a, &mut h, &path, protected).await?;
        if protected {
            permit(&h, policy)?;
        }
        Ok::<(), Error>(())
    }
    .await;
    if let Err(e) = auth_result {
        return e.into_response();
    }
    h.validated_tenant = match crate::platform::admit(&a, &h, &path, &method).await {
        Ok(validated) => validated || h.principal.tenant.is_some(),
        Err(e) => return e.into_response(),
    };
    let preview = match crate::marketing::channel_access::admit(
        &a,
        &h,
        &path,
        &method,
        request
            .extensions()
            .get::<crate::shop_domains::HostShop>()
            .map(|h| h.alias.as_str()),
    )
    .await
    {
        Ok(preview) => preview,
        Err(e) => return e.into_response(),
    };
    if preview {
        let channel = crate::marketing::channel_id(&h).to_owned();
        h.insert("x-rac-channel-preview", channel.parse().unwrap());
    }
    let private_response = preview
        || header(&h, "x-rac-role").is_some()
        || request
            .extensions()
            .get::<crate::shop_domains::HostShop>()
            .is_some();
    let scope = if public
        || path.starts_with("/api/auth/")
        || path == "/api/workspaces"
        || path.starts_with("/api/developer")
        || path.starts_with("/api/environments")
        || path.starts_with("/api/workspace/")
    {
        // Provisioning, identity and staging require cross-workspace reads, after their existing grants.
        vendune::tenant_scope::Scope::System
    } else {
        match tenant(&h) {
            Ok(t) => vendune::tenant_scope::Scope::Tenant(t),
            Err(e) => return e.into_response(),
        }
    };
    *request.headers_mut() = h.transport().clone();
    request.extensions_mut().insert(h);
    let mut response =
        vendune::tenant_scope::scoped(scope, super::abuse::run(&a, request, next)).await;
    if private_response {
        response
            .headers_mut()
            .insert("cache-control", "private, no-store".parse().unwrap());
    }
    response
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn role_matrix() {
        for role in ["owner", "admin", "editor", "viewer"] {
            let mut h = RequestContext::new();
            h.insert("x-rac-role", role.parse().unwrap());
            assert!(permit(&h, "read").is_ok());
            assert_eq!(permit(&h, "catalog").is_ok(), role != "viewer");
            assert_eq!(
                permit(&h, "users").is_ok(),
                role == "owner" || role == "admin"
            );
            assert!(permit(&h, "unknown").is_err());
        }
        assert!(permit(&RequestContext::new(), "read").is_err());
    }
}
