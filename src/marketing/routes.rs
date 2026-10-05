//! Typed configuration CRUD, rule preview and revision-bound coupon edits.
use super::*;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .merge(catalog::router())
        .merge(metadata::router())
        .route("/api/automation", get(list))
        .route("/api/automation/executions", get(jobs::list))
        .route("/api/automation/{kind}/{id}", axum::routing::put(save))
        .route("/api/automation/rules/preview", post(preview))
        .route("/store-api/checkout/coupons", axum::routing::put(coupons))
}
fn table(kind: &str) -> Result<&'static str> {
    match kind {
        "rules" => Ok("commerce_rules"),
        "promotions" => Ok("commerce_promotions"),
        "flows" => Ok("commerce_flows"),
        "channels" => Ok("sales_channels"),
        _ => Err(bad("Unknown configuration type")),
    }
}
pub(super) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    auth::permit(&h, "settings.read")?;
    let t = merchant(&a, &h)?;
    let mut result = json!({});
    for kind in ["rules", "promotions", "flows", "channels"] {
        let table = table(kind)?;
        let sql = if kind == "rules" {
            format!(
                "SELECT id,jsonb_build_object('name',name,'condition',condition,'active',active) AS data,revision FROM {table} WHERE tenant=$1 ORDER BY id LIMIT 100"
            )
        } else {
            format!("SELECT id,data,revision FROM {table} WHERE tenant=$1 ORDER BY id LIMIT 100")
        };
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
            .bind(&t)
            .fetch_all(&a.db)
            .await?;
        result[kind]=json!(rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"data":r.get::<Value,_>("data"),"revision":r.get::<i64,_>("revision")})).collect::<Vec<_>>());
    }
    result["jobs"] = jobs::values(&a, &t).await?;
    Ok(Json(result))
}
pub(super) async fn save(
    State(a): State<App>,
    h: HeaderMap,
    Path((kind, id)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings")?;
    let t = merchant(&a, &h)?;
    if !apps::identifier(&id) {
        return Err(bad("Invalid configuration ID"));
    }
    let table = table(&kind)?;
    let mut data = v["data"].clone();
    let (settings, _) = commerce::config(&a, &t).await?;
    let expected = v["revision"].as_i64().ok_or(bad("Revision required"))?;
    match kind.as_str() {
        "rules" => {
            let c: rules::Condition = serde_json::from_value(data["condition"].clone())
                .map_err(|_| bad("Unsupported rule condition"))?;
            c.validate(0)?;
            if !data["active"].is_boolean() {
                return Err(bad("Rule active flag required"));
            }
        }
        "promotions" => {
            let p: Promotion = serde_json::from_value(data.clone())
                .map_err(|_| bad("Invalid promotion schema"))?;
            validate_promotion(&p)?;
            for date in [&p.start, &p.end] {
                if let Some(date) = date
                    && !sqlx::query_scalar::<_, bool>("SELECT $1::timestamptz IS NOT NULL")
                        .bind(date)
                        .fetch_one(&a.db)
                        .await
                        .unwrap_or(false)
                {
                    return Err(bad("Invalid campaign timestamp"));
                }
            }
        }
        "flows" => {
            let f: flows::Flow =
                serde_json::from_value(data.clone()).map_err(|_| bad("Invalid flow"))?;
            f.validate()?;
            validate_app_flow(&a, &t, &h, &f).await?;
            if let Some(p) = &f.pipeline {
                for node in &p.nodes {
                    if let pipeline::Node::Action { action, config, .. } = node {
                        auth::permit(&h, flow_actions::permission(action))?;
                        if action == "ai_proposal" {
                            auth::permit(&h, "knowledge.read")?;
                        }
                        if action == "app_action" || action == "action.mail.send" {
                            let mut step = f.clone();
                            step.action = "app_action".into();
                            step.app_action = Some(flows::AppFlowAction {
                                app: config["app"].as_str().unwrap_or("email").into(),
                                action: config["action"].as_str().unwrap_or("send_order").into(),
                                arguments: if action == "action.mail.send" {
                                    json!({"locale":&f.locale[..2],"dryRun":false})
                                } else {
                                    config["arguments"].clone()
                                },
                            });
                            validate_app_flow(&a, &t, &h, &step).await?;
                        }
                    }
                }
            }

            data["actor"] = json!(header(&h, "x-rac-user").unwrap_or("bootstrap"));
        }
        "channels" => {
            let c: Channel =
                serde_json::from_value(data.clone()).map_err(|_| bad("Invalid channel"))?;
            if !["storefront", "headless"].contains(&c.kind.as_str())
                || c.locales.is_empty()
                || c.locales.iter().any(|v| !settings.locales.contains(v))
                || c.product_ids.len() > 500
            {
                return Err(bad("Invalid channel membership"));
            }
            if let Some(root) = &c.navigation_category_id {
                let exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM categories WHERE tenant=$1 AND id=$2)",
                )
                .bind(&t)
                .bind(root)
                .fetch_one(&a.db)
                .await?;
                if !exists {
                    return Err(bad("Unknown channel navigation category"));
                }
            }
            for product in &c.product_ids {
                let exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND id=$2)",
                )
                .bind(&t)
                .bind(product)
                .fetch_one(&a.db)
                .await?;
                if !exists {
                    return Err(bad("Unknown channel product"));
                }
            }
        }
        _ => unreachable!(),
    }
    let name = &data["name"];
    commerce::validate_names(name, &settings, 100)?;
    let mut tx = a.db.begin().await?;
    let sql = format!("SELECT revision FROM {table} WHERE tenant=$1 AND id=$2 FOR UPDATE");
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,17))")
        .bind(format!("{t}:{table}:{id}"))
        .execute(&mut *tx)
        .await?;
    let rev: Option<i64> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql.as_str()))
        .bind(&t)
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?;
    if rev.unwrap_or(0) != expected {
        return Err(conflict("Configuration revision changed"));
    }
    if kind == "rules" {
        sqlx::query("INSERT INTO commerce_rules(tenant,id,name,condition,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,id) DO UPDATE SET name=EXCLUDED.name,condition=EXCLUDED.condition,active=EXCLUDED.active,revision=commerce_rules.revision+1").bind(&t).bind(&id).bind(name).bind(&data["condition"]).bind(data["active"].as_bool()).execute(&mut *tx).await?;
    } else {
        let sql = format!(
            "INSERT INTO {table}(tenant,id,data) VALUES($1,$2,$3) ON CONFLICT(tenant,id) DO UPDATE SET data=EXCLUDED.data,revision={table}.revision+1"
        );
        sqlx::query(sqlx::AssertSqlSafe(sql.as_str()))
            .bind(&t)
            .bind(&id)
            .bind(data)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(json!({"saved":true,"revision":expected+1})))
}
pub(super) async fn preview(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "settings.read")?;
    let c: rules::Condition =
        serde_json::from_value(v["condition"].clone()).map_err(|_| bad("Unsupported condition"))?;
    c.validate(0)?;
    let cart = load_cart(&a, &h).await?;
    if cart.tenant != t {
        return Err(bad("Wrong cart"));
    }
    let mut q = cart_json(&a, &cart).await?;
    q["ruleFacts"] = facts::rule_facts(&mut *a.db.acquire().await?, &cart, &q).await?;
    super::rule_snapshot::attach(
        &mut *a.db.acquire().await?,
        &t,
        &v["condition"],
        &mut q["ruleFacts"],
    )
    .await?;
    Ok(Json(
        json!({"matched":c.checked_matches(&cart,&q)?,"sideEffects":false}),
    ))
}
async fn coupons(State(a): State<App>, h: HeaderMap, Json(v): Json<Value>) -> Result<Json<Value>> {
    let codes = v["codes"]
        .as_array()
        .filter(|v| v.len() <= 5)
        .ok_or(bad("Maximum five coupon codes"))?;
    let codes = codes
        .iter()
        .map(|c| {
            c.as_str()
                .filter(|s| !s.is_empty() && s.len() <= 64 && s.is_ascii())
                .map(str::to_string)
                .ok_or(bad("Invalid coupon code"))
        })
        .collect::<Result<Vec<_>>>()?;
    let t = tenant(&h)?;
    let mut tx = a.db.begin().await?;
    let r = sqlx::query("SELECT * FROM carts WHERE tenant=$1 AND token=$2 FOR UPDATE")
        .bind(&t)
        .bind(token(&h)?)
        .fetch_one(&mut *tx)
        .await?;
    let mut c = stored(&r)?;
    if c.status != "open" || Some(c.revision) != v["revision"].as_i64() {
        return Err(conflict("Cart changed or terminal"));
    }
    c.data.coupons = codes;
    sqlx::query("UPDATE carts SET data=$1,revision=revision+1 WHERE id=$2")
        .bind(json!(c.data))
        .bind(&c.id)
        .execute(&mut *tx)
        .await?;
    c.revision += 1;
    tx.commit().await?;
    Ok(Json(cart_json(&a, &c).await?))
}
