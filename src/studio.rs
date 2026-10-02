//! Verified merchant overview facts consumed by the chat and activity views.
use super::*;
use axum::{extract::Request, middleware::Next};

pub(super) async fn track_channels(State(a): State<App>, request: Request, next: Next) -> Response {
    let path = request.uri().path();
    let channel = if path == "/mcp" {
        Some("mcp")
    } else if path.starts_with("/ucp/") {
        Some("ucp")
    } else if path.starts_with("/store-api/") {
        Some("storefront")
    } else {
        None
    };
    let t = tenant(request.headers()).ok();
    let response = next.run(request).await;
    if let (Some(channel), Some(t)) = (channel, t) {
        let failure = if response.status().is_client_error() || response.status().is_server_error()
        {
            1_i64
        } else {
            0
        };
        // Diagnostic counters are best-effort and do not delay commerce. They
        // count HTTP calls (including synthetic tests/admin reads), never people.
        tokio::spawn(async move {
            let _=sqlx::query("INSERT INTO channel_metrics(tenant,channel,calls,failures) VALUES($1,$2,1,$3) ON CONFLICT(tenant,channel) DO UPDATE SET calls=channel_metrics.calls+1,failures=channel_metrics.failures+$3,last_seen=now()")
                .bind(t).bind(channel).bind(failure).execute(&a.db).await;
        });
    }
    response
}
pub(super) async fn merchant_overview(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let (locale, chain) = language_context(&a, &h).await?;
    let ps = localized_products(&a, &t, &chain).await?;
    let stats=sqlx::query("SELECT count(*) AS orders,coalesce(sum((data->'cart'->'price'->>'totalPrice')::double precision),0) AS revenue,count(*) FILTER(WHERE created_at>=current_date) AS today FROM orders WHERE tenant=$1").bind(&t).fetch_one(&a.db).await?;
    let rows=sqlx::query("SELECT data,created_at::text AS time FROM orders WHERE tenant=$1 ORDER BY created_at DESC LIMIT 8").bind(&t).fetch_all(&a.db).await?;
    let orders=rows.iter().map(|r| {let data=r.get::<Value,_>("data");json!({"id":data["id"],"number":data["orderNumber"],"total":data["cart"]["price"]["totalPrice"],"channel":data.get("channel").cloned().unwrap_or(json!("unknown")),"time":r.get::<String,_>("time"),"payment":"simulated"})}).collect::<Vec<_>>();
    let timeline=sqlx::query("SELECT d::date::text AS day,count(o.id) AS orders,coalesce(sum((o.data->'cart'->'price'->>'totalPrice')::double precision),0) AS revenue FROM generate_series(current_date-6,current_date,interval '1 day') d LEFT JOIN orders o ON o.tenant=$1 AND o.created_at>=d AND o.created_at<d+interval '1 day' GROUP BY d ORDER BY d").bind(&t).fetch_all(&a.db).await?;
    let policy =
        sqlx::query("SELECT variant,views,purchases FROM policy WHERE tenant=$1 ORDER BY variant")
            .bind(&t)
            .fetch_all(&a.db)
            .await?;
    let variants=policy.iter().map(|r|{let views=r.get::<i64,_>("views");let purchases=r.get::<i64,_>("purchases");json!({"variant":r.get::<String,_>("variant"),"views":views,"purchases":purchases,"estimate":(purchases+1) as f64/(views+2) as f64})}).collect::<Vec<_>>();
    let learning_timeline=sqlx::query("SELECT d::date::text AS day,count(e.session) AS views,count(e.session) FILTER(WHERE e.rewarded) AS rewarded FROM generate_series(current_date-6,current_date,interval '1 day') d LEFT JOIN exposures e ON e.tenant=$1 AND e.created_at>=d AND e.created_at<d+interval '1 day' GROUP BY d ORDER BY d").bind(&t).fetch_all(&a.db).await?;
    let graph = knowledge::graph(&a.db, &t).await?;
    let index=sqlx::query("SELECT count(*) AS count,max(updated_at)::text AS updated FROM semantic_products WHERE tenant=$1").bind(&t).fetch_one(&a.db).await?;
    let plans=sqlx::query("SELECT count(*) FILTER(WHERE NOT applied AND (jsonb_array_length(proposal->'proposal'->'changes')>0 OR proposal->'proposal'->'experience' IS NOT NULL AND proposal->'proposal'->'experience'<>'null'::jsonb)) AS pending,count(*) FILTER(WHERE applied) AS applied FROM tasks WHERE tenant=$1").bind(&t).fetch_one(&a.db).await?;
    let activity=sqlx::query("SELECT kind,time::text AS time,id FROM (SELECT 'order' AS kind,created_at AS time,id FROM orders WHERE tenant=$1 UNION ALL SELECT CASE WHEN applied AND applied_at IS NOT NULL THEN 'approved' ELSE 'proposal' END AS kind,coalesce(applied_at,created_at) AS time,id FROM tasks WHERE tenant=$1) a ORDER BY time DESC LIMIT 10").bind(&t).fetch_all(&a.db).await?;
    let channels=sqlx::query("SELECT channel,calls,failures,last_seen::text AS last_seen FROM channel_metrics WHERE tenant=$1 ORDER BY channel").bind(&t).fetch_all(&a.db).await?;
    let providers = a.inference.providers();
    Ok(Json(json!({
        "locale":locale,"tenant":t,"dataMode":"synthetic-demo","products":ps,
        "summary":{"orders":stats.get::<i64,_>("orders"),"ordersToday":stats.get::<i64,_>("today"),"revenue":stats.get::<f64,_>("revenue"),"pendingPlans":plans.get::<i64,_>("pending"),"appliedPlans":plans.get::<i64,_>("applied")},
        "orders":orders,"timeline":timeline.iter().map(|r|json!({"day":r.get::<String,_>("day"),"orders":r.get::<i64,_>("orders"),"revenue":r.get::<f64,_>("revenue")})).collect::<Vec<_>>(),
        "knowledge":{"graph":graph,"indexedProducts":index.get::<i64,_>("count"),"lastIndexed":index.get::<Option<String>,_>("updated"),"provenance":"curated-demo","modelWeightsLearn":false},
        "learning":{"timeline":learning_timeline.iter().map(|r|json!({"day":r.get::<String,_>("day"),"views":r.get::<i64,_>("views"),"rewarded":r.get::<i64,_>("rewarded")})).collect::<Vec<_>>(),"variants":variants,"method":"epsilon-greedy with smoothed purchase rate","reward":"simulated order","causalUpliftProven":false},
        "activity":activity.iter().map(|r|json!({"kind":r.get::<String,_>("kind"),"time":r.get::<String,_>("time"),"id":r.get::<String,_>("id")})).collect::<Vec<_>>(),
        "channels":channels.iter().map(|r|json!({"channel":r.get::<String,_>("channel"),"calls":r.get::<i64,_>("calls"),"httpFailures":r.get::<i64,_>("failures"),"lastSeen":r.get::<String,_>("last_seen")})).collect::<Vec<_>>(),
        "connections":{"providers":providers["providers"],"chatgptAccountLinked":false,"claudeAccountLinked":false,"localMCPConfig":{"mcpServers":{"rust-ai-commerce":{"command":"python3","args":[env::current_dir().unwrap().join("scripts/mcp_stdio.py").to_string_lossy()],"env":{"COMMERCE_URL":"http://127.0.0.1:8787","COMMERCE_TENANT":t}}}},"localMCP":true,"ucpCheckout":true,"remoteOAuth":false},
        "capabilities":CAPABILITIES.iter().map(|(name,_)|name).collect::<Vec<_>>()
    })))
}
