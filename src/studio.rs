//! Verified merchant overview facts consumed by the chat and activity views.
use super::*;
use axum::{extract::Request, middleware::Next};
pub(crate) mod facts;
mod revenue;

pub(super) async fn track_channels(State(a): State<App>, request: Request, next: Next) -> Response {
    let start = std::time::Instant::now();
    let path = request.uri().path();
    let channel = if path == "/mcp" {
        Some("mcp")
    } else if path.starts_with("/ucp/") {
        Some("ucp")
    } else if path.starts_with("/store-api/") {
        Some("storefront")
    } else if path.starts_with("/api/") && !path.starts_with("/api/platform/") {
        Some("api")
    } else if path == "/" && header(request.headers(), "x-tenant").is_some() {
        Some("frontend")
    } else {
        None
    };
    let t = tenant(request.headers()).ok();
    // MatchedPath is the router template, never a customer/object ID or query string.
    let route = request
        .extensions()
        .get::<axum::extract::MatchedPath>()
        .map(|p| p.as_str().to_owned())
        .unwrap_or_else(|| "<unmatched>".into());
    let method = request.method().clone();
    let response = next.run(request).await;
    if let (Some(channel), Some(t)) = (channel, t) {
        let failure = response.status().is_client_error() || response.status().is_server_error();
        if failure {
            eprintln!(
                "http_response tenant={t} channel={channel} method={method} route={route} status={}",
                response.status().as_u16()
            );
        }
        // Diagnostic counters are best-effort and do not delay commerce. They
        // count HTTP calls (including synthetic tests/admin reads), never people.
        a.channel_metrics.record(
            t,
            channel,
            response.status(),
            start.elapsed().as_millis().min(i64::MAX as u128) as i64,
        );
    }
    response
}
pub(super) async fn merchant_overview(
    State(a): State<App>,
    h: RequestContext,
    axum::extract::Query(criteria): axum::extract::Query<CatalogCriteria>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let (locale, chain) = language_context(&a, &h).await?;
    let (facts, page, graph) = tokio::try_join!(
        facts::load(&a, &t),
        product_page(&a, &t, &chain, &criteria),
        async { Ok::<_, Error>(knowledge::graph(&a.db, &t).await?) }
    )?;
    let (settings, _) = commerce::config(&a, &t).await?;
    let ps = &page.products;
    let providers = a.inference.public_providers().await.map_err(bad)?;
    Ok(Json(json!({
        "locale":locale,"tenant":t,"productCurrency":settings.currencies.pricing_currency,"dataMode":"synthetic-demo","products":ps,"productsPagination":{"nextCursor":page.next_cursor,"hasMore":page.next_cursor.is_some(),"limit":page.limit},
        "summary":facts["summary"],"orders":facts["orders"],"timeline":facts["timeline"],
        "knowledge":{"graph":graph,"indexedProducts":facts["indexedProducts"],"lastIndexed":facts["lastIndexed"],"provenance":"curated-demo","modelWeightsLearn":false},
        "learning":{"timeline":facts["learningTimeline"],"variants":facts["variants"],"method":"epsilon-greedy with smoothed purchase rate","reward":"simulated order","causalUpliftProven":false},
        "activity":facts["activity"],"channels":facts["channels"],
        "connections":{"providers":providers["providers"],"chatgptAccountLinked":false,"claudeAccountLinked":false,"localMCPConfig":{"mcpServers":{"vendune":{"command":"python3","args":[env::current_dir().unwrap().join("scripts/mcp_stdio.py").to_string_lossy()],"env":{"COMMERCE_URL":"http://127.0.0.1:8787","COMMERCE_TENANT":t}}}},"localMCP":true,"ucpCheckout":true,"remoteOAuth":false},
        "capabilities":CAPABILITIES.iter().map(|(name,_)|name).collect::<Vec<_>>()
    })))
}
