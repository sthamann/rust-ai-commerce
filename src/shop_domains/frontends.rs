//! Generic operator-allowlisted frontend mounts. Host scope is derived from storage, never client headers.
use crate::*;
use axum::{extract::Request, middleware::Next};
pub(crate) fn router() -> Router<App> {
    Router::new()
        .secure_route(
            "/api/settings/frontends",
            &[("GET", "settings.read"), ("PUT", "settings.write")],
            get(super::frontend_bindings::list).put(super::frontend_bindings::bind),
        )
        .secure_route(
            "/api/settings/frontends/{alias}",
            &[("DELETE", "settings.write")],
            axum::routing::delete(super::frontend_bindings::remove),
        )
}
pub(super) fn valid_origin(s: &str) -> bool {
    reqwest::Url::parse(s).is_ok_and(|u| {
        u.username().is_empty()
            && u.password().is_none()
            && u.query().is_none()
            && u.fragment().is_none()
            && u.path() == "/"
            && (u.scheme() == "https"
                || u.scheme() == "http" && matches!(u.host_str(), Some("127.0.0.1" | "localhost")))
    })
}
pub(crate) fn public_path(path: &str) -> bool {
    if path.starts_with("/channel-preview/")
        || path.starts_with("/api/")
        || path.starts_with("/store-api/")
        || path.starts_with("/ucp/")
        || path == "/mcp"
        || path == "/health"
        || path.starts_with("/.well-known/")
    {
        return false;
    }
    if path.starts_with("/experience-api/") {
        return path == "/experience-api/context" || path.starts_with("/experience-api/shops/");
    }
    !path.starts_with("/experience-internal/")
}
pub(crate) async fn serve(State(a): State<App>, request: Request, next: Next) -> Response {
    let Some(host) = request.extensions().get::<super::HostShop>().cloned() else {
        return next.run(request).await;
    };
    if !public_path(request.uri().path()) {
        return next.run(request).await;
    }
    let Some(mount) = host.access.mount.as_ref() else {
        return next.run(request).await;
    };
    if host.access.status.as_deref() != Some("active") {
        return Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Shop or sales channel is unavailable".into(),
        )
        .into_response();
    }
    match proxy(&a, request, &host.alias, &host.access, mount).await {
        Ok(r) => r,
        Err(e) => e.into_response(),
    }
}
async fn proxy(
    a: &App,
    request: Request,
    alias: &str,
    access: &crate::performance::access_snapshot::AccessSnapshot,
    mount: &crate::performance::access_snapshot::FrontendMount,
) -> Result<Response> {
    let origin = &mount.origin;
    if !valid_origin(origin)
        || env::var("HOSTED_FRONTEND_ORIGIN").ok().as_deref() != Some(origin.as_str())
    {
        return Err(bad("Frontend destination unavailable"));
    }
    let key = env::var("HOSTED_FRONTEND_KEY")
        .ok()
        .filter(|k| k.len() >= 64)
        .ok_or(bad("Frontend gateway not configured"))?;
    let (parts, body) = request.into_parts();
    let bytes = axum::body::to_bytes(body, 8_000_000)
        .await
        .map_err(|_| bad("Frontend body exceeds limit"))?;
    let path = parts
        .uri
        .path_and_query()
        .map(|s| s.as_str())
        .unwrap_or("/");
    let target = format!("{}{}", origin.trim_end_matches('/'), path);
    let mut req = a
        .http
        .request(
            reqwest::Method::from_bytes(parts.method.as_str().as_bytes())
                .map_err(|_| bad("Invalid method"))?,
            target,
        )
        .body(bytes)
        .header("x-frontend-key", key)
        .header("x-frontend-alias", &mount.experience_alias)
        .header("x-frontend-host", alias)
        .header("x-frontend-tenant", &access.tenant)
        .header("x-frontend-channel", &access.channel_id);
    for key in [
        "content-type",
        "accept",
        "last-event-id",
        "range",
        "if-none-match",
        "x-locale",
        "x-cart-token",
        "x-customer-token",
        "idempotency-key",
        "origin",
    ] {
        if let Some(value) = parts.headers.get(key) {
            req = req.header(key, value);
        }
    }
    if let Some(preview) = header(&parts.headers, "x-channel-preview")
        .map(str::to_owned)
        .or_else(|| crate::marketing::channel_preview::cookie(&parts.headers))
    {
        req = req.header("x-channel-preview", preview);
    }
    if let Some(cookie) = super::frontend_transport::request_cookie(&parts.headers) {
        req = req.header("cookie", cookie);
    }
    let r = req.send().await.map_err(|_| {
        Error(
            StatusCode::BAD_GATEWAY,
            "Frontend service unavailable".into(),
        )
    })?;
    Ok(super::frontend_transport::response(r))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mount_never_captures_core_or_internal_services() {
        for p in [
            "/api/auth/login",
            "/api/platform/shops",
            "/store-api/checkout/order",
            "/mcp",
            "/.well-known/ucp",
            "/experience-internal/credentials",
            "/experience-api/auth/login",
        ] {
            assert!(!public_path(p));
        }
        for p in [
            "/",
            "/assets/app.js",
            "/experience-api/shops/demo/commerce/checkout/cart",
        ] {
            assert!(public_path(p));
        }
        assert!(valid_origin("https://experience.example.test"));
        assert!(!valid_origin("https://key@example.test"));
        assert!(!valid_origin("http://169.254.169.254"));
    }
}
