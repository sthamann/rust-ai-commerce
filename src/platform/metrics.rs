//! Aggregate-only control-plane reads: real tenants, bounded pages, explicit currencies and simulated/confirmed amounts.
use super::*;
use axum::extract::Query;
#[derive(Deserialize)]
pub(super) struct Criteria {
    #[serde(default)]
    after: String,
    #[serde(default)]
    search: String,
    limit: Option<i64>,
    days: Option<i64>,
}
fn window(c: &Criteria) -> Result<i64> {
    let days = c.days.unwrap_or(30);
    if !(1..=90).contains(&days) || c.search.len() > 100 || c.after.len() > 48 {
        return Err(bad("Invalid statistics window or search"));
    }
    Ok(days)
}
const AMOUNTS: &str = "SELECT coalesce(data->'cart'->'price'->>'currency','EUR') AS currency, count(*) AS orders, coalesce(sum((data->'cart'->'price'->>'totalPrice')::numeric) FILTER(WHERE data->>'state' NOT IN ('cancelled','canceled')),0)::text AS booked, coalesce(sum((data->'cart'->'price'->>'totalPrice')::numeric) FILTER(WHERE data->'payment'->>'provider'='simulated' AND data->>'state' NOT IN ('cancelled','canceled')),0)::text AS simulated, coalesce(sum((data->'cart'->'price'->>'totalPrice')::numeric) FILTER(WHERE data->'payment'->>'realMoneyCharged'='true' AND data->'payment'->>'state' IN ('captured','captured_late','partially_refunded','refunded')),0)::text AS captured FROM orders o WHERE created_at>=current_date-($1::integer-1)*interval '1 day' AND NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=o.tenant) AND ($2::text IS NULL OR tenant=$2) GROUP BY currency ORDER BY currency";
fn amounts(rows: &[sqlx::postgres::PgRow]) -> Vec<Value> {
    rows.iter().map(|r|json!({"currency":r.get::<String,_>("currency"),"orders":r.get::<i64,_>("orders"),"booked":r.get::<String,_>("booked"),"simulated":r.get::<String,_>("simulated"),"captured":r.get::<String,_>("captured")})).collect()
}
pub(super) async fn overview(
    State(a): State<App>,
    h: HeaderMap,
    Query(c): Query<Criteria>,
) -> Result<Json<Value>> {
    auth::actor(&h)?;
    let days = window(&c)?;
    let mut tx = a.db.begin().await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        .execute(&mut *tx)
        .await?;
    let row=sqlx::query("SELECT (SELECT count(*) FROM tenants t WHERE NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=t.id)) AS shops,(SELECT count(*) FROM shop_environments) AS sandboxes,(SELECT count(*) FROM merchant_users) AS users,(SELECT count(*) FROM products p WHERE NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=p.tenant)) AS products,(SELECT count(*) FROM customers c WHERE NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=c.tenant)) AS customers,(SELECT count(*) FROM orders o WHERE created_at>=current_date-($1::integer-1)*interval '1 day' AND NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=o.tenant)) AS orders,(SELECT count(*) FROM outbox o WHERE delivered_at IS NULL AND NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=o.tenant)) AS pending_events,now()::text AS generated").bind(days).fetch_one(&mut *tx).await?;
    let money = sqlx::query(AMOUNTS)
        .bind(days)
        .bind(Option::<String>::None)
        .fetch_all(&mut *tx)
        .await?;
    let channels=sqlx::query("SELECT channel,coalesce(sum(calls),0)::bigint AS calls,coalesce(sum(failures),0)::bigint AS failures FROM channel_metrics m WHERE NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=m.tenant) GROUP BY channel ORDER BY channel").fetch_all(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(
        json!({"days":days,"generatedAt":row.get::<String,_>("generated"),"shops":row.get::<i64,_>("shops"),"sandboxes":row.get::<i64,_>("sandboxes"),"merchantUsers":row.get::<i64,_>("users"),"products":row.get::<i64,_>("products"),"customers":row.get::<i64,_>("customers"),"orders":row.get::<i64,_>("orders"),"pendingEvents":row.get::<i64,_>("pending_events"),"amounts":amounts(&money),"channels":channels.iter().map(|r|json!({"channel":r.get::<String,_>("channel"),"calls":r.get::<i64,_>("calls"),"failures":r.get::<i64,_>("failures")})).collect::<Vec<_>>(),"channelScope":"persisted lifetime HTTP requests, not visitors; counters include tests and merchant reads","paymentScope":"recorded gross orders and confirmed online captures; not net revenue or accounting settlement"}),
    ))
}
pub(super) async fn shops(
    State(a): State<App>,
    h: HeaderMap,
    Query(c): Query<Criteria>,
) -> Result<Json<Value>> {
    auth::actor(&h)?;
    let days = window(&c)?;
    let limit = c.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err(bad("Page size must be 1..100"));
    }
    let rows=sqlx::query("SELECT t.id,t.name,t.created_at::text AS created,(SELECT count(*) FROM products WHERE tenant=t.id) AS products,(SELECT count(*) FROM customers WHERE tenant=t.id) AS customers,(SELECT count(*) FROM memberships WHERE tenant=t.id AND active) AS members,(SELECT count(*) FROM orders WHERE tenant=t.id AND created_at>=current_date-($4::integer-1)*interval '1 day') AS orders,(SELECT count(*) FROM app_packages WHERE tenant=t.id AND active) AS apps,(SELECT count(*) FROM sales_channels WHERE tenant=t.id AND coalesce((data->>'active')::boolean,true)) +1 AS channels,(SELECT count(*) FROM app_evidence WHERE tenant=t.id) AS sources FROM tenants t WHERE t.id>$1 AND (strpos(lower(t.name),lower($2))>0 OR strpos(t.id,lower($2))>0) AND NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=t.id) ORDER BY t.id LIMIT $3").bind(&c.after).bind(&c.search).bind(limit+1).bind(days).fetch_all(&a.db).await?;
    let more = rows.len() > limit as usize;
    let rows = &rows[..rows.len().min(limit as usize)];
    Ok(Json(
        json!({"elements":rows.iter().map(|r| json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"createdAt":r.get::<String,_>("created"),"products":r.get::<i64,_>("products"),"customers":r.get::<i64,_>("customers"),"members":r.get::<i64,_>("members"),"orders":r.get::<i64,_>("orders"),"apps":r.get::<i64,_>("apps"),"salesChannels":r.get::<i64,_>("channels"),"knowledgeSources":r.get::<i64,_>("sources")})).collect::<Vec<_>>(),"hasMore":more,"nextCursor":if more {rows.last().map(|r|r.get::<String,_>("id"))}else{None},"days":days}),
    ))
}
pub(super) async fn detail(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Query(c): Query<Criteria>,
) -> Result<Json<Value>> {
    auth::actor(&h)?;
    validate_tenant(&id)?;
    let days = window(&c)?;
    let row=sqlx::query("SELECT id,name FROM tenants t WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM shop_environments e WHERE e.tenant=t.id)").bind(&id).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Shop not found".into()))?;
    let money = sqlx::query(AMOUNTS)
        .bind(days)
        .bind(&id)
        .fetch_all(&a.db)
        .await?;
    let daily=sqlx::query("SELECT d::date::text AS day,count(o.id) AS orders FROM generate_series(current_date-($2::integer-1)*interval '1 day',current_date,interval '1 day') d LEFT JOIN orders o ON o.tenant=$1 AND o.created_at>=d AND o.created_at<d+interval '1 day' GROUP BY d ORDER BY d").bind(&id).bind(days).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"id":row.get::<String,_>("id"),"name":row.get::<String,_>("name"),"days":days,"amounts":amounts(&money),"timeline":daily.iter().map(|r|json!({"day":r.get::<String,_>("day"),"orders":r.get::<i64,_>("orders")})).collect::<Vec<_>>()}),
    ))
}
