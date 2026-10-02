//! Bounded, lossy diagnostic counters. Never use this buffer for business events.
use crate::*;
use std::sync::Mutex;

const MAX_KEYS: usize = 1024;

#[derive(Default)]
struct Counter {
    calls: i64,
    failures: i64,
}

#[derive(Default)]
pub(crate) struct ChannelMetrics {
    pending: Mutex<HashMap<(String, &'static str), Counter>>,
}

impl ChannelMetrics {
    pub(crate) fn record(&self, tenant: String, channel: &'static str, failed: bool) {
        let mut pending = self.pending.lock().unwrap();
        let key = (tenant, channel);
        if pending.len() >= MAX_KEYS && !pending.contains_key(&key) {
            return;
        }
        let counter = pending.entry(key).or_default();
        counter.calls = counter.calls.saturating_add(1);
        counter.failures = counter.failures.saturating_add(i64::from(failed));
    }

    pub(crate) async fn flush(&self, db: &PgPool) {
        let counters = {
            let mut pending = self.pending.lock().unwrap();
            pending.drain().collect::<Vec<_>>()
        };
        if counters.is_empty() {
            return;
        }
        let mut tenants = Vec::with_capacity(counters.len());
        let mut channels = Vec::with_capacity(counters.len());
        let mut calls = Vec::with_capacity(counters.len());
        let mut failures = Vec::with_capacity(counters.len());
        for ((tenant, channel), counter) in counters {
            tenants.push(tenant);
            channels.push(channel);
            calls.push(counter.calls);
            failures.push(counter.failures);
        }
        // One task and one bounded bulk write per interval; no task per request.
        let write = sqlx::query("INSERT INTO channel_metrics(tenant,channel,calls,failures) SELECT * FROM unnest($1::text[],$2::text[],$3::bigint[],$4::bigint[]) ON CONFLICT(tenant,channel) DO UPDATE SET calls=channel_metrics.calls+EXCLUDED.calls,failures=channel_metrics.failures+EXCLUDED.failures,last_seen=now()")
            .bind(tenants).bind(channels).bind(calls).bind(failures).execute(db);
        let _ = tokio::time::timeout(std::time::Duration::from_secs(1), write).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn caps_distinct_keys_without_losing_existing_key_updates() {
        let metrics = ChannelMetrics::default();
        for i in 0..(MAX_KEYS + 100) {
            metrics.record(format!("tenant-{i}"), "storefront", false);
        }
        metrics.record("tenant-0".into(), "storefront", true);
        let pending = metrics.pending.lock().unwrap();
        assert_eq!(pending.len(), MAX_KEYS);
        let counter = &pending[&("tenant-0".into(), "storefront")];
        assert_eq!((counter.calls, counter.failures), (2, 1));
    }
}
