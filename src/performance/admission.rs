//! Bounded instance/tenant concurrency, durable UTC-day AI quotas, and low-cardinality latency telemetry.
use crate::*;
use axum::{extract::Request, middleware::Next};
use std::{
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Instant,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

struct Budget {
    slots: Arc<Semaphore>,
    ai: Arc<Semaphore>,
    touched: Instant,
}
#[derive(Default)]
struct Metric {
    calls: u64,
    failures: u64,
    total_ms: u64,
    buckets: [u64; 8],
}
pub(crate) struct Admission {
    general: Arc<Semaphore>,
    checkout: Arc<Semaphore>,
    tenants: Mutex<HashMap<String, Budget>>,
    metrics: Mutex<HashMap<&'static str, Metric>>,
    rejected: AtomicU64,
    tenant_limit: usize,
    ai_limit: usize,
    daily_ai: i64,
}
fn number(key: &str, default: usize, max: usize) -> usize {
    let n = env::var(key)
        .map(|v| v.parse::<usize>().expect("Invalid admission number"))
        .unwrap_or(default);
    assert!(n > 0 && n <= max, "Invalid {key}");
    n
}
impl Default for Admission {
    fn default() -> Self {
        Self {
            general: Arc::new(Semaphore::new(number("HTTP_CONCURRENCY", 128, 4096))),
            checkout: Arc::new(Semaphore::new(number("CHECKOUT_CONCURRENCY", 32, 1024))),
            tenants: Mutex::new(HashMap::new()),
            metrics: Mutex::new(HashMap::new()),
            rejected: AtomicU64::new(0),
            tenant_limit: number("TENANT_CONCURRENCY", 16, 1024),
            ai_limit: number("TENANT_AI_CONCURRENCY", 2, 64),
            daily_ai: number("TENANT_AI_DAILY_QUOTA", 1000, 1_000_000) as i64,
        }
    }
}
impl Admission {
    fn enter(&self, tenant: &str, class: &str) -> Option<Vec<OwnedSemaphorePermit>> {
        let mut tenants = self.tenants.lock().unwrap();
        if !tenants.contains_key(tenant) && tenants.len() >= 4096 {
            tenants.retain(|_, b| {
                b.touched.elapsed().as_secs() < 60
                    || b.slots.available_permits() != self.tenant_limit
            });
            if tenants.len() >= 4096 {
                return None;
            }
        }
        let budget = tenants.entry(tenant.into()).or_insert_with(|| Budget {
            slots: Arc::new(Semaphore::new(self.tenant_limit)),
            ai: Arc::new(Semaphore::new(self.ai_limit)),
            touched: Instant::now(),
        });
        budget.touched = Instant::now();
        // Checkout has a reserved process pool; one busy catalog tenant cannot exhaust it.
        let process = if class == "checkout" {
            &self.checkout
        } else {
            &self.general
        };
        let mut permits = vec![
            process.clone().try_acquire_owned().ok()?,
            budget.slots.clone().try_acquire_owned().ok()?,
        ];
        if class == "ai" {
            permits.push(budget.ai.clone().try_acquire_owned().ok()?);
        }
        Some(permits)
    }
    fn record(&self, class: &'static str, elapsed: u64, failed: bool) {
        let mut metrics = self.metrics.lock().unwrap();
        let m = metrics.entry(class).or_default();
        m.calls = m.calls.saturating_add(1);
        m.failures += u64::from(failed);
        m.total_ms = m.total_ms.saturating_add(elapsed);
        let bucket = [5, 20, 50, 100, 250, 1000, 5000]
            .iter()
            .position(|limit| elapsed <= *limit)
            .unwrap_or(7);
        m.buckets[bucket] += 1;
    }
    pub(crate) fn snapshot(&self) -> Value {
        let metrics = self.metrics.lock().unwrap();
        json!({"scope":"process","tenantLimit":self.tenant_limit,"tenantAiLimit":self.ai_limit,
            "dailyAiQuotaDefault":self.daily_ai,"dailyQuotaScope":"database / UTC day",
            "generalAvailable":self.general.available_permits(),"checkoutAvailable":self.checkout.available_permits(),
            "trackedTenants":self.tenants.lock().unwrap().len(),"rejected":self.rejected.load(Ordering::Relaxed),
            "latencyBucketUpperMs":[5,20,50,100,250,1000,5000,null],
            "classes":metrics.iter().map(|(name,m)|json!({"class":name,"calls":m.calls,"failures":m.failures,"totalMs":m.total_ms,"buckets":m.buckets})).collect::<Vec<_>>()})
    }
}
fn class(path: &str) -> &'static str {
    if path == "/api/concierge"
        || path == "/api/experience"
        || path.starts_with("/api/agent/") && ["/chat", "/plan"].iter().any(|s| path.ends_with(s))
        || path.ends_with("/ask")
        || path.ends_with("/questions")
    {
        "ai"
    } else if path.starts_with("/store-api/checkout/")
        || path.starts_with("/store-api/payments/")
        || path.starts_with("/ucp/")
    {
        "checkout"
    } else {
        "api"
    }
}
pub(crate) async fn run(a: &App, request: Request, next: Next) -> Response {
    let path = request.uri().path();
    if !(path.starts_with("/api/")
        || path.starts_with("/store-api/")
        || path == "/mcp"
        || path.starts_with("/ucp/"))
    {
        return next.run(request).await;
    }
    let class = class(path);
    let tenant = match tenant(request.headers()) {
        Ok(t) => t,
        Err(e) => return e.into_response(),
    };
    let Some(_permits) = a.admission.enter(&tenant, class) else {
        a.admission.rejected.fetch_add(1, Ordering::Relaxed);
        return overloaded("Resource concurrency limit reached");
    };
    if class == "ai" {
        // Quota is consumed before invoking a model. Failure still counts the admitted attempt;
        // no refunds on timeouts whose provider cost may be unknown. No model tokens stored here.
        let reserved = vendune::tenant_scope::scoped(vendune::tenant_scope::Scope::System,
            sqlx::query_scalar::<_, i64>("WITH scope AS (SELECT coalesce((SELECT live_tenant FROM shop_environments WHERE tenant=$1),$1) AS tenant) INSERT INTO tenant_ai_usage(tenant,day,attempts) SELECT tenant,(now() AT TIME ZONE 'UTC')::date,1 FROM scope ON CONFLICT(tenant,day) DO UPDATE SET attempts=tenant_ai_usage.attempts+1 WHERE tenant_ai_usage.attempts < coalesce((SELECT daily_ai FROM tenant_resource_limits WHERE tenant=tenant_ai_usage.tenant),$2) RETURNING attempts")
            .bind(&tenant).bind(a.admission.daily_ai).fetch_optional(&a.db)).await;
        match reserved {
            Ok(Some(_)) => {}
            Ok(None) => {
                a.admission.rejected.fetch_add(1, Ordering::Relaxed);
                return overloaded("Daily AI request quota reached");
            }
            Err(e) => return Error::from(e).into_response(),
        }
    }
    let start = Instant::now();
    let response = next.run(request).await;
    a.admission.record(
        class,
        start.elapsed().as_millis().min(u64::MAX as u128) as u64,
        response.status().is_server_error(),
    );
    response
}
fn overloaded(message: &str) -> Response {
    let mut response = Error(StatusCode::TOO_MANY_REQUESTS, message.into()).into_response();
    response
        .headers_mut()
        .insert("retry-after", "5".parse().unwrap());
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saturated_tenant_does_not_block_another_or_leak_cancelled_permits() {
        let a = Admission {
            tenant_limit: 1,
            ai_limit: 1,
            ..Admission::default()
        };
        let first = a.enter("one", "ai").unwrap();
        assert!(a.enter("one", "api").is_none());
        assert!(a.enter("two", "checkout").is_some());
        drop(first);
        assert!(a.enter("one", "ai").is_some());
    }
    #[test]
    fn latency_and_keys_have_bounded_cardinality() {
        let a = Admission::default();
        a.record("api", 25, false);
        a.record("api", 6000, true);
        assert_eq!(
            a.snapshot()["classes"][0]["buckets"],
            json!([0, 0, 1, 0, 0, 0, 0, 1])
        );
        assert_eq!(class("/store-api/checkout/order"), "checkout");
        assert_eq!(class("/api/agent/chat"), "ai");
        assert_eq!(class("/store-api/product/mug/questions"), "ai");
    }
}
