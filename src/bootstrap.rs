//! Startup, additive migrations, persisted extensions and outbox worker.
use crate::*;

pub(crate) async fn bootstrap() -> App {
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or("info".into()))
        .init();
    let bootstrap = PgPoolOptions::new()
        .max_connections(1)
        .connect(&env::var("DATABASE_URL").expect("DATABASE_URL required"))
        .await
        .expect("PostgreSQL connection");
    sqlx::query("SELECT pg_advisory_lock(7193511)")
        .execute(&bootstrap)
        .await
        .expect("migration lock");
    sqlx::raw_sql(include_str!("../migrations/001.sql"))
        .execute(&bootstrap)
        .await
        .expect("schema");
    sqlx::raw_sql(include_str!("../migrations/002.sql"))
        .execute(&bootstrap)
        .await
        .expect("open graph/vector schema");
    sqlx::raw_sql(include_str!("../migrations/004-context.sql"))
        .execute(&bootstrap)
        .await
        .expect("context schema");
    sqlx::raw_sql(include_str!("../migrations/006-commerce.sql"))
        .execute(&bootstrap)
        .await
        .expect("commerce schema");
    sqlx::raw_sql(include_str!("../migrations/008-workspaces.sql"))
        .execute(&bootstrap)
        .await
        .expect("workspace schema");
    sqlx::raw_sql(include_str!(
        "../migrations/010-apps-intelligence-payments.sql"
    ))
    .execute(&bootstrap)
    .await
    .expect("app/payment/memory schema");
    sqlx::raw_sql(include_str!("../migrations/011-documents.sql"))
        .execute(&bootstrap)
        .await
        .expect("document knowledge schema");
    sqlx::raw_sql(include_str!("../migrations/012-checkout-handoff.sql"))
        .execute(&bootstrap)
        .await
        .expect("checkout handoff schema");
    sqlx::raw_sql(include_str!("../migrations/013-staging-developer.sql"))
        .execute(&bootstrap)
        .await
        .expect("staging/developer schema");
    sqlx::raw_sql(include_str!("../migrations/014-customer-accounts.sql"))
        .execute(&bootstrap)
        .await
        .expect("customer accounts schema");
    sqlx::raw_sql(include_str!("../migrations/015-rules-flows-channels.sql"))
        .execute(&bootstrap)
        .await
        .expect("rules/flows/channels schema");
    let db = PgPoolOptions::new()
        .max_connections(20)
        .after_connect(|conn, _| {
            Box::pin(async move {
                sqlx::raw_sql("LOAD 'age'; SET search_path = ag_catalog, public")
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
        .connect(&env::var("DATABASE_URL").unwrap())
        .await
        .expect("graph connection");
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
    };
    let tenants = sqlx::query("SELECT id FROM tenants ORDER BY id")
        .fetch_all(&a.db)
        .await
        .unwrap();
    let mut compiled = HashMap::new();
    for tenant in &tenants {
        let t = tenant.get::<String, _>("id");
        // Built-in tenants need the same persisted, lockable policy as newly registered shops.
        // ON CONFLICT preserves an existing merchant policy and its revision.
        let default = include_str!("../extensions/company-limit.wat");
        sqlx::query(
            "INSERT INTO extensions(tenant,wat,digest) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        )
        .bind(&t)
        .bind(default)
        .bind(hash(default))
        .execute(&a.db)
        .await
        .expect("default extension");
        let wat: String = sqlx::query_scalar("SELECT wat FROM extensions WHERE tenant=$1")
            .bind(&t)
            .fetch_one(&a.db)
            .await
            .expect("persisted extension");
        let sandbox = compiled
            .entry(hash(&wat))
            .or_insert_with(|| Arc::new(Sandbox::new(&wat).expect("saved extension")))
            .clone();
        a.sandboxes.write().unwrap().insert(t, sandbox);
    }
    seed(&a).await.expect("seed");
    sqlx::raw_sql(include_str!("../migrations/003-seed.sql"))
        .execute(&a.db)
        .await
        .expect("price metadata seed");
    sqlx::raw_sql(include_str!("../migrations/005-context-seed.sql"))
        .execute(&a.db)
        .await
        .expect("context seed");
    sqlx::raw_sql(include_str!("../migrations/007-commerce-seed.sql"))
        .execute(&a.db)
        .await
        .expect("commerce seed");
    sqlx::raw_sql(include_str!("../migrations/009-variant-properties.sql"))
        .execute(&a.db)
        .await
        .expect("variant properties");
    // Provisioning and mutation transactions maintain every other tenant's graph.
    // Replicas must not scan/rewrite the complete multi-shop catalog on startup.
    for t in ["atelier", "workshop"] {
        for p in products(&a, t).await.unwrap() {
            knowledge::sync_product(
                &mut a.db.acquire().await.unwrap(),
                t,
                &serde_json::to_value(p).unwrap(),
            )
            .await
            .expect("graph product");
        }
        knowledge::seed_relations(&a.db, t)
            .await
            .expect("graph relations");
    }
    bootstrap.close().await;
    workers::start(&a);
    a
}
