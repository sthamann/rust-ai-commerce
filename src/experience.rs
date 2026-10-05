//! Persisted storefront layout policy and observed synthetic rewards.
use crate::*;

pub(crate) async fn experience(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let session = v["session"]
        .as_str()
        .filter(|s| s.len() >= 8 && s.len() <= 128)
        .ok_or(bad("Session ID required"))?;
    let requested_locale = language_context(&a, &h).await?.0;
    let er = sqlx::query("SELECT data,revision FROM experiences WHERE tenant=$1")
        .bind(&t)
        .fetch_one(&a.db)
        .await?;
    let e: Value = er.get("data");
    let mut tx = a.db.begin().await?;
    let existing =
        sqlx::query("SELECT variant,propensity FROM exposures WHERE tenant=$1 AND session=$2")
            .bind(&t)
            .bind(session)
            .fetch_optional(&mut *tx)
            .await?;
    let (variant, probability) = if let Some(r) = existing {
        (r.get::<String, _>("variant"), r.get::<f64, _>("propensity"))
    } else {
        let rows = sqlx::query(
            "SELECT variant,views,purchases FROM policy WHERE tenant=$1 ORDER BY variant",
        )
        .bind(&t)
        .fetch_all(&mut *tx)
        .await?;
        let best = rows
            .iter()
            .max_by(|x, y| {
                let rate = |r: &sqlx::postgres::PgRow| {
                    (r.get::<i64, _>("purchases") as f64 + 1.)
                        / (r.get::<i64, _>("views") as f64 + 2.)
                };
                rate(x).total_cmp(&rate(y))
            })
            .map(|r| r.get::<String, _>("variant"))
            .unwrap_or("discovery".into());
        let digest = Sha256::digest(session.as_bytes());
        let explore = digest[0] < 51;
        let random = if digest[1] % 2 == 0 {
            "discovery"
        } else {
            "comparison"
        };
        let chosen = if e["mode"] == "balanced" {
            if explore {
                random.to_string()
            } else {
                best.clone()
            }
        } else {
            e["mode"].as_str().unwrap().to_string()
        };
        let epsilon = 51.0 / 256.0;
        let p = if e["mode"] != "balanced" {
            1.
        } else if chosen == best {
            1.0 - epsilon / 2.0
        } else {
            epsilon / 2.0
        };
        let n=sqlx::query("INSERT INTO exposures(tenant,session,variant,propensity) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(&t).bind(session).bind(&chosen).bind(p).execute(&mut *tx).await?.rows_affected();
        if n == 1 {
            sqlx::query("UPDATE policy SET views=views+1 WHERE tenant=$1 AND variant=$2")
                .bind(&t)
                .bind(&chosen)
                .execute(&mut *tx)
                .await?;
        }
        let saved =
            sqlx::query("SELECT variant,propensity FROM exposures WHERE tenant=$1 AND session=$2")
                .bind(&t)
                .bind(session)
                .fetch_one(&mut *tx)
                .await?;
        (saved.get("variant"), saved.get("propensity"))
    };
    tx.commit().await?;
    Ok(Json(
        json!({"schemaVersion":1,"revision":er.get::<i64,_>("revision"),"variant":variant,"propensity":probability,"headline":if e["headlineLocale"].as_str().unwrap_or("en-GB")==requested_locale{e["headline"].clone()}else{Value::Null},"blocks":[{"type":"hero"},{"type":if variant=="comparison"{"comparison-grid"}else{"product-grid"}},{"type":"cart"}],"adaptation":{"localBehavior":true,"policy":"persisted epsilon-greedy; simulated purchase reward"}}),
    ))
}
pub(crate) async fn policy_stats(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rs = sqlx::query("SELECT * FROM policy WHERE tenant=$1 ORDER BY variant")
        .bind(t)
        .fetch_all(&a.db)
        .await?;
    Ok(Json(
        json!({"variants":rs.iter().map(|r|json!({"variant":r.get::<String,_>("variant"),"views":r.get::<i64,_>("views"),"purchases":r.get::<i64,_>("purchases")})).collect::<Vec<_>>()}),
    ))
}

/// Product behavior updates a tenant/session profile; the response immediately ranks available channel products.
pub(crate) async fn personalization(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let id = v["productId"].as_str().ok_or(bad("Product required"))?;
    let event = v["eventId"]
        .as_str()
        .filter(|s| s.len() == 32 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or(bad("Event ID required"))?;
    let kind = v["kind"]
        .as_str()
        .filter(|s| ["view", "cart_add"].contains(s))
        .ok_or(bad("Unsupported behavior signal"))?;
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM products WHERE tenant=$1 AND id=$2)")
            .bind(&c.tenant)
            .bind(id)
            .fetch_one(&a.db)
            .await?;
    if !exists {
        return Err(bad("Unknown product"));
    }
    marketing::admit_product(&a, &h, id).await?;

    if kind == "cart_add" && !c.data.items.iter().any(|i| i.id == id) {
        return Err(bad("Cart signal must refer to an actual cart item"));
    }
    let session = hash(&c.id);
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,18))")
        .bind(format!("{}:{session}", c.tenant))
        .execute(&mut *tx)
        .await?;
    let count:i64=sqlx::query_scalar("SELECT count(*) FROM session_signal_events WHERE tenant=$1 AND session=$2 AND created_at>now()-interval '1 hour'").bind(&c.tenant).bind(&session).fetch_one(&mut *tx).await?;
    if count >= 500 {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Behavior signal limit reached".into(),
        ));
    }
    let n=sqlx::query("INSERT INTO session_signal_events(tenant,id,session) VALUES($1,$2,$3) ON CONFLICT DO NOTHING").bind(&c.tenant).bind(event).bind(&session).execute(&mut *tx).await?.rows_affected();
    if n == 1 {
        sqlx::query("INSERT INTO session_signals(tenant,session,product_id,views,cart_adds) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant,session,product_id) DO UPDATE SET views=least(session_signals.views+EXCLUDED.views,1000),cart_adds=least(session_signals.cart_adds+EXCLUDED.cart_adds,1000),updated_at=now()").bind(&c.tenant).bind(&session).bind(id).bind(i32::from(kind=="view")).bind(i32::from(kind=="cart_add")).execute(&mut *tx).await?;
    }
    let rows=sqlx::query("SELECT p.category,sum(s.views+s.cart_adds*3)::bigint AS score FROM session_signals s JOIN products p ON p.tenant=s.tenant AND p.id=s.product_id WHERE s.tenant=$1 AND s.session=$2 AND s.updated_at>now()-interval '30 days' GROUP BY p.category").bind(&c.tenant).bind(&session).fetch_all(&mut *tx).await?;
    tx.commit().await?;
    let (_, chain) = language_context(&a, &h).await?;
    let preferred = rows
        .iter()
        .max_by_key(|r| r.get::<i64, _>("score"))
        .map(|r| r.get::<String, _>("category"));
    let scope = marketing::catalog_scope(&a, &h).await?;
    let criteria = CatalogCriteria {
        category: preferred,
        product_ids: scope.clone(),
        ..Default::default()
    };
    let mut ps = product_page(&a, &c.tenant, &chain, &criteria)
        .await?
        .products;
    let page = product_page(
        &a,
        &c.tenant,
        &chain,
        &CatalogCriteria {
            product_ids: scope,
            ..Default::default()
        },
    )
    .await?;
    for p in page.products {
        if !ps.iter().any(|v| v.id == p.id) {
            ps.push(p);
        }
    }
    ps.retain(|p| p.stock > 0);
    let score = |p: &Product| {
        rows.iter()
            .find(|r| r.get::<String, _>("category") == p.category)
            .map(|r| r.get::<i64, _>("score"))
            .unwrap_or(0)
    };
    ps.sort_by(|x, y| score(y).cmp(&score(x)).then(x.id.cmp(&y.id)));
    Ok(Json(
        json!({"rankedProductIds":ps.iter().map(|p|&p.id).collect::<Vec<_>>(),"adapted":rows.iter().any(|r|r.get::<i64,_>("score")>=3),"basis":"observed-session-category-affinity","stored":n==1,"candidateLimit":100,"causalUpliftProven":false}),
    ))
}
/// Clear this anonymous shop session's behavior and allow the shopper to turn adaptation off.
pub(crate) async fn forget_personalization(
    State(a): State<App>,
    h: HeaderMap,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let mut tx = a.db.begin().await?;
    sqlx::query("DELETE FROM session_signals WHERE tenant=$1 AND session=$2")
        .bind(&c.tenant)
        .bind(hash(&c.id))
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM session_signal_events WHERE tenant=$1 AND session=$2")
        .bind(&c.tenant)
        .bind(hash(&c.id))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"forgotten":true})))
}
