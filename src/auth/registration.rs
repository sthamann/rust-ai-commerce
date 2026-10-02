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
    if sqlx::query("INSERT INTO tenants(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING")
        .bind(slug)
        .bind(shop_name)
        .execute(&mut *tx)
        .await?
        .rows_affected()
        == 0
    {
        return Err(conflict("Workspace ID already exists"));
    }
    sqlx::query("INSERT INTO memberships(user_id,tenant,role) VALUES($1,$2,'owner')")
        .bind(&user)
        .bind(slug)
        .execute(&mut *tx)
        .await?;
    // Every relation, including variant stock, translations and rules, is copied under the NEW tenant.
    let template: Value =
        serde_json::from_str(include_str!("../../fixtures/demo-catalog.json")).unwrap();
    for p in template["products"].as_array().unwrap() {
        sqlx::query("INSERT INTO products(tenant,id,name,category,description,price,tax_rate,stock,revision,list_price,regulation_price,reference_price,advanced_prices,min_purchase,purchase_steps,max_purchase,parent_id,options,media,properties,delivery_days) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)").bind(slug).bind(p["id"].as_str()).bind(p["name"].as_str()).bind(p["category"].as_str()).bind(p["description"].as_str()).bind(p["price"].as_f64()).bind(p["tax_rate"].as_f64()).bind(p["stock"].as_i64().unwrap() as i32).bind(p["list_price"].as_f64()).bind(p["regulation_price"].as_f64()).bind(p["reference_price"].as_object().map(|_|p["reference_price"].clone())).bind(&p["advanced_prices"]).bind(p["min_purchase"].as_i64().unwrap() as i32).bind(p["purchase_steps"].as_i64().unwrap() as i32).bind(p["max_purchase"].as_i64().map(|v|v as i32)).bind(p["parent_id"].as_str()).bind(&p["options"]).bind(&p["media"]).bind(&p["properties"]).bind(p["delivery_days"].as_i64().unwrap() as i32).execute(&mut *tx).await?;
    }
    for tr in template["translations"].as_array().unwrap() {
        sqlx::query("INSERT INTO product_translations(tenant,product_id,language_id,name,description) VALUES($1,$2,$3,$4,$5)").bind(slug).bind(tr["product_id"].as_str()).bind(tr["language_id"].as_str()).bind(tr["name"].as_str()).bind(tr["description"].as_str()).execute(&mut *tx).await?;
    }
    let settings: Value =
        serde_json::from_str(include_str!("../../fixtures/demo-settings.json")).unwrap();
    sqlx::query("INSERT INTO commerce_settings(tenant,data) VALUES($1,$2)")
        .bind(slug)
        .bind(settings)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO experiences(tenant,data) VALUES($1,$2)")
        .bind(slug)
        .bind(json!({"mode":"balanced","headline":"Objects for a more considered everyday."}))
        .execute(&mut *tx)
        .await?;
    for variant in ["discovery", "comparison"] {
        sqlx::query("INSERT INTO policy(tenant,variant) VALUES($1,$2)")
            .bind(slug)
            .bind(variant)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("INSERT INTO customers(tenant,email,password_hash,company,group_name) VALUES($1,'buyer@example.test',$2,'Example Studio','business')").bind(slug).bind(demo_password).execute(&mut *tx).await?;
    let wat = include_str!("../../extensions/company-limit.wat");
    let sandbox = Sandbox::new(wat).map_err(bad)?;
    sqlx::query("INSERT INTO extensions(tenant,wat,digest) VALUES($1,$2,$3)")
        .bind(slug)
        .bind(wat)
        .bind(hash(wat))
        .execute(&mut *tx)
        .await?;
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
