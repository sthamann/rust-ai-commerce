//! Stream generic hosted frontend responses and admit only explicitly allowlisted opaque shopper cookies.
use crate::*;
use axum::body::Body;
use futures_util::stream::unfold;
const RESPONSE_LIMIT: usize = 8_000_000;
fn cookie_names() -> Vec<String> {
    env::var("HOSTED_FRONTEND_COOKIE_NAMES")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|name| {
            !name.is_empty()
                && name.len() <= 64
                && name
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        })
        .take(8)
        .map(str::to_owned)
        .collect()
}
fn opaque_pair(pair: &str, names: &[String]) -> bool {
    let Some((name, value)) = pair.split_once('=') else {
        return false;
    };
    names.iter().any(|n| n == name)
        && !value.is_empty()
        && value.len() <= 256
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.~-".contains(&c))
}
pub(super) fn request_cookie(headers: &HeaderMap) -> Option<String> {
    let names = cookie_names();
    let cookie = headers.get("cookie")?.to_str().ok()?;
    let admitted = cookie
        .split(';')
        .map(str::trim)
        .filter(|pair| opaque_pair(pair, &names))
        .collect::<Vec<_>>()
        .join("; ");
    (!admitted.is_empty()).then_some(admitted)
}
fn allowed_response_cookie(cookie: &str, names: &[String]) -> bool {
    let parts = cookie.split(';').map(str::trim).collect::<Vec<_>>();
    let attributes = parts
        .iter()
        .skip(1)
        .map(|part| {
            let (name, value) = part.split_once('=').unwrap_or((part, ""));
            (
                name.trim().to_ascii_lowercase(),
                value.trim().to_ascii_lowercase(),
            )
        })
        .collect::<Vec<_>>();
    cookie.len() < 1024
        && opaque_pair(parts.first().copied().unwrap_or_default(), names)
        && !attributes.iter().any(|(name, _)| name == "domain")
        && attributes
            .iter()
            .any(|(name, value)| name == "httponly" && value.is_empty())
        && attributes
            .iter()
            .any(|(name, value)| name == "secure" && value.is_empty())
        && attributes
            .iter()
            .any(|(name, value)| name == "samesite" && value == "lax")
}
pub(super) fn response(upstream: reqwest::Response) -> Response {
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let headers = upstream.headers().clone();
    // Never buffer SSE until EOF. Backpressure follows the client; disconnect drops the upstream.
    let chunks = unfold(Some((upstream, 0usize)), |state| async move {
        let (mut response, size) = state?;
        match response.chunk().await {
            Ok(Some(bytes)) if size + bytes.len() <= RESPONSE_LIMIT => {
                let next = size + bytes.len();
                Some((Ok::<_, std::io::Error>(bytes), Some((response, next))))
            }
            Ok(None) => None,
            _ => Some((
                Err(std::io::Error::other(
                    "Hosted frontend stream unavailable or oversized",
                )),
                None,
            )),
        }
    });
    let mut result = (status, Body::from_stream(chunks)).into_response();
    for name in [
        "content-type",
        "cache-control",
        "content-security-policy",
        "referrer-policy",
        "x-content-type-options",
        "etag",
        "last-modified",
        "accept-ranges",
        "content-range",
    ] {
        if let Some(value) = headers.get(name) {
            result.headers_mut().insert(name, value.clone());
        }
    }
    if let Some(value) = headers.get("location")
        && value
            .to_str()
            .is_ok_and(|v| v.starts_with('/') && !v.starts_with("//"))
    {
        result.headers_mut().insert("location", value.clone());
    }
    let names = cookie_names();
    for value in headers.get_all("set-cookie") {
        if value
            .to_str()
            .is_ok_and(|v| allowed_response_cookie(v, &names))
        {
            result.headers_mut().append("set-cookie", value.clone());
        }
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;
    #[test]
    fn cookie_policy_excludes_credentials_and_foreign_domains() {
        let names = vec!["shopper_sid".to_owned()];
        assert!(opaque_pair("shopper_sid=s-123", &names));
        assert!(!opaque_pair("admin_token=secret", &names));
        assert!(!opaque_pair("shopper_sid=a b", &names));
        let cookie = "shopper_sid=s-123; Path=/; HttpOnly; Secure; SameSite=Lax";
        assert!(allowed_response_cookie(cookie, &names));
        assert!(!allowed_response_cookie(
            &format!("{cookie}; Domain=.vendune.ai"),
            &names
        ));
        assert!(!allowed_response_cookie(
            &format!("{cookie}; Domain = .vendune.ai"),
            &names
        ));
        assert!(!allowed_response_cookie(
            "shopper_sid=s-123; Path=/",
            &names
        ));
    }
    #[tokio::test]
    async fn first_event_arrives_before_the_upstream_finishes() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let finish = std::sync::Arc::new(tokio::sync::Notify::new());
        let signal = finish.clone();
        let fixture = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 1024];
            assert!(socket.read(&mut request).await.unwrap() > 0);
            let event = "data: ready\n\n";
            socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{event}\r\n", event.len()).as_bytes()).await.unwrap();
            signal.notified().await;
            socket.write_all(b"0\r\n\r\n").await.unwrap();
        });
        let upstream = reqwest::get(format!("http://{address}")).await.unwrap();
        let mut stream = response(upstream).into_body().into_data_stream();
        let first = tokio::time::timeout(std::time::Duration::from_secs(2), stream.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(&first[..], b"data: ready\n\n");
        finish.notify_one();
        fixture.await.unwrap();
    }
}
