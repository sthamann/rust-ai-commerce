//! Bounded, short-lived collection geometry cache; only successful verification is cached.
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
fn cache() -> &'static Mutex<HashMap<String, Instant>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}
pub(super) fn ready(key: &str) -> bool {
    cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(key)
        .is_some_and(|time| time.elapsed() < Duration::from_secs(60))
}
pub(super) fn verified(key: String) {
    let mut entries = cache().lock().unwrap_or_else(|e| e.into_inner());
    entries.retain(|_, time| time.elapsed() < Duration::from_secs(60));
    if entries.len() >= 256 {
        entries.clear();
    }
    entries.insert(key, Instant::now());
}
#[cfg(test)]
mod tests {
    #[test]
    fn verifies_only_known_geometry() {
        assert!(!super::ready("unverified-fixture"));
        super::verified("verified-fixture".into());
        assert!(super::ready("verified-fixture"));
        assert!(!super::ready("other-url:same-name"));
    }
}
