//! Versioned setup is separate from serving; no catalog-wide startup repair.
use crate::*;

mod schema;
use schema::SCHEMA;

pub(crate) async fn apply(pool: &PgPool) {
    sqlx::query("SELECT set_config('rac.system','on',false)")
        .execute(pool)
        .await
        .expect("trusted migration context");
    // The dedicated setup pool has exactly one connection, retaining this
    // session lock through schema setup and the bounded demo seed.
    sqlx::query("SELECT pg_advisory_lock(7193511)")
        .execute(pool)
        .await
        .expect("migration lock");
    sqlx::query("CREATE TABLE IF NOT EXISTS public.commerce_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())").execute(pool).await.expect("migration ledger");
    // Historical AGE databases keep their original checksum contract; fresh installs use managed variants.
    for (version, source) in [
        ("002", include_str!("../migrations/002.sql")),
        (
            "011-documents",
            include_str!("../migrations/011-documents.sql"),
        ),
    ] {
        let applied: Option<String> =
            sqlx::query_scalar("SELECT checksum FROM public.commerce_migrations WHERE version=$1")
                .bind(version)
                .fetch_optional(pool)
                .await
                .expect("legacy migration ledger");
        if let Some(applied) = applied {
            assert_eq!(applied, hash(source), "Legacy migration drift: {version}");
        }
    }
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
        if *version == "055-hosted-apps" {
            apps::hosted::backfill(&mut tx)
                .await
                .expect("hosted app migration");
        }
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
    for t in ["atelier", "workshop"] {
        sqlx::query(
            "INSERT INTO commerce_settings(tenant,data) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(t)
        .bind(
            serde_json::from_str::<Value>(include_str!("../fixtures/demo-settings.json")).unwrap(),
        )
        .execute(&a.db)
        .await
        .expect("demo settings basis");
        sqlx::query("SELECT public.seed_shop_automation($1)")
            .bind(t)
            .execute(&a.db)
            .await
            .expect("demo channel before customer creation");
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
