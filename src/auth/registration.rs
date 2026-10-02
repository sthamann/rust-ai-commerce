//! Create an isolated merchant workspace from synthetic template data.
//! Registration cannot claim existing tenants or assign a global administrator.
use super::*;
pub(crate) async fn register_user(
    State(a): State<App>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let email = email(&v)?;
    let name = name(&v)?;
    let password = hash_password(password(&v)?).await?;
    let slug = v["workspaceId"]
        .as_str()
        .ok_or(bad("Workspace ID required"))?;
    validate_tenant(slug)?;
    let shop_name = v["workspaceName"].as_str().unwrap_or(slug).trim();
    if shop_name.is_empty() || shop_name.len() > 100 {
        return Err(bad("Workspace name must contain 1..100 characters"));
    }
    let demo_password = hash_password("demo-business".into()).await?;
    let user = uid();
    let mut tx = a.db.begin().await?;
    let changed=sqlx::query("INSERT INTO merchant_users(id,email,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING").bind(&user).bind(email).bind(name).bind(password).execute(&mut *tx).await?;
    if changed.rows_affected() == 0 {
        return Err(conflict("Email already registered; sign in instead"));
    }
    let sandbox =
        super::provision::provision(&mut tx, &user, slug, shop_name, demo_password).await?;
    tx.commit().await?;
    a.sandboxes
        .write()
        .unwrap()
        .insert(slug.into(), Arc::new(sandbox));
    for p in prototype_products(&a, slug).await? {
        knowledge::sync_product(&mut *a.db.acquire().await?, slug, &json!(p)).await?;
    }
    knowledge::seed_relations(&a.db, slug).await?;
    Ok(Json(issue_session(&a, &user, slug).await?))
}
