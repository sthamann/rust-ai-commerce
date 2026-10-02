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
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .unwrap();
    let a = App {
        db,
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
        a.sandboxes
            .write()
            .unwrap()
            .insert(t, Arc::new(Sandbox::new(&wat).expect("saved extension")));
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
    for tenant in &tenants {
        let t = tenant.get::<String, _>("id");
        for p in products(&a, &t).await.unwrap() {
            knowledge::sync_product(
                &mut a.db.acquire().await.unwrap(),
                &t,
                &serde_json::to_value(p).unwrap(),
            )
            .await
            .expect("graph product");
        }
        knowledge::seed_relations(&a.db, &t)
            .await
            .expect("graph relations");
    }
    bootstrap.close().await;
    let worker = a.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(250));
        loop {
            interval.tick().await;
            if let Err(e) = consume_once(&worker).await {
                eprintln!("outbox consumer: {}", e.1);
            }
        }
    });
    a
}
