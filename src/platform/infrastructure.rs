//! Live control-plane telemetry: database probes and pool/cache diagnostics, explicit process-only scope.
use super::*;
pub(super) async fn snapshot(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    auth::actor(&h)?;
    let start = std::time::Instant::now();
    let database=sqlx::query("SELECT pg_database_size(current_database()) AS bytes,version() AS version,(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active') AS active_connections,(SELECT sum(xact_commit)::text FROM pg_stat_database WHERE datname=current_database()) AS commits").fetch_one(&a.db).await?;
    let elapsed = start.elapsed().as_millis();
    let traffic = crate::channel_metrics::traffic(&a.db, None, false).await?;
    let queues =
        sqlx::query("SELECT count(*) FILTER(WHERE delivered_at IS NULL) AS pending FROM outbox")
            .fetch_one(&a.db)
            .await?;
    let qdrant_start = std::time::Instant::now();
    let mut qdrant_request = a
        .http
        .get(format!(
            "{}/healthz",
            env::var("QDRANT_URL")
                .unwrap_or("http://127.0.0.1:6333".into())
                .trim_end_matches('/')
        ))
        .timeout(std::time::Duration::from_secs(2));
    if let Ok(key) = env::var("QDRANT_API_KEY") {
        qdrant_request = qdrant_request.header("api-key", key);
    }
    let qdrant = qdrant_request.send().await;
    Ok(Json(
        json!({"generatedAt":chrono::Utc::now().to_rfc3339(),"database":{"healthy":true,"probeMs":elapsed,"bytes":database.get::<i64,_>("bytes"),"version":database.get::<String,_>("version"),"activeConnections":database.get::<i64,_>("active_connections"),"commits":database.get::<Option<String>,_>("commits")},
        "resources":super::resources::snapshot().await,"process":{"poolConnections":a.db.size(),"poolIdle":a.db.num_idle(),"readCache":a.reads.snapshot(),"admission":a.admission.snapshot(),"rowSecurity":{"strictRuntime":env::var("DB_RLS_REQUIRED").as_deref()==Ok("true"),"runtimeCredentialSeparated":env::var("DATABASE_RUNTIME_URL").is_ok()}},
        "qdrant":{"healthy":qdrant.is_ok_and(|r|r.status().is_success()),"probeMs":qdrant_start.elapsed().as_millis()},
        "pendingEvents":queues.get::<i64,_>("pending"),"channels":traffic,
        "scope":"pool/cache are this process; HTTP counters are persisted fleet diagnostics, not visitors; CPU/RAM are optional Linux container readings; percentiles unavailable"}),
    ))
}
