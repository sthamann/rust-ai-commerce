//! Explicit per-process database budgets and bounded queue waits; invalid deployment values fail fast.
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;
pub(crate) fn pool_options() -> PgPoolOptions {
    let config = crate::runtime_config::get();
    let options = PgPoolOptions::new()
        .max_connections(config.db_pool_max)
        .min_connections(config.db_pool_min)
        .acquire_timeout(Duration::from_millis(config.db_wait_ms.into()))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(1800));
    if config.transaction_pooling {
        return options;
    }
    options
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
    // Do not issue a second reset query on return. Every checkout, including unscoped
    // tasks, MUST rebind before use; failed/cancelled acquire discards the connection.
}
