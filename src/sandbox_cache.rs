//! Bounded tenant-policy compilation cache. Prepare outside commerce locks; verify the digest under the lock.
use crate::{App, Result, Sandbox, bad, conflict, hash};
use sqlx::Row;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
pub(crate) struct Cache {
    entries: Mutex<HashMap<String, (u64, Arc<Sandbox>)>>,
    clock: std::sync::atomic::AtomicU64,
    slots: Arc<tokio::sync::Semaphore>,
    compiling: [tokio::sync::Mutex<()>; 32],
}
impl Default for Cache {
    fn default() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            clock: std::sync::atomic::AtomicU64::new(0),
            slots: Arc::new(tokio::sync::Semaphore::new(4)),
            compiling: std::array::from_fn(|_| tokio::sync::Mutex::new(())),
        }
    }
}
impl Cache {
    pub(crate) fn get(&self, tenant: &str, digest: &str) -> Option<Arc<Sandbox>> {
        let mut entries = self.entries.lock().unwrap();
        let (tick, sandbox) = entries.get_mut(tenant)?;
        if sandbox.digest() != digest {
            return None;
        }
        *tick = self
            .clock
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        Some(sandbox.clone())
    }
    pub(crate) fn insert(&self, tenant: String, sandbox: Arc<Sandbox>) {
        let mut entries = self.entries.lock().unwrap();
        if !entries.contains_key(&tenant) && entries.len() >= 128 {
            let oldest = entries
                .iter()
                .min_by_key(|(_, v)| v.0)
                .map(|(k, _)| k.clone())
                .unwrap();
            entries.remove(&oldest);
        }
        let tick = self
            .clock
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        entries.insert(tenant, (tick, sandbox));
    }
    pub(crate) async fn compile(&self, key: &str, source: String) -> Result<Arc<Sandbox>> {
        let digest = hash(&source);
        if let Some(cached) = self.get(key, &digest) {
            return Ok(cached);
        }
        let slot = self.slots.clone().try_acquire_owned().map_err(|_| {
            crate::Error(
                crate::StatusCode::TOO_MANY_REQUESTS,
                "Policy compilation busy; retry shortly".into(),
            )
        })?;
        // Fixed stripes deduplicate cold compilation without an unbounded per-key lock map.
        let stripe = digest.as_bytes()[0] as usize % self.compiling.len();
        let _key = self.compiling[stripe].lock().await;
        if let Some(cached) = self.get(key, &digest) {
            return Ok(cached);
        }
        let compiled = tokio::task::spawn_blocking(move || {
            let _slot = slot;
            Sandbox::new(&source)
        })
        .await
        .map_err(|_| bad("Policy compilation failed"))?
        .map_err(bad)?;
        let sandbox = Arc::new(compiled);
        self.insert(key.into(), sandbox.clone());
        Ok(sandbox)
    }
}
pub(crate) async fn prepare(a: &App, tenant: &str) -> Result<Arc<Sandbox>> {
    let row = sqlx::query("SELECT digest,wat FROM extensions WHERE tenant=$1")
        .bind(tenant)
        .fetch_optional(&a.db)
        .await?
        .ok_or(bad("Business approval policy missing"))?;
    let digest: String = row.get("digest");
    if let Some(cached) = a.sandboxes.get(tenant, &digest) {
        return Ok(cached);
    }
    let source: String = row.get("wat");
    if hash(&source) != digest {
        return Err(conflict(
            "Business policy digest mismatch; ask the merchant to reactivate its policy",
        ));
    }
    a.sandboxes.compile(tenant, source).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cache_is_bounded_and_never_reuses_another_digest() {
        let c = Cache::default();
        let s = Arc::new(Sandbox::new("(module)").unwrap());
        for n in 0..200 {
            c.insert(format!("tenant-{n}"), s.clone());
        }
        assert_eq!(c.entries.lock().unwrap().len(), 128);
        assert!(c.get("tenant-199", "wrong").is_none());
        assert!(c.get("tenant-199", s.digest()).is_some());
    }
}
