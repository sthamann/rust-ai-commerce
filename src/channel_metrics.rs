//! Bounded, lossy diagnostic counters. Never use this buffer for business events.
use crate::*;
use std::sync::Mutex;

const MAX_KEYS: usize = 1024;

#[derive(Default)]
struct Counter {
    calls: i64,
    failures: i64,
    total_ms: i64,
    max_ms: i64,
}

#[derive(Default)]
pub(crate) struct ChannelMetrics {
    pending: Mutex<HashMap<(String, &'static str), Counter>>,
}

impl ChannelMetrics {
    pub(crate) fn record(
        &self,
        tenant: String,
        channel: &'static str,
        failed: bool,
        elapsed_ms: i64,
    ) {
        let mut pending = self.pending.lock().unwrap();
        let key = (tenant, channel);
        if pending.len() >= MAX_KEYS && !pending.contains_key(&key) {
            return;
        }
        let counter = pending.entry(key).or_default();
        counter.calls = counter.calls.saturating_add(1);
        counter.failures = counter.failures.saturating_add(i64::from(failed));
        counter.total_ms = counter.total_ms.saturating_add(elapsed_ms);
        counter.max_ms = counter.max_ms.max(elapsed_ms);
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
        let mut total_ms = Vec::with_capacity(counters.len());
        let mut max_ms = Vec::with_capacity(counters.len());
        for ((tenant, channel), counter) in counters {
            tenants.push(tenant);
            channels.push(channel);
            calls.push(counter.calls);
            failures.push(counter.failures);
            total_ms.push(counter.total_ms);
            max_ms.push(counter.max_ms);
        }
        // One task and one bounded bulk write per interval; no task per request.
        let write = sqlx::query("INSERT INTO channel_metrics(tenant,channel,calls,failures,total_ms,max_ms,timed_calls) SELECT *,c FROM unnest($1::text[],$2::text[],$3::bigint[],$4::bigint[],$5::bigint[],$6::bigint[]) AS v(t,ch,c,f,ms,mx) ON CONFLICT(tenant,channel) DO UPDATE SET calls=channel_metrics.calls+EXCLUDED.calls,failures=channel_metrics.failures+EXCLUDED.failures,timed_calls=channel_metrics.timed_calls+EXCLUDED.timed_calls,total_ms=channel_metrics.total_ms+EXCLUDED.total_ms,max_ms=greatest(channel_metrics.max_ms,EXCLUDED.max_ms),last_seen=now()")
            .bind(tenants).bind(channels).bind(calls).bind(failures).bind(total_ms).bind(max_ms).execute(db);
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
            metrics.record(format!("tenant-{i}"), "storefront", false, 3);
        }
        metrics.record("tenant-0".into(), "storefront", true, 7);
        let pending = metrics.pending.lock().unwrap();
        assert_eq!(pending.len(), MAX_KEYS);
        let counter = &pending[&("tenant-0".into(), "storefront")];
        assert_eq!(
            (
                counter.calls,
                counter.failures,
                counter.total_ms,
                counter.max_ms
            ),
            (2, 1, 10, 7)
        );
    }
}
