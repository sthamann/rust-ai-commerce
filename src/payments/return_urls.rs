//! Provider return/cancel URLs preserve the tenant and sales channel; navigation is never payment evidence.
use super::*;
pub(crate) fn urls(
    tenant: &str,
    channel: &str,
    attempt: &str,
    live: bool,
) -> Result<(String, String)> {
    let origin = env::var("COMMERCE_PUBLIC_ORIGIN")
        .or_else(|_| env::var("PUBLIC_BASE_URL"))
        .unwrap_or("http://127.0.0.1:8787".into());
    build(&origin, tenant, channel, attempt, live)
}
fn build(
    origin: &str,
    tenant: &str,
    channel: &str,
    attempt: &str,
    live: bool,
) -> Result<(String, String)> {
    let mut url = reqwest::Url::parse(origin).map_err(|_| bad("Invalid commerce public origin"))?;
    if !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || (live && url.scheme() != "https")
    {
        return Err(bad(
            "Payment return URL requires a valid public origin; HTTPS for Live",
        ));
    }
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(Some(&format!("payment/{attempt}")));
    url.query_pairs_mut()
        .append_pair("shop", tenant)
        .append_pair("channel", channel)
        .append_pair("paymentReturn", "approved");
    let approved = url.to_string();
    url.set_query(None);
    url.query_pairs_mut()
        .append_pair("shop", tenant)
        .append_pair("channel", channel)
        .append_pair("paymentReturn", "cancelled");
    Ok((approved, url.to_string()))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scoped_return_and_cancel_are_distinct_and_encoded() {
        let (a, c) = build(
            "https://app.vendune.ai/",
            "shop-a",
            "web & de",
            "attempt-a",
            true,
        )
        .unwrap();
        let a = reqwest::Url::parse(&a).unwrap();
        let c = reqwest::Url::parse(&c).unwrap();
        assert_eq!(
            a.query_pairs().find(|(k, _)| k == "channel").unwrap().1,
            "web & de"
        );
        assert_eq!(a.fragment(), Some("payment/attempt-a"));
        assert_eq!(
            c.query_pairs()
                .find(|(k, _)| k == "paymentReturn")
                .unwrap()
                .1,
            "cancelled"
        );
        assert_ne!(a, c);
    }
    #[test]
    fn live_requires_https_and_origins_cannot_contain_credentials() {
        assert!(build("http://localhost:8787", "a", "default", "x", true).is_err());
        assert!(
            build(
                "https://user:secret@example.test",
                "a",
                "default",
                "x",
                false
            )
            .is_err()
        );
        assert!(build("javascript:alert(1)", "a", "default", "x", false).is_err());
    }
}
