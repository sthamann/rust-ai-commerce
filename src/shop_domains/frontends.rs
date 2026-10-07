//! Generic operator-allowlisted frontend mounts. Host scope is derived from storage, never client headers.
use crate::*;
use axum::{extract::Request, middleware::Next};
pub(crate) fn router() -> Router<App> {
    Router::new().route("/api/settings/frontends", get(list).put(bind))
}
async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    auth::permit(&h, "settings.read")?;
    let rows =
        sqlx::query("SELECT alias,channel FROM hosted_frontends WHERE tenant=$1 ORDER BY alias")
            .bind(tenant(&h)?)
            .fetch_all(&a.db)
            .await?;
    Ok(Json(
        json!({"frontends":rows.iter().map(|r|json!({"alias":r.get::<String,_>("alias"),"channel":r.get::<String,_>("channel"),"url":super::links(&r.get::<String,_>("alias"))["storefrontUrl"]})).collect::<Vec<_>>()}),
    ))
}
async fn bind(State(a): State<App>, h: HeaderMap, Json(v): Json<Value>) -> Result<Json<Value>> {
    auth::permit(&h, "settings.write")?;
    let t = tenant(&h)?;
    let alias = v["alias"]
        .as_str()
        .ok_or(bad("Frontend address required"))?;
    validate_tenant(alias)?;
    if [
        "app",
        "www",
        "api",
        "admin",
        "mail",
        "platform",
        "experience",
    ]
    .contains(&alias)
    {
        return Err(bad("Reserved address"));
    }
    let channel = v["channel"]
        .as_str()
        .filter(|s| apps::identifier(s))
        .ok_or(bad("Channel required"))?;
    let origin = env::var("HOSTED_FRONTEND_ORIGIN").map_err(|_| {
        Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Hosted frontend service is not configured".into(),
        )
    })?;
    if !valid_origin(&origin) {
        return Err(bad("Operator frontend origin is invalid"));
    }
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,43))")
        .bind(alias)
        .execute(&mut *tx)
        .await?;
    let occupied: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1 AND id<>$2)")
            .bind(alias)
            .bind(&t)
            .fetch_one(&mut *tx)
            .await?;
    if occupied {
        return Err(conflict("Address belongs to another shop"));
    }
    let available:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM sales_channels WHERE tenant=$1 AND id=$2 AND data->>'active'='true')").bind(&t).bind(channel).fetch_one(&mut *tx).await?;
    if !available {
        return Err(bad("Active channel required"));
    }
    let n=sqlx::query("INSERT INTO hosted_frontends(alias,tenant,channel,origin) VALUES($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET channel=excluded.channel,origin=excluded.origin WHERE hosted_frontends.tenant=excluded.tenant")
        .bind(alias).bind(&t).bind(channel).bind(origin).execute(&mut *tx).await?.rows_affected();
    if n == 0 {
        return Err(conflict("Address belongs to another shop"));
    }
    tx.commit().await?;
    Ok(Json(
        json!({"alias":alias,"channel":channel,"urls":super::links(alias)}),
    ))
}
fn valid_origin(s: &str) -> bool {
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
    if path.starts_with("/api/")
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
    let Some(alias) = request
        .extensions()
        .get::<super::HostShop>()
        .map(|h| h.alias.clone())
    else {
        return next.run(request).await;
    };
    if !public_path(request.uri().path()) {
        return next.run(request).await;
    }
    let row = match sqlx::query("SELECT f.tenant,f.channel,f.origin,t.status,c.data->>'active' AS active FROM hosted_frontends f JOIN tenants t ON t.id=f.tenant JOIN sales_channels c ON c.tenant=f.tenant AND c.id=f.channel WHERE f.alias=$1")
        .bind(&alias)
        .fetch_optional(&a.db)
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return next.run(request).await,
        Err(_) => {
            return Error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Frontend unavailable".into(),
            )
            .into_response();
        }
    };
    if row.get::<String, _>("status") != "active"
        || row.get::<Option<String>, _>("active").as_deref() != Some("true")
    {
        return Error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Shop or sales channel is unavailable".into(),
        )
        .into_response();
    }
    match proxy(&a, request, &alias, &row).await {
        Ok(r) => r,
        Err(e) => e.into_response(),
    }
}
async fn proxy(
    a: &App,
    request: Request,
    alias: &str,
    row: &sqlx::postgres::PgRow,
) -> Result<Response> {
    let origin: String = row.get("origin");
    if !valid_origin(&origin)
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
        .header("x-frontend-alias", alias)
        .header("x-frontend-tenant", row.get::<String, _>("tenant"))
        .header("x-frontend-channel", row.get::<String, _>("channel"));
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
