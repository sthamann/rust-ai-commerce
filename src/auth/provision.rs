//! Reusable synthetic shop provisioning for initial signup and additional shops owned by the same merchant.
use super::*;
pub(super) async fn provision(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user: &str,
    slug: &str,
    shop_name: &str,
    demo_password: String,
) -> Result<Sandbox> {
    provision_shop(
        tx,
        user,
        slug,
        shop_name,
        demo_password,
        true,
        env::var("SEED_DEMO").as_deref() != Ok("false"),
    )
    .await
}
pub(crate) async fn provision_shop(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user: &str,
    slug: &str,
    shop_name: &str,
    demo_password: String,
    seed_catalog: bool,
    demo_customer: bool,
) -> Result<Sandbox> {
    if ["app", "www", "api", "admin", "mail", "platform"].contains(&slug) {
        return Err(bad("Reserved shop ID"));
    }
    if sqlx::query("INSERT INTO tenants(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING")
        .bind(slug)
        .bind(shop_name)
        .execute(&mut **tx)
        .await?
        .rows_affected()
        == 0
    {
        return Err(conflict("Workspace ID already exists"));
    }
    sqlx::query("INSERT INTO memberships(user_id,tenant,role) VALUES($1,$2,'owner')")
        .bind(user)
        .bind(slug)
        .execute(&mut **tx)
        .await?;
    if seed_catalog {
        demo_catalog::insert(tx, slug).await?;
    }
    let settings: Value =
        serde_json::from_str(include_str!("../../fixtures/demo-settings.json")).unwrap();
    sqlx::query("INSERT INTO commerce_settings(tenant,data) VALUES($1,$2)")
        .bind(slug)
        .bind(settings)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO experiences(tenant,data) VALUES($1,$2)")
        .bind(slug)
        .bind(json!({"mode":"balanced","headline":"A considered wardrobe. Made for everyday."}))
        .execute(&mut **tx)
        .await?;
    for variant in ["discovery", "comparison"] {
        sqlx::query("INSERT INTO policy(tenant,variant) VALUES($1,$2)")
            .bind(slug)
            .bind(variant)
            .execute(&mut **tx)
            .await?;
    }
    sqlx::query("SELECT public.seed_shop_automation($1)")
        .bind(slug)
        .execute(&mut **tx)
        .await?;
    if demo_customer {
        sqlx::query("INSERT INTO customers(tenant,email,password_hash,company,group_name) VALUES($1,'buyer@example.test',$2,'Example Studio','business')").bind(slug).bind(demo_password).execute(&mut **tx).await?;
        accounts::seed_demo_address(tx, slug).await?;
    }
    let wat = include_str!("../../extensions/company-limit.wat");
    let sandbox = Sandbox::new(wat).map_err(bad)?;
    sqlx::query("INSERT INTO extensions(tenant,wat,digest) VALUES($1,$2,$3)")
        .bind(slug)
        .bind(wat)
        .bind(hash(wat))
        .execute(&mut **tx)
        .await?;
    categories::seed(tx, slug).await?;
    if seed_catalog {
        demo_catalog::categories(tx, slug).await?;
    }
    Ok(sandbox)
}
pub(crate) async fn create_workspace(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "read")?;
    let user = header(&h, "x-rac-user")
        .filter(|u| *u != "bootstrap")
        .ok_or(bad("Use a personal merchant account"))?;
    let slug = v["workspaceId"]
        .as_str()
        .ok_or(bad("Workspace ID required"))?;
    validate_tenant(slug)?;
    let name = v["workspaceName"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 100)
        .ok_or(bad("Workspace name required"))?;
    let demo = hash_password("demo-business".into()).await?;
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,19))")
        .bind(user)
        .execute(&mut *tx)
        .await?;
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM memberships WHERE user_id=$1 AND role='owner' AND active",
    )
    .bind(user)
    .fetch_one(&mut *tx)
    .await?;
    if count >= 20 {
        return Err(bad("Maximum 20 owned shops per account"));
    }
    let sandbox = provision(&mut tx, user, slug, name, demo).await?;
    tx.commit().await?;
    a.sandboxes
        .write()
        .unwrap()
        .insert(slug.into(), Arc::new(sandbox));
    for p in prototype_products(&a, slug).await? {
        knowledge::sync_product(&mut *a.db.acquire().await?, slug, &json!(p)).await?;
    }
    knowledge::seed_relations(&a.db, slug).await?;
    Ok(Json(issue_session(&a, user, slug).await?))
}
