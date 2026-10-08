//! Pure startup validation of the native provider origin; no live credentials or provider calls.
use std::env;
pub(crate) fn paypal_base() -> String {
    let live = env::var("PAYPAL_ENVIRONMENT").unwrap_or("sandbox".into());
    if !["live", "sandbox"].contains(&live.as_str()) {
        panic!("PAYPAL_ENVIRONMENT must be live or sandbox");
    }
    let expected = if live == "live" {
        "https://api-m.paypal.com"
    } else {
        "https://api-m.sandbox.paypal.com"
    };
    let base = env::var("PAYPAL_SANDBOX_BASE_URL").unwrap_or(expected.into());
    let url = reqwest::Url::parse(&base).expect("Invalid PayPal URL");
    if base != expected
        && !(live == "sandbox"
            && url.scheme() == "http"
            && ["127.0.0.1", "localhost"].contains(&url.host_str().unwrap_or(""))
            && url.username().is_empty()
            && url.password().is_none()
            && url.path() == "/"
            && url.query().is_none())
    {
        panic!("PayPal origin must match its configured environment");
    }
    base.trim_end_matches('/').into()
}
pub(crate) fn paypal_environment() -> &'static str {
    if env::var("PAYPAL_SANDBOX_BASE_URL").is_ok_and(|s| s.starts_with("http://")) {
        "contract-fixture"
    } else if env::var("PAYPAL_ENVIRONMENT").is_ok_and(|s| s == "live") {
        "live"
    } else {
        "sandbox"
    }
}

/// Validate every declared provider at startup, without embedding credential values in diagnostics.
pub(crate) fn validate_accounts(accounts: &serde_json::Value, services: &serde_json::Value) {
    for account in accounts
        .as_object()
        .expect("PayPal accounts object")
        .values()
    {
        for key in ["clientId", "clientSecret", "bnCode"] {
            assert!(
                account[key].as_str().is_some_and(|s| !s.is_empty()),
                "Incomplete PayPal account configuration"
            );
        }
        assert!(
            account["bnCode"]
                .as_str()
                .unwrap()
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_'),
            "Invalid provider attribution configuration"
        );
    }
    for versions in services
        .as_object()
        .expect("Payment services object")
        .values()
    {
        for version in versions
            .as_object()
            .expect("Payment service versions object")
            .values()
        {
            if version["url"].is_string() {
                super::remote::validate_service(
                    version,
                    version["environment"]
                        .as_str()
                        .expect("Payment environment required"),
                )
                .expect("Invalid payment service configuration");
            } else {
                let environments = version
                    .as_object()
                    .expect("Payment environment map required");
                assert!(
                    !environments.is_empty()
                        && environments
                            .keys()
                            .all(|key| ["sandbox", "live", "contract-fixture"]
                                .contains(&key.as_str())),
                    "Payment environment map must declare supported environments"
                );
                for environment in ["sandbox", "live", "contract-fixture"] {
                    if let Some(config) = version.get(environment) {
                        super::remote::validate_service(config, environment)
                            .expect("Invalid payment service environment configuration");
                    }
                }
            }
        }
    }
}
