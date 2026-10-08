//! Native static bypass and bounded HTTP compression; credentials, streams and already encoded bodies stay intact.
use axum::{extract::Request, middleware::Next, response::Response};
use tower_http::compression::{
    CompressionLayer,
    predicate::{DefaultPredicate, Predicate},
};

#[derive(Clone, Copy)]
struct Uncompressed;

pub(crate) fn assets() -> tower_http::services::ServeDir {
    tower_http::services::ServeDir::new("frontend/dist")
        .append_index_html_on_directories(true)
        .precompressed_br()
        .precompressed_gzip()
}

pub(crate) fn native_static(path: &str) -> bool {
    path == "/"
        || path.starts_with("/assets/")
        || path.starts_with("/images/")
        || path.starts_with("/brand/")
        || matches!(
            path,
            "/favicon.svg" | "/robots.txt" | "/manifest.webmanifest"
        )
}

pub(crate) async fn classify(request: Request, next: Next) -> Response {
    let path = request.uri().path();
    let native = native_static(path)
        && request
            .extensions()
            .get::<crate::shop_domains::HostShop>()
            .is_none();
    // Opt in known secret-free read models, never arbitrary future endpoints or
    // third-party HTML. Checkout/MCP/UCP can return bearer tokens/client secrets.
    let eligible = compressible_read(path) || native;
    let mut response = next.run(request).await;
    if !eligible || response.headers().contains_key("set-cookie") {
        response.extensions_mut().insert(Uncompressed);
    }
    // ServeDir sidecars are already encoded, so CompressionLayer does not add
    // Vary for them. Identity variants need the same negotiation key in caches.
    if native
        && !response.headers().get_all("vary").iter().any(|v| {
            v.to_str().is_ok_and(|s| {
                s.split(',')
                    .any(|k| k.trim().eq_ignore_ascii_case("accept-encoding") || k.trim() == "*")
            })
        })
    {
        response
            .headers_mut()
            .append("vary", "accept-encoding".parse().unwrap());
    }
    response
}
fn compressible_read(path: &str) -> bool {
    path == "/store-api/product"
        || path
            .strip_prefix("/store-api/product/")
            .is_some_and(|id| !id.is_empty() && !id.contains('/'))
        || matches!(
            path,
            "/api/search/product"
                | "/api/merchant/overview"
                | "/store-api/countries"
                | "/store-api/navigation"
                | "/api/knowledge/status"
        )
}

pub(crate) fn compression() -> CompressionLayer<impl Predicate> {
    CompressionLayer::new().compress_when(DefaultPredicate::new().and(
        |_: axum::http::StatusCode,
         _: axum::http::Version,
         _: &axum::http::HeaderMap,
         extensions: &axum::http::Extensions| {
            extensions.get::<Uncompressed>().is_none()
        },
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn credentials_and_unknown_future_routes_are_not_compression_candidates() {
        for path in [
            "/api/auth/session",
            "/api/workspace/integrations",
            "/store-api/checkout/cart",
            "/store-api/checkout/order",
            "/mcp",
            "/ucp/v1/checkout-sessions",
            "/api/new-secret-feature",
            "/store-api/product/mug/downloads",
        ] {
            assert!(!super::compressible_read(path));
        }
        assert!(super::compressible_read("/store-api/product/mug"));
    }
    #[test]
    fn streams_images_and_small_responses_remain_uncompressed() {
        use tower_http::compression::predicate::{DefaultPredicate, Predicate};
        for content_type in ["text/event-stream", "image/png", "application/grpc"] {
            let response = axum::http::Response::builder()
                .header("content-type", content_type)
                .body(axum::body::Body::from("x".repeat(2048)))
                .unwrap();
            assert!(!DefaultPredicate::new().should_compress(&response));
        }
        assert!(
            !DefaultPredicate::new()
                .should_compress(&axum::http::Response::new(axum::body::Body::from("short")))
        );
    }
    #[test]
    fn static_bypass_never_captures_scoped_assets_or_operations() {
        for path in ["/", "/assets/index-12345678.js", "/images/logo.svg"] {
            assert!(super::native_static(path));
        }
        for path in [
            "/store-api/assets/a",
            "/api/auth/login",
            "/products/a",
            "/channel-preview/a",
            "/mcp",
            "/ucp/v1/checkout-sessions",
        ] {
            assert!(!super::native_static(path));
        }
    }
}
