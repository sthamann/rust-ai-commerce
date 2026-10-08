//! Bounded retirement of duplicate delivered payloads; provenance IDs and unsettled app/flow work survive.
use crate::{App, Result};
pub(super) async fn once(a: &App) -> Result<()> {
    static LAST: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let last = LAST.load(std::sync::atomic::Ordering::Relaxed);
    if now.saturating_sub(last) < 60
        || LAST
            .compare_exchange(
                last,
                now,
                std::sync::atomic::Ordering::Relaxed,
                std::sync::atomic::Ordering::Relaxed,
            )
            .is_err()
    {
        return Ok(());
    }
    sqlx::query("DELETE FROM auth_attempt_buckets WHERE updated_at < now()-interval '1 day'")
        .execute(&a.db)
        .await?;
    let days = crate::runtime_config::get().outbox_retention_days;
    sqlx::query("WITH old AS (SELECT id FROM outbox e WHERE delivered_at < now()-$1*interval '1 day' AND payload_retired_at IS NULL AND NOT EXISTS(SELECT 1 FROM app_deliveries d WHERE d.event_id=e.id AND d.state NOT IN ('delivered','failed','cancelled')) AND NOT EXISTS(SELECT 1 FROM flow_jobs f WHERE f.event_id=e.id AND f.state NOT IN ('completed','failed','cancelled')) ORDER BY delivered_at,id LIMIT 100 FOR UPDATE SKIP LOCKED), retired AS (UPDATE outbox SET data=jsonb_build_object('retired',true),payload_retired_at=now() WHERE id IN(SELECT id FROM old) RETURNING id) DELETE FROM projections WHERE event_id IN(SELECT id FROM retired)")
        .bind(days as i32).execute(&a.db).await?;
    // Metadata can expire only when no commerce/knowledge/idempotency record still references it.
    // PostgreSQL foreign keys remain the final guard; never cascade away evidence or uncertain work.
    sqlx::query(include_str!("retention.sql"))
        .bind(crate::runtime_config::get().outbox_metadata_days as i32)
        .execute(&a.db)
        .await?;
    Ok(())
}
