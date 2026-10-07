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
    let db = performance::pool_options()
        .connect(&env::var("DATABASE_RUNTIME_URL").unwrap_or(database_url.clone()))
        .await
        .expect("commerce connection");
    performance::verify_row_security(&db).await;
    migrations::ready(&db).await;
    // Personal-only hosting has no shared bootstrap credential. Legacy development mode still requires one.
    let auth = if env::var("ALLOW_BOOTSTRAP_AUTH").as_deref() == Ok("false") {
        String::new()
    } else {
        let token = env::var("MERCHANT_TOKEN").expect("MERCHANT_TOKEN required");
        assert!(
            token.len() >= 24,
            "MERCHANT_TOKEN must have at least 24 characters"
        );
        token
    };
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .unwrap();
    let a = App {
        db: db.clone(),
        inference_slots: Arc::new(tokio::sync::Semaphore::new(4)),
        token: Arc::new(auth),
        inference: Inference::from_env(http.clone()).with_database(db.clone()),
        http,
        model: Arc::new(env::var("OLLAMA_MODEL").unwrap_or("qwen3.6:35b".into())),
        sandboxes: Arc::new(RwLock::new(HashMap::new())),
        channel_metrics: Arc::new(channel_metrics::ChannelMetrics::default()),
        app_limits: Arc::new(apps::ServiceLimits::default()),
        reads: Arc::new(performance::Reads::default()),
        admission: Arc::new(performance::Admission::default()),
    };
    if let Some(setup) = setup {
        if env::var("SEED_DEMO").as_deref() != Ok("false") {
            migrations::seed_demo(&a, &setup).await;
            demo_catalog::seed_builtin(&a)
                .await
                .expect("fashion demo seed");
        }
        setup.close().await;
    }
    let seeded: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM public.commerce_migrations WHERE version='demo-v1')",
    )
    .fetch_one(&a.db)
    .await
    .expect("completed setup");
    assert!(
        seeded || env::var("SEED_DEMO").as_deref() == Ok("false"),
        "Setup is incomplete: run BOOTSTRAP_MODE=migrate"
    );
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
        currencies::worker(&a);
        performance::start_invalidations(&a);
        if env::var("PROCESS_ROLE").unwrap_or("all".into()) == "all"
            || env::var("PROCESS_ROLE").as_deref() == Ok("memory-worker")
        {
            knowledge::vectors::start(a.db.clone());
        }
    }
    a
}

pub(crate) async fn run() {
    if env::var("BOOTSTRAP_MODE").is_ok_and(|s| s == "migrate") {
        let database_url = env::var("DATABASE_URL").expect("DATABASE_URL required");
        let db = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await
            .expect("PostgreSQL migration connection");
        migrations::apply(&db).await;
        migrations::ready(&db).await;
        db.close().await;
        println!("Migration-only setup complete");
        return;
    }
    let a = bootstrap().await;
    if env::var("PROCESS_ROLE").is_ok_and(|s| s.ends_with("-worker")) {
        shutdown().await;
        return;
    }
    let app = router(a.clone());
    let addr = env::var("BIND_ADDR").unwrap_or("127.0.0.1:8787".into());
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    println!("vendune listening on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            shutdown().await;
        })
        .await
        .unwrap();
    a.channel_metrics.flush(&a.db).await;
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("termination signal");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

pub(crate) fn entry() {
    if env::args().nth(1).as_deref() == Some("--extract-pdf") {
        documents::extract_pdf();
        return;
    }
    if env::args().nth(1).as_deref() == Some("--bootstrap-operator") {
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(platform::bootstrap_operator());
        return;
    }
    tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(vendune::tenant_scope::scoped(
            vendune::tenant_scope::Scope::System,
            run(),
        ));
}
