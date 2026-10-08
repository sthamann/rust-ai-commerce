//! Resolve configured shop subdomains before authentication; reject unknown hosts and conflicting scopes.
use crate::*;
use axum::{extract::Request, middleware::Next};
mod frontend_bindings;
pub(crate) mod frontend_editor;
mod frontend_transport;
pub(crate) mod frontends;
#[derive(Clone)]
pub(crate) struct HostShop {
    pub alias: String,
    pub access: Arc<crate::performance::access_snapshot::AccessSnapshot>,
}
pub(crate) async fn resolve(State(a): State<App>, mut request: Request, next: Next) -> Response {
    let Some(domain) = env::var("SHOP_DOMAIN_SUFFIX")
        .ok()
        .filter(|d| !d.is_empty())
    else {
        return next.run(request).await;
    };
    let host = header(request.headers(), "host")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let host = host.split(':').next().unwrap_or_default();
    if let Some(shop) = host.strip_suffix(&format!(".{domain}"))
        && !["app", "www", "admin", "experience"].contains(&shop)
    {
        if validate_tenant(shop).is_err()
            || shop.contains('.')
            || ["api", "admin", "mail", "platform", "experience"].contains(&shop)
        {
            return Error(StatusCode::NOT_FOUND, "Unknown shop".into()).into_response();
        }
        let channel = header(request.headers(), "sw-sales-channel-id").unwrap_or("default");
        let access = vendune::tenant_scope::scoped(
            vendune::tenant_scope::Scope::System,
            crate::performance::access_snapshot::AccessSnapshot::load(
                &a,
                Some(shop),
                shop,
                channel,
            ),
        )
        .await;
        let access = match access {
            Ok(access) => access,
            Err(_) => {
                return Error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Domain resolution unavailable".into(),
                )
                .into_response();
            }
        };
        let scope = &access.tenant;
        if header(request.headers(), "x-tenant").is_some_and(|t| t != scope) {
            return bad("Shop hostname and request scope disagree").into_response();
        }
        if !access.exists {
            return Error(StatusCode::NOT_FOUND, "Unknown shop".into()).into_response();
        }
        if access.mount.is_some() {
            let channel = &access.channel_id;
            if header(request.headers(), "sw-sales-channel-id").is_some_and(|id| id != channel) {
                return bad("Shop hostname and channel disagree").into_response();
            }
            request
                .headers_mut()
                .insert("sw-sales-channel-id", channel.parse().unwrap());
        }
        request
            .headers_mut()
            .insert("x-tenant", scope.parse().unwrap());
        request.extensions_mut().insert(HostShop {
            alias: shop.into(),
            access,
        });
    }
    next.run(request).await
}

/// Canonical links are server-owned; independent admin login always uses the configured Studio origin.
pub(crate) fn links(shop: &str) -> Value {
    let origin =
        env::var("COMMERCE_PUBLIC_ORIGIN").unwrap_or_else(|_| "http://127.0.0.1:8787".into());
    let storefront = env::var("SHOP_DOMAIN_SUFFIX")
        .ok()
        .filter(|s| !s.is_empty())
        .map(|suffix| format!("https://{shop}.{suffix}/"))
        .unwrap_or_else(|| format!("{}/?shop={shop}", origin.trim_end_matches('/')));
    json!({"storefrontUrl":storefront,"studioUrl":format!("{}/?shop={shop}#merchant",origin.trim_end_matches('/'))})
}
