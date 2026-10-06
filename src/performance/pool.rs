//! Explicit per-process database budgets and bounded queue waits; invalid deployment values fail fast.
use crate::*;
use std::time::Duration;
fn number(key: &str, default: u32, min: u32, max: u32) -> u32 {
    let value = env::var(key)
        .map(|s| s.parse::<u32>().expect("Invalid database pool number"))
        .unwrap_or(default);
    assert!(
        (min..=max).contains(&value),
        "Invalid {key}: allowed {min}..{max}"
    );
    value
}
pub(crate) fn pool_options() -> PgPoolOptions {
    let max = number("DB_POOL_MAX", 20, 1, 256);
    let min = number("DB_POOL_MIN", 0, 0, max);
    let wait = number("DB_POOL_WAIT_MS", 5000, 100, 60000);
    PgPoolOptions::new()
        .max_connections(max)
        .min_connections(min)
        .acquire_timeout(Duration::from_millis(wait.into()))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800))
        .after_connect(|conn, _| {
            Box::pin(async move {
                sqlx::raw_sql("SET search_path = public; SET jit = off")
                    .execute(&mut *conn)
                    .await?;
                super::row_security::bind(conn).await?;
                Ok(())
            })
        })
        .before_acquire(|conn, _| {
            Box::pin(async move {
                super::row_security::bind(conn).await?;
                Ok(true)
            })
        })
        .after_release(|conn, _| {
            Box::pin(async move {
                sqlx::query(
                    "SELECT set_config('rac.tenant','',false),set_config('rac.system','off',false)",
                )
                .execute(conn)
                .await?;
                Ok(true)
            })
        })
}
