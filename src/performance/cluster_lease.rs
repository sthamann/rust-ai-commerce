//! Cluster-wide tenant resource leases. DB serialization protects admission; cancellation releases the fenced lease.
use crate::{App, Error, Result, StatusCode, uid};
pub(crate) struct Lease {
    db: vendune::scoped_pool::ScopedPool,
    id: String,
    heartbeat: Option<tokio::task::JoinHandle<()>>,
}
impl Lease {
    pub(crate) async fn acquire(a: &App, tenant: &str, class: &str, limit: usize) -> Result<Self> {
        Self::weighted(&a.db, tenant, class, limit, 1).await
    }
    async fn weighted(
        db: &vendune::scoped_pool::ScopedPool,
        tenant: &str,
        class: &str,
        limit: usize,
        slots: i32,
    ) -> Result<Self> {
        vendune::tenant_scope::scoped(vendune::tenant_scope::Scope::System, async {
            let id = uid();
            let inserted: bool = sqlx::query_scalar("SELECT claim_resource_lease($1,$2,$3,$4,$5)")
                .bind(&id)
                .bind(tenant)
                .bind(class)
                .bind(limit as i64)
                .bind(slots)
                .fetch_one(db)
                .await?;
            if !inserted {
                return Err(Error(
                    StatusCode::TOO_MANY_REQUESTS,
                    "Workspace concurrency limit reached across service replicas; retry shortly"
                        .into(),
                ));
            }
            Ok(Self {
                db: db.clone(),
                id,
                heartbeat: None,
            })
        })
        .await
    }
    pub(crate) async fn connection_budget(db: &vendune::scoped_pool::ScopedPool) -> Result<Self> {
        let config = crate::runtime_config::get();
        let mut lease = Self::weighted(
            db,
            "__runtime",
            "db-connections",
            config.db_connection_budget as usize,
            (config.db_pool_max + 2) as i32,
        )
        .await?;
        let pool = db.clone();
        let id = lease.id.clone();
        lease.heartbeat = Some(vendune::tenant_scope::spawn(async move {
            let mut timer = tokio::time::interval(std::time::Duration::from_secs(60));
            loop {
                timer.tick().await;
                let result = sqlx::query("UPDATE resource_leases SET expires_at=now()+interval '310 seconds' WHERE id=$1 AND expires_at>now()")
                    .bind(&id).execute(&pool).await;
                if result.is_err() || result.is_ok_and(|r| r.rows_affected() != 1) {
                    eprintln!(
                        "Database connection budget lease lost; stopping instead of exceeding cluster capacity"
                    );
                    std::process::exit(1);
                }
            }
        }));
        Ok(lease)
    }

    /// Await release before the Tokio runtime exits; background tasks still hold App clones.
    pub(crate) async fn release(&self) {
        if let Some(heartbeat) = &self.heartbeat {
            heartbeat.abort();
        }
        vendune::tenant_scope::scoped(vendune::tenant_scope::Scope::System, async {
            if let Err(error) = sqlx::query("DELETE FROM resource_leases WHERE id=$1")
                .bind(&self.id)
                .execute(&self.db)
                .await
            {
                eprintln!("Connection lease release failed; expiry will recover it: {error}");
            }
        })
        .await;
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        if let Some(heartbeat) = self.heartbeat.take() {
            heartbeat.abort();
        }
        let db = self.db.clone();
        let id = self.id.clone();
        // Only this UUID is released. Expiry recovers a killed process; it cannot remove a replacement lease.
        tokio::spawn(vendune::tenant_scope::scoped(
            vendune::tenant_scope::Scope::System,
            async move {
                let _ = sqlx::query("DELETE FROM resource_leases WHERE id=$1")
                    .bind(id)
                    .execute(&db)
                    .await;
            },
        ));
    }
}
