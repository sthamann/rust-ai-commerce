//! Immutable process configuration, validated once at startup. Mutable shop/provider settings remain in PostgreSQL.
use serde_json::Value;
use std::{env, sync::OnceLock};
pub(crate) struct Config {
    pub strict: bool,
    pub transaction_pooling: bool,
    pub listener_url: String,
    pub db_pool_max: u32,
    pub db_pool_min: u32,
    pub db_wait_ms: u32,
    pub db_connection_budget: u32,
    pub allow_bootstrap: bool,
    pub paypal_accounts: Value,
    pub webhook_keys: Value,
    pub paypal_base: String,
    pub paypal_environment: &'static str,
    pub payment_services: Value,
    pub frame_ancestors: String,
    pub default_tenant: Option<String>,
    pub services: Value,
    pub private_service_origins: String,
    pub outbox_retention_days: u32,
    pub outbox_metadata_days: u32,
    pub trusted_proxies: Vec<std::net::IpAddr>,
}
pub(crate) fn get() -> &'static Config {
    static CONFIG: OnceLock<Config> = OnceLock::new();
    CONFIG.get_or_init(|| {
        let strict = flag("DB_RLS_REQUIRED", false);
        let mode = env::var("BOOTSTRAP_MODE").unwrap_or("auto".into());
        assert!(
            !strict || mode == "serve",
            "Strict runtime must use BOOTSTRAP_MODE=serve; migrate in a separate owner job"
        );
        assert!(
            !strict || env::var("DATABASE_RUNTIME_URL").is_ok(),
            "Strict runtime URL required"
        );
        let default_tenant = env::var("PUBLIC_DEFAULT_TENANT")
            .ok()
            .or_else(|| (!strict && flag("SEED_DEMO", true)).then(|| "atelier".into()));
        if let Some(t) = &default_tenant {
            assert!(
                t.len() >= 2
                    && t.len() <= 48
                    && !t.starts_with('-')
                    && !t.ends_with('-')
                    && t.bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
                "Invalid PUBLIC_DEFAULT_TENANT"
            );
        }
        let services: Value =
            serde_json::from_str(&env::var("APP_SERVICES").unwrap_or("{}".into()))
                .expect("Invalid APP_SERVICES JSON");
        assert!(services.is_object(), "APP_SERVICES must be an object");
        let private_service_origins = env::var("APP_SERVICE_PRIVATE_ORIGINS").unwrap_or_default();
        for (_, service) in services.as_object().unwrap() {
            let parsed =
                reqwest::Url::parse(service["url"].as_str().expect("App service URL required"))
                    .expect("Invalid app service URL");
            assert!(
                crate::apps::service_origin_allowed(&parsed, &private_service_origins),
                "App service origin not approved"
            );
            if let Some(ui) = service["uiUrl"].as_str() {
                let ui = reqwest::Url::parse(ui).expect("Invalid app UI URL");
                assert!(
                    ui.username().is_empty()
                        && ui.password().is_none()
                        && (ui.scheme() == "https"
                            || ui.scheme() == "http"
                                && ["localhost", "127.0.0.1"]
                                    .contains(&ui.host_str().unwrap_or(""))),
                    "Unsafe app UI origin"
                );
            }
        }
        let trusted_proxies = env::var("TRUSTED_PROXY_IPS")
            .unwrap_or_default()
            .split(',')
            .filter(|x| !x.trim().is_empty())
            .map(|x| x.trim().parse().expect("Invalid TRUSTED_PROXY_IPS address"))
            .collect();
        let paypal_accounts = json_object("PAYPAL_ACCOUNTS", Some("PAYPAL_SANDBOX_ACCOUNTS"));
        let payment_services = json_object("PAYMENT_SERVICES", None);
        crate::payments::provider_configuration::validate_accounts(
            &paypal_accounts,
            &payment_services,
        );
        let frame_ancestors = env::var("STUDIO_FRAME_ORIGINS")
            .unwrap_or("https://app.vendune.ai https://experience.vendune.ai".into());
        for origin in frame_ancestors.split_whitespace() {
            let url = reqwest::Url::parse(origin).expect("Invalid STUDIO_FRAME_ORIGINS");
            assert!(
                url.origin().ascii_serialization() == origin
                    && url.username().is_empty()
                    && url.password().is_none()
                    && (url.scheme() == "https"
                        || url.scheme() == "http"
                            && ["localhost", "127.0.0.1"].contains(&url.host_str().unwrap_or(""))),
                "Invalid Studio frame origin"
            );
        }
        let db_pool_max = number("DB_POOL_MAX", 20, 1, 256);
        let db_pool_min = number("DB_POOL_MIN", 0, 0, db_pool_max);
        let db_connection_budget = number("DB_CLUSTER_CONNECTION_BUDGET", 80, 4, 100000);
        let processes = number("DB_MAX_PROCESSES", 1, 1, 1024);
        assert!(
            (db_pool_max + 2).saturating_mul(processes) <= db_connection_budget,
            "Pool + listeners exceeds cluster connection budget"
        );
        let pooler_mode = env::var("DB_POOLER_MODE").unwrap_or("session".into());
        assert!(
            ["session", "transaction"].contains(&pooler_mode.as_str()),
            "Invalid DB_POOLER_MODE"
        );
        let transaction_pooling = pooler_mode == "transaction";
        let listener_url = if transaction_pooling {
            env::var("DATABASE_LISTENER_URL").ok().filter(|s|!s.is_empty()).expect(
                "Transaction pooling requires a direct/session DATABASE_LISTENER_URL for LISTEN",
            )
        } else {
            env::var("DATABASE_LISTENER_URL")
                .ok()
                .filter(|s| !s.is_empty())
                .ok_or(env::VarError::NotPresent)
                .or_else(|_| env::var("DATABASE_RUNTIME_URL"))
                .or_else(|_| env::var("DATABASE_URL"))
                .unwrap_or_default()
        };
        Config {
            transaction_pooling,
            listener_url,
            db_pool_max,
            db_pool_min,
            db_connection_budget,
            db_wait_ms: number("DB_POOL_WAIT_MS", 5000, 100, 60000),
            allow_bootstrap: flag("ALLOW_BOOTSTRAP_AUTH", true),
            paypal_accounts,
            webhook_keys: json_object("APP_WEBHOOK_KEYS", None),
            paypal_base: crate::payments::provider_configuration::paypal_base(),
            paypal_environment: crate::payments::provider_configuration::paypal_environment(),
            payment_services,
            frame_ancestors,
            strict,
            default_tenant,
            services,
            private_service_origins,
            outbox_retention_days: number("OUTBOX_RETENTION_DAYS", 90, 1, 3650),
            outbox_metadata_days: number(
                "OUTBOX_METADATA_RETENTION_DAYS",
                365,
                number("OUTBOX_RETENTION_DAYS", 90, 1, 3650),
                36500,
            ),
            trusted_proxies,
        }
    })
}
pub(crate) fn number(key: &str, default: u32, min: u32, max: u32) -> u32 {
    let n = env::var(key)
        .map(|v| v.parse().unwrap_or_else(|_| panic!("Invalid {key}")))
        .unwrap_or(default);
    assert!(
        (min..=max).contains(&n),
        "Invalid {key}: expected {min}..{max}"
    );
    n
}
fn flag(key: &str, default: bool) -> bool {
    match env::var(key).as_deref() {
        Ok("true") => true,
        Ok("false") => false,
        Err(_) => default,
        _ => panic!("Invalid boolean {key}"),
    }
}

fn json_object(key: &str, fallback: Option<&str>) -> Value {
    let raw = env::var(key)
        .or_else(|error| fallback.map(env::var).unwrap_or(Err(error)))
        .unwrap_or("{}".into());
    let value: Value = serde_json::from_str(&raw).unwrap_or_else(|_| panic!("Invalid {key} JSON"));
    assert!(value.is_object(), "{key} must be an object");
    value
}
