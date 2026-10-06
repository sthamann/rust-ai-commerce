//! Resolve configured shop subdomains before authentication; reject unknown hosts and conflicting scopes.
use crate::*;
use axum::{extract::Request, middleware::Next};
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
        && !["app", "www", "admin"].contains(&shop)
    {
        if validate_tenant(shop).is_err()
            || shop.contains('.')
            || ["api", "admin", "mail", "platform"].contains(&shop)
        {
            return Error(StatusCode::NOT_FOUND, "Unknown shop".into()).into_response();
        }
        if header(request.headers(), "x-tenant").is_some_and(|t| t != shop) {
            return bad("Shop hostname and request scope disagree").into_response();
        }
        let exists =
            sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1)")
                .bind(shop)
                .fetch_one(&a.db)
                .await;
        if !matches!(exists, Ok(true)) {
            return Error(StatusCode::NOT_FOUND, "Unknown shop".into()).into_response();
        }
        request
            .headers_mut()
            .insert("x-tenant", shop.parse().unwrap());
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
