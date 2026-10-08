//! Database-backed account and trusted peer-prefix throttles shared by replicas; reserve before password hashing.
use crate::{App, Error, Result, StatusCode, hash, request_context::HeaderReader};
use axum::{
    body::Body,
    extract::{ConnectInfo, Request},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::net::{IpAddr, SocketAddr};
fn prefix(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(ip) => {
            let b = ip.octets();
            format!("{}.{}.{}", b[0], b[1], b[2])
        }
        IpAddr::V6(ip) => {
            let b = ip.octets();
            b[..7].iter().map(|b| format!("{b:02x}")).collect()
        }
    }
}
fn peer(request: &Request) -> String {
    let actual = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|p| p.0.ip());
    let trusted =
        actual.is_some_and(|ip| crate::runtime_config::get().trusted_proxies.contains(&ip));
    // Only the last proxy-added address is trusted; user-supplied leading forwarded values are ignored.
    let forwarded = if trusted {
        request
            .headers()
            .value("x-forwarded-for")
            .and_then(|s| s.rsplit(',').next())
            .and_then(|s| s.trim().parse().ok())
    } else {
        None
    };
    forwarded
        .or(actual)
        .map(prefix)
        .unwrap_or_else(|| "unknown-peer".into())
}
async fn reserve(a: &App, key: &str, limit: i32) -> Result<()> {
    let allowed:Option<i32>=sqlx::query_scalar("INSERT INTO auth_attempt_buckets(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempt_buckets.window_at < now()-interval '1 minute' THEN 1 ELSE auth_attempt_buckets.attempts+1 END,window_at=CASE WHEN auth_attempt_buckets.window_at < now()-interval '1 minute' THEN now() ELSE auth_attempt_buckets.window_at END,updated_at=now() WHERE auth_attempt_buckets.blocked_until<=now() AND (auth_attempt_buckets.window_at<now()-interval '1 minute' OR auth_attempt_buckets.attempts<$2) RETURNING attempts")
        .bind(key).bind(limit).fetch_optional(&a.db).await?;
    if allowed.is_none() {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many sign-in attempts. Wait a minute before trying again.".into(),
        ));
    }
    Ok(())
}
pub(super) async fn run(a: &App, request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let guarded = matches!(
        path.as_str(),
        "/api/auth/login"
            | "/api/auth/register"
            | "/api/auth/accept"
            | "/api/auth/redeem"
            | "/store-api/account/login"
            | "/store-api/account/register"
    );
    if !guarded {
        return crate::performance::admit_request(a, request, next).await;
    }
    let peer = hash(&format!("auth-ip:{}", peer(&request)));
    let checked =
        vendune::tenant_scope::scoped(vendune::tenant_scope::Scope::System, reserve(a, &peer, 120))
            .await;
    if let Err(e) = checked {
        return throttled(e);
    }
    let (parts, body) = request.into_parts();
    let body = match axum::body::to_bytes(body, 65536).await {
        Ok(b) => b,
        Err(_) => return crate::bad("Authentication payload exceeds 64 KiB").into_response(),
    };
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();
    let account = value["email"]
        .as_str()
        .map(|s| s.trim().to_lowercase())
        .or_else(|| {
            value["invitationToken"]
                .as_str()
                .or(value["token"].as_str())
                .map(|s| format!("token:{}", hash(s)))
        });
    let tenant = if path.starts_with("/store-api/") {
        parts.headers.value("x-tenant").unwrap_or("unknown-shop")
    } else {
        "global"
    };
    let key = account.map(|account| hash(&format!("auth-account:{path}:{tenant}:{account}")));
    if let Some(key) = &key
        && let Err(e) =
            vendune::tenant_scope::scoped(vendune::tenant_scope::Scope::System, reserve(a, key, 12))
                .await
    {
        return throttled(e);
    }
    let response =
        crate::performance::admit_request(a, Request::from_parts(parts, Body::from(body)), next)
            .await;
    if response.status() == StatusCode::UNAUTHORIZED
        && let Some(key) = key
    {
        let _=vendune::tenant_scope::scoped(vendune::tenant_scope::Scope::System,sqlx::query("UPDATE auth_attempt_buckets SET blocked_until=now()+least(60,power(2,least(attempts,6))::int)*interval '1 second' WHERE key=$1 AND attempts>=5").bind(key).execute(&a.db)).await;
    }
    response
}
fn throttled(e: Error) -> Response {
    let mut r = e.into_response();
    if r.status() == StatusCode::TOO_MANY_REQUESTS {
        r.headers_mut().insert("retry-after", "60".parse().unwrap());
    }
    r
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefixes_group_addresses_without_storing_personal_addresses() {
        assert_eq!(
            prefix("192.0.2.4".parse().unwrap()),
            prefix("192.0.2.200".parse().unwrap())
        );
        assert_ne!(
            prefix("192.0.3.4".parse().unwrap()),
            prefix("192.0.2.4".parse().unwrap())
        );
        assert_eq!(
            prefix("2001:db8:abcd:1200::1".parse().unwrap()),
            prefix("2001:db8:abcd:12ff::8".parse().unwrap())
        );
    }
}
