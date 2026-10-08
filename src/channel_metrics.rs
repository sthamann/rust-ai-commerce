//! Bounded, lossy diagnostic counters. Never use this buffer for business events.
use crate::*;
use std::sync::Mutex;

mod reads;
pub(crate) use reads::traffic;

const MAX_KEYS: usize = 1024;

#[derive(Default)]
struct Counter {
    calls: i64,
    failures: i64,
    total_ms: i64,
    max_ms: i64,
    responses: std::collections::BTreeMap<u16, i64>,
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
        status: StatusCode,
        elapsed_ms: i64,
    ) {
        let mut pending = self.pending.lock().unwrap();
        let key = (tenant, channel);
        if pending.len() >= MAX_KEYS && !pending.contains_key(&key) {
            return;
        }
        let counter = pending.entry(key).or_default();
        counter.calls = counter.calls.saturating_add(1);
        counter.failures = counter.failures.saturating_add(i64::from(
            status.is_client_error() || status.is_server_error(),
        ));
        counter.total_ms = counter.total_ms.saturating_add(elapsed_ms);
        counter.max_ms = counter.max_ms.max(elapsed_ms);
        if status.is_client_error() || status.is_server_error() {
            let count = counter.responses.entry(status.as_u16()).or_default();
            *count = count.saturating_add(1);
        }
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
        let mut responses = Vec::with_capacity(counters.len());
        for ((tenant, channel), counter) in counters {
            tenants.push(tenant);
            channels.push(channel);
            calls.push(counter.calls);
            failures.push(counter.failures);
            total_ms.push(counter.total_ms);
            max_ms.push(counter.max_ms);
            responses.push(json!(counter.responses));
        }
        // One task and one bounded bulk write per interval; no task per request.
        let write = sqlx::query("INSERT INTO channel_metrics(tenant,channel,calls,failures,total_ms,max_ms,response_counts,timed_calls) SELECT *,c FROM unnest($1::text[],$2::text[],$3::bigint[],$4::bigint[],$5::bigint[],$6::bigint[],$7::jsonb[]) AS v(t,ch,c,f,ms,mx,r) ON CONFLICT(tenant,channel) DO UPDATE SET calls=channel_metrics.calls+EXCLUDED.calls,failures=channel_metrics.failures+EXCLUDED.failures,timed_calls=channel_metrics.timed_calls+EXCLUDED.timed_calls,total_ms=channel_metrics.total_ms+EXCLUDED.total_ms,max_ms=greatest(channel_metrics.max_ms,EXCLUDED.max_ms),response_counts=vendune_merge_http_counts(channel_metrics.response_counts,EXCLUDED.response_counts),last_seen=now()")
            .bind(tenants).bind(channels).bind(calls).bind(failures).bind(total_ms).bind(max_ms).bind(responses).execute(db);
        let _ = tokio::time::timeout(std::time::Duration::from_secs(1), write).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn response_codes_preserve_rejections_and_server_failures_separately() {
        let metrics = ChannelMetrics::default();
        for status in [200, 302, 401, 403, 404, 409, 422, 429, 500, 503, 403] {
            metrics.record(
                "fixture".into(),
                "mcp",
                StatusCode::from_u16(status).unwrap(),
                2,
            );
        }
        let pending = metrics.pending.lock().unwrap();
        let c = &pending[&("fixture".into(), "mcp")];
        assert_eq!((c.calls, c.failures), (11, 9));
        assert_eq!(c.responses.get(&403), Some(&2));
        assert!(!c.responses.contains_key(&200));
        assert_eq!(c.responses.values().sum::<i64>(), c.failures);
    }
    #[test]
    fn caps_distinct_keys_without_losing_existing_key_updates() {
        let metrics = ChannelMetrics::default();
        for i in 0..(MAX_KEYS + 100) {
            metrics.record(format!("tenant-{i}"), "storefront", StatusCode::OK, 3);
        }
        metrics.record("tenant-0".into(), "storefront", StatusCode::FORBIDDEN, 7);
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
