//! Commit-only outbox notifications eagerly evict replica caches; authoritative version probes survive missed events.
use crate::*;
use sqlx::postgres::PgListener;
pub(crate) fn start(a: &App) {
    let a = a.clone();
    vendune::tenant_scope::spawn(async move {
        let url = &runtime_config::get().listener_url;
        loop {
            a.reads.clear();
            let connected = PgListener::connect(url).await;
            if let Ok(mut listener) = connected
                && listener.listen("vendune_read_invalidation").await.is_ok()
            {
                while let Ok(Some(event)) = listener.try_recv().await {
                    if let Ok(v) = serde_json::from_str::<Value>(event.payload())
                        && let Some(t) = v["tenant"].as_str()
                    {
                        a.reads.invalidate(t);
                    } else {
                        a.reads.clear();
                    }
                }
            }
            // Restart clears decoded entries. No stale time window: every normal hit still probes SQL versions.
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    });
}
