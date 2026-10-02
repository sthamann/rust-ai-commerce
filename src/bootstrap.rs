//! Startup, additive migrations, persisted extensions and outbox worker.
use crate::*;

pub(crate) async fn bootstrap() -> App {
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or("info".into()))
        .init();
    let mode = env::var("BOOTSTRAP_MODE").unwrap_or("auto".into());
    assert!(
        ["auto", "serve", "migrate"].contains(&mode.as_str()),
        "Unsupported BOOTSTRAP_MODE"
    );
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL required");
    let setup = if mode == "serve" {
        None
    } else {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await
            .expect("PostgreSQL setup connection");
        migrations::apply(&pool).await;
        Some(pool)
    };
    let db = PgPoolOptions::new()
        .max_connections(20)
        .after_connect(|conn, _| {
            Box::pin(async move {
                // Short, indexed OLTP reads spend more time compiling a JIT plan
                // than executing it. This setting is local to application sessions.
                sqlx::raw_sql("LOAD 'age'; SET search_path = ag_catalog, public; SET jit = off")
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
        .connect(&database_url)
        .await
        .expect("graph connection");
    let current: Option<String> = sqlx::query_scalar(
        "SELECT checksum FROM public.commerce_migrations WHERE version='014-bounded-catalog'",
    )
    .fetch_optional(&db)
    .await
    .expect("Run BOOTSTRAP_MODE=migrate before serving");
    assert_eq!(
        current.as_deref(),
        Some(hash(include_str!("../migrations/014-bounded-catalog.sql")).as_str()),
        "Schema not ready: run BOOTSTRAP_MODE=migrate"
    );
    let auth = env::var("MERCHANT_TOKEN").expect("MERCHANT_TOKEN required");
    assert!(
        auth.len() >= 24,
        "MERCHANT_TOKEN must have at least 24 characters"
    );
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .unwrap();
    let a = App {
        db,
        inference_slots: Arc::new(tokio::sync::Semaphore::new(4)),
        token: Arc::new(auth),
        inference: Inference::from_env(http.clone()),
        http,
        model: Arc::new(env::var("OLLAMA_MODEL").unwrap_or("qwen3.6:35b".into())),
        ollama: Arc::new(env::var("OLLAMA_URL").unwrap_or("http://127.0.0.1:11434".into())),
        sandboxes: Arc::new(RwLock::new(HashMap::new())),
        channel_metrics: Arc::new(channel_metrics::ChannelMetrics::default()),
    };
    if let Some(setup) = setup {
        migrations::seed_demo(&a, &setup).await;
        setup.close().await;
    }
    let seeded: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM public.commerce_migrations WHERE version='demo-v1')",
    )
    .fetch_one(&a.db)
    .await
    .expect("completed setup");
    assert!(seeded, "Setup is incomplete: run BOOTSTRAP_MODE=migrate");
    // Only the two built-in demo policies are eager. Other tenant policies are
    // validated lazily against their persisted source in the existing checkout path.
    for t in ["atelier", "workshop"] {
        if let Some(wat) =
            sqlx::query_scalar::<_, String>("SELECT wat FROM extensions WHERE tenant=$1")
                .bind(t)
                .fetch_optional(&a.db)
                .await
                .expect("persisted extension")
        {
            a.sandboxes.write().unwrap().insert(
                t.into(),
                Arc::new(Sandbox::new(&wat).expect("saved extension")),
            );
        }
    }
    if mode != "migrate" {
        workers::start(&a);
    }
    a
}
