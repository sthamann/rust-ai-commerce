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
    migrations::ready(&db).await;
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

pub(crate) async fn run() {
    let a = bootstrap().await;
    if env::var("BOOTSTRAP_MODE").is_ok_and(|s| s == "migrate") {
        return;
    }
    if env::var("PROCESS_ROLE").is_ok_and(|s| s.ends_with("-worker")) {
        let _ = tokio::signal::ctrl_c().await;
        return;
    }
    let app = router(a.clone());
    let addr = env::var("BIND_ADDR").unwrap_or("127.0.0.1:8787".into());
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("rust-ai-commerce listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .unwrap();
    a.channel_metrics.flush(&a.db).await;
}
