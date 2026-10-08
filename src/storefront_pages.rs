//! Deep-link HTML transport for stable SKU URLs with optional localized SEO slugs.
//! Product visibility uses the same tenant/channel admission as the Store API; assets and unknown APIs retain 404s.
use crate::*;
use axum::{extract::Query, response::Html};
#[derive(Default, Deserialize)]
pub(crate) struct PageContext {
    language: Option<String>,
    channel: Option<String>,
    shop: Option<String>,
}
pub(crate) async fn product_page(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Query(context): Query<PageContext>,
) -> Result<Html<String>> {
    page(&a, h, &id, context).await
}
pub(crate) async fn product_page_slug(
    State(a): State<App>,
    h: RequestContext,
    Path((id, _slug)): Path<(String, String)>,
    Query(context): Query<PageContext>,
) -> Result<Html<String>> {
    page(&a, h, &id, context).await
}
async fn page(
    a: &App,
    mut h: RequestContext,
    id: &str,
    context: PageContext,
) -> Result<Html<String>> {
    if context
        .shop
        .as_deref()
        .is_some_and(|s| header(&h, "x-tenant").is_some_and(|t| t != s))
    {
        return Err(bad("Shop hostname and request scope disagree"));
    }
    for (key, value) in [
        ("x-commerce-locale", context.language),
        ("sw-sales-channel-id", context.channel),
    ] {
        if let Some(value) = value {
            if header(&h, key).is_some_and(|existing| existing != value) {
                return Err(bad("Page context and request scope disagree"));
            }
            h.insert(key, value.parse().map_err(|_| bad("Invalid page context"))?);
        }
    }
    marketing::admit_product(a, &h, id).await?;
    let html = tokio::fs::read_to_string("frontend/dist/index.html")
        .await
        .map_err(|_| {
            Error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Storefront unavailable".into(),
            )
        })?;
    Ok(Html(html))
}
