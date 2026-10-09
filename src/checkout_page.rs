//! The existing checkout may be framed only by its registered tenant/channel storefront.
use crate::*;
use axum::extract::Query;
use axum::response::Html;
pub(crate) async fn page(
    State(a): State<App>,
    Query(q): Query<HashMap<String, String>>,
) -> Result<Response> {
    let mut frames = crate::runtime_config::get().frame_ancestors.clone();
    if q.get("embed").is_some_and(|v| v == "1") {
        let t = q.get("shop").ok_or(bad("Checkout shop required"))?;
        validate_tenant(t)?;
        let channel = q.get("channel").map(String::as_str).unwrap_or("default");
        let origin = q
            .get("parentOrigin")
            .ok_or(bad("Checkout parent required"))?;
        let url = reqwest::Url::parse(origin).map_err(|_| bad("Invalid checkout parent"))?;
        let suffix = env::var("SHOP_DOMAIN_SUFFIX").unwrap_or_else(|_| "vendune.ai".into());
        let host = url.host_str().ok_or(bad("Invalid checkout parent"))?;
        let alias = host
            .strip_suffix(&format!(".{suffix}"))
            .ok_or(bad("Checkout parent unavailable"))?;
        validate_tenant(alias)?;
        if url.scheme() != "https"
            || url.origin().ascii_serialization() != *origin
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err(bad("Invalid checkout parent"));
        }
        let allowed:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM hosted_frontends WHERE tenant=$1 AND channel=$2 AND alias=$3)").bind(t).bind(channel).bind(alias).fetch_one(&a.db).await?;
        if !allowed {
            return Err(Error(
                StatusCode::FORBIDDEN,
                "Checkout parent is not connected to this shop".into(),
            ));
        }
        frames = origin.clone();
    }
    let html = tokio::fs::read_to_string("frontend/dist/index.html")
        .await
        .map_err(|_| {
            Error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Checkout interface unavailable".into(),
            )
        })?;
    let mut response = Html(html).into_response();
    response
        .headers_mut()
        .insert("cache-control", "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert("referrer-policy", "no-referrer".parse().unwrap());
    response.headers_mut().insert(
        "content-security-policy",
        crate::security_headers::native_policy(&frames)
            .parse()
            .map_err(|_| bad("Invalid checkout policy"))?,
    );
    Ok(response)
}
