//! Shared read-context caching with authoritative versions; mutations and checkout locks stay outside memoization.
use crate::*;
use axum::{extract::Request, middleware::Next};
use commerce::Settings;
use std::{
    cell::RefCell,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
pub(crate) mod access_snapshot;
mod admission;
mod cache;
pub(crate) mod cluster_lease;
pub(crate) mod delivery;
pub(crate) use admission::{Admission, reserve_ai_attempt, run as admit_request};
mod invalidation;
mod languages;
pub(crate) use invalidation::start as start_invalidations;
mod pool;
mod row_security;
mod settings;
pub(crate) use languages::{LanguageRow, languages};
pub(crate) use pool::pool_options;
pub(crate) use row_security::verify as verify_row_security;
pub(crate) use settings::settings;

type Scope = (String, String);
pub(crate) struct SettingsEntry {
    version: String,
    value: Arc<Settings>,
    revision: i64,
}
pub(crate) struct LanguageEntry {
    version: String,
    rows: Arc<Vec<LanguageRow>>,
}
pub(crate) struct Reads {
    settings: Mutex<cache::Cache<Scope, SettingsEntry>>,
    languages: Mutex<cache::Cache<(), LanguageEntry>>,
    invalidations: AtomicU64,
    probes: AtomicU64,
    hits: AtomicU64,
    loads: AtomicU64,
    memo_hits: AtomicU64,
    enabled: bool,
}
impl Default for Reads {
    fn default() -> Self {
        Self {
            settings: Mutex::new(cache::Cache::new(256, 32 * 1024 * 1024)),
            languages: Mutex::new(cache::Cache::new(1, 1024 * 1024)),
            invalidations: AtomicU64::new(0),
            probes: AtomicU64::new(0),
            hits: AtomicU64::new(0),
            loads: AtomicU64::new(0),
            memo_hits: AtomicU64::new(0),
            enabled: env::var("READ_CONTEXT_CACHE").as_deref() != Ok("false"),
        }
    }
}
impl Reads {
    pub(crate) fn invalidate(&self, tenant: &str) {
        self.settings
            .lock()
            .unwrap()
            .remove_where(|(t, _)| t == tenant);
        self.invalidations.fetch_add(1, Ordering::Relaxed);
    }
    pub(crate) fn clear(&self) {
        self.settings.lock().unwrap().remove_where(|_| true);
        self.languages.lock().unwrap().remove_where(|_| true);
    }

    pub(crate) fn snapshot(&self) -> Value {
        let (entries, bytes) = self.settings.lock().unwrap().usage();
        json!({"eventInvalidations":self.invalidations.load(Ordering::Relaxed),"enabled":self.enabled,"versionProbes":self.probes.load(Ordering::Relaxed),
            "decodedHits":self.hits.load(Ordering::Relaxed),"payloadLoads":self.loads.load(Ordering::Relaxed),
            "requestMemoHits":self.memo_hits.load(Ordering::Relaxed),"settingsEntries":entries,
            "estimatedSettingsBytes":bytes,"maxSettingsEntries":256,"settingsBudgetBytes":32*1024*1024})
    }
}
#[derive(Default)]
struct Memo {
    settings: HashMap<Scope, Arc<SettingsEntry>>,
    languages: Option<Arc<LanguageEntry>>,
}
tokio::task_local! { static MEMO: RefCell<Memo>; }
pub(crate) async fn read_scope<F: std::future::Future>(future: F) -> F::Output {
    if MEMO.try_with(|_| ()).is_ok() {
        future.await
    } else {
        MEMO.scope(RefCell::new(Memo::default()), future).await
    }
}
pub(crate) async fn memoize(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let read = request.method() == axum::http::Method::GET
        || request.method() == axum::http::Method::POST
            && [
                "/store-api/product",
                "/api/search/product",
                "/api/search/order",
                "/api/merchant/quote",
            ]
            .contains(&request.uri().path());
    let mut response = if read {
        read_scope(next.run(request)).await
    } else {
        next.run(request).await
    };
    let policy = if response.status() == StatusCode::OK && hashed_asset(&path) {
        Some("public, max-age=31536000, immutable")
    } else if path == "/" {
        Some("no-cache")
    } else if path.starts_with("/api/")
        || path.starts_with("/store-api/")
        || path == "/mcp"
        || path.starts_with("/ucp/")
    {
        Some("no-store")
    } else {
        None
    };
    // Explicit image/app policies retain their existing scoped behavior.
    if let Some(policy) = policy
        && !response.headers().contains_key("cache-control")
    {
        response
            .headers_mut()
            .insert("cache-control", policy.parse().unwrap());
    }
    response
}
fn hashed_asset(path: &str) -> bool {
    let Some(file) = path.strip_prefix("/assets/") else {
        return false;
    };
    if file.contains('/') {
        return false;
    }
    let Some((stem, ext)) = file.rsplit_once('.') else {
        return false;
    };
    let bytes = stem.as_bytes();
    if bytes.len() < 10 || bytes[bytes.len() - 9] != b'-' {
        return false;
    }
    ["js", "css"].contains(&ext)
        && bytes[bytes.len() - 8..]
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'-')
}
#[cfg(test)]
mod tests {
    #[test]
    fn immutable_policy_only_matches_fingerprinted_frontend_assets() {
        assert!(super::hashed_asset("/assets/index-123Ab_cd.js"));
        assert!(super::hashed_asset("/assets/index-12-Ab_cd.js"));
        for path in [
            "/api/private-123Ab_cd.js",
            "/assets/index.js",
            "/assets/sub/index-123Ab_cd.js",
            "/assets/index-123Ab_cd.svg",
        ] {
            assert!(!super::hashed_asset(path));
        }
    }
}
