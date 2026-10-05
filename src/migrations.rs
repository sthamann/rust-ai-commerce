//! Versioned setup is separate from serving; no catalog-wide startup repair.
use crate::*;

const SCHEMA: &[(&str, &str)] = &[
    // International translation jobs are additive and independent of earlier domain schemas.
    // Product/category management is append-only; earlier migration hashes stay intact.
    // Append-only entries are applied in dependency order below.
    ("001", include_str!("../migrations/001.sql")),
    ("002", include_str!("../migrations/002.sql")),
    ("004-context", include_str!("../migrations/004-context.sql")),
    (
        "006-commerce",
        include_str!("../migrations/006-commerce.sql"),
    ),
    (
        "008-workspaces",
        include_str!("../migrations/008-workspaces.sql"),
    ),
    (
        "010-apps-intelligence-payments",
        include_str!("../migrations/010-apps-intelligence-payments.sql"),
    ),
    (
        "011-documents",
        include_str!("../migrations/011-documents.sql"),
    ),
    (
        "012-checkout-handoff",
        include_str!("../migrations/012-checkout-handoff.sql"),
    ),
    (
        "014-bounded-catalog",
        include_str!("../migrations/014-bounded-catalog.sql"),
    ),
    (
        "013-staging-developer",
        include_str!("../migrations/013-staging-developer.sql"),
    ),
    (
        "014-customer-accounts",
        include_str!("../migrations/014-customer-accounts.sql"),
    ),
    (
        "015-rules-flows-channels",
        include_str!("../migrations/015-rules-flows-channels.sql"),
    ),
    (
        "016-merchant-operations",
        include_str!("../migrations/016-merchant-operations.sql"),
    ),
    (
        "017-integration-access",
        include_str!("../migrations/017-integration-access.sql"),
    ),
    (
        "018-order-state-machine",
        include_str!("../migrations/018-order-state-machine.sql"),
    ),
    (
        "019-workflow-schema",
        include_str!("../migrations/019-workflow-schema.sql"),
    ),
    (
        "020-customer-addresses",
        include_str!("../migrations/020-customer-addresses.sql"),
    ),
    (
        "021-demo-addresses",
        include_str!("../migrations/021-demo-addresses.sql"),
    ),
    (
        "022-app-evidence",
        include_str!("../migrations/022-app-evidence.sql"),
    ),
    (
        "023-app-poll-scheduling",
        include_str!("../migrations/023-app-poll-scheduling.sql"),
    ),
    (
        "024-platform",
        include_str!("../migrations/024-platform.sql"),
    ),
    (
        "025-automation-pipelines",
        include_str!("../migrations/025-automation-pipelines.sql"),
    ),
    (
        "026-product-catalog",
        include_str!("../migrations/026-product-catalog.sql"),
    ),
    (
        "027-product-search",
        include_str!("../migrations/027-product-search.sql"),
    ),
    (
        "028-translations",
        include_str!("../migrations/028-translations.sql"),
    ),
    (
        "029-developer-trash",
        include_str!("../migrations/029-developer-trash.sql"),
    ),
    (
        "030-company-settings",
        include_str!("../migrations/030-company-settings.sql"),
    ),
];

pub(crate) async fn apply(pool: &PgPool) {
    // The dedicated setup pool has exactly one connection, retaining this
    // session lock through schema setup and the bounded demo seed.
    sqlx::query("SELECT pg_advisory_lock(7193511)")
        .execute(pool)
        .await
        .expect("migration lock");
    sqlx::query("CREATE TABLE IF NOT EXISTS public.commerce_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())").execute(pool).await.expect("migration ledger");
    for (version, source) in SCHEMA {
        let checksum = hash(source);
        let applied: Option<String> =
            sqlx::query_scalar("SELECT checksum FROM public.commerce_migrations WHERE version=$1")
                .bind(version)
                .fetch_optional(pool)
                .await
                .expect("migration status");
        if let Some(applied) = applied {
            assert_eq!(applied, checksum, "Applied migration changed: {version}");
            continue;
        }
        let mut tx = pool.begin().await.expect("migration transaction");
        sqlx::query("SET LOCAL search_path=public")
            .execute(&mut *tx)
            .await
            .expect("explicit migration schema");
        sqlx::raw_sql(*source)
            .execute(&mut *tx)
            .await
            .unwrap_or_else(|e| panic!("Migration {version}: {e}"));
        sqlx::query("INSERT INTO public.commerce_migrations(version,checksum) VALUES($1,$2)")
            .bind(version)
            .bind(checksum)
            .execute(&mut *tx)
            .await
            .expect("record migration");
        tx.commit().await.expect("commit migration");
    }
}

pub(crate) async fn seed_demo(a: &App, setup: &PgPool) {
    let ready: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM public.commerce_migrations WHERE version='demo-v1')",
    )
    .fetch_one(setup)
    .await
    .expect("demo seed status");
    if ready {
        return;
    }
    seed(a).await.expect("demo seed");
    for source in [
        include_str!("../migrations/003-seed.sql"),
        include_str!("../migrations/005-context-seed.sql"),
        include_str!("../migrations/007-commerce-seed.sql"),
        include_str!("../migrations/009-variant-properties.sql"),
    ] {
        sqlx::raw_sql(source)
            .execute(&a.db)
            .await
            .expect("demo metadata");
    }
    let ids = ["chair", "desk", "lamp", "mug", "notebook", "shelf"];
    for t in ["atelier", "workshop"] {
        let default = include_str!("../extensions/company-limit.wat");
        sqlx::query(
            "INSERT INTO extensions(tenant,wat,digest) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        )
        .bind(t)
        .bind(default)
        .bind(hash(default))
        .execute(&a.db)
        .await
        .expect("default extension");
        let rows = sqlx::query(
            "SELECT * FROM products WHERE tenant=$1 AND id=ANY($2) AND parent_id IS NULL",
        )
        .bind(t)
        .bind(ids.as_slice())
        .fetch_all(&a.db)
        .await
        .expect("bounded demo products");
        for row in rows {
            knowledge::sync_product(&mut a.db.acquire().await.unwrap(), t, &json!(product(&row)))
                .await
                .expect("demo graph product");
        }
        knowledge::seed_relations(&a.db, t)
            .await
            .expect("demo graph relations");
    }
    sqlx::query("INSERT INTO public.commerce_migrations(version,checksum) VALUES('demo-v1','bounded-built-in-fixtures')")
        .execute(setup).await.expect("record completed seed");
}

/// Every required schema must match, including domain schemas introduced after bounded reads.
pub(crate) async fn ready(db: &PgPool) {
    for (version, source) in SCHEMA {
        let current: Option<String> =
            sqlx::query_scalar("SELECT checksum FROM public.commerce_migrations WHERE version=$1")
                .bind(version)
                .fetch_optional(db)
                .await
                .expect("Run BOOTSTRAP_MODE=migrate before serving");
        assert_eq!(
            current.as_deref(),
            Some(hash(source).as_str()),
            "Schema not ready: {version}; run BOOTSTRAP_MODE=migrate"
        );
    }
}
