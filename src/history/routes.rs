//! History summaries are bounded and permission-filtered; full snapshots and restore targets stay inside the owning shop.
use super::*;
#[derive(Default, Deserialize)]
pub(super) struct Page {
    #[serde(default)]
    pub before: Option<i64>,
}
pub(super) async fn list(
    State(a): State<App>,
    h: HeaderMap,
    Path((entity, id)): Path<(String, String)>,
    axum::extract::Query(p): axum::extract::Query<Page>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let (read, write) = rights(&entity)?;
    auth::permit(&h, read)?;
    if id.len() > 254 {
        return Err(bad("Invalid history key"));
    }
    let rows=sqlx::query("SELECT eh.id,actor,coalesce(u.name,actor) AS actor_label,source,reason,eh.created_at::text AS time,before_state IS NOT NULL AS restorable,coalesce(after_state->'revision',after_state->'record'->'revision') AS revision FROM entity_history eh LEFT JOIN merchant_users u ON u.id=eh.actor WHERE eh.tenant=$1 AND entity=$2 AND entity_id=$3 AND eh.id<$4 AND before_state IS DISTINCT FROM after_state ORDER BY eh.id DESC LIMIT 31").bind(&t).bind(&entity).bind(&id).bind(p.before.unwrap_or(i64::MAX)).fetch_all(&a.db).await?;
    let elements=rows.iter().take(30).map(|r|json!({"id":r.get::<i64,_>("id"),"actor":r.get::<Option<String>,_>("actor"),"actorLabel":r.get::<Option<String>,_>("actor_label"),"source":r.get::<String,_>("source"),"reason":r.get::<Option<String>,_>("reason"),"createdAt":r.get::<String,_>("time"),"revision":r.get::<Option<Value>,_>("revision"),"hasPrevious":r.get::<bool,_>("restorable")})).collect::<Vec<_>>();
    Ok(Json(
        json!({"elements":elements,"nextCursor":if rows.len()>30{elements.last().map(|e|e["id"].clone())}else{None},"canRestore":write.is_some_and(|w|auth::permit(&h,w).is_ok()),"entity":entity,"entityId":id,"captureFrom":"034-entity-history","restoresAsNewRevision":true}),
    ))
}
pub(super) async fn detail(
    State(a): State<App>,
    h: HeaderMap,
    Path((entity, id, version)): Path<(String, String, i64)>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, rights(&entity)?.0)?;
    Ok(Json(record(&a, &t, &entity, &id, version).await?))
}
pub(super) async fn record(
    a: &App,
    t: &str,
    entity: &str,
    id: &str,
    version: i64,
) -> Result<Value> {
    sqlx::query_scalar("SELECT jsonb_build_object('id',id,'before',before_state,'after',after_state) FROM entity_history WHERE tenant=$1 AND entity=$2 AND entity_id=$3 AND id=$4")
 .bind(t).bind(entity).bind(id).bind(version).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"History version unavailable".into()))
}
pub(super) async fn restore(
    State(a): State<App>,
    h: HeaderMap,
    Path((entity, id, version)): Path<(String, String, i64)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let (read, write) = rights(&entity)?;
    auth::permit(&h, read)?;
    let write = write.ok_or(bad(
        "Order/payment history cannot be rewound; use state-machine actions",
    ))?;
    auth::permit(&h, write)?;
    if v["approve"] != true {
        return Err(bad("Explicit restoration approval required"));
    }
    let rev = v["revision"]
        .as_i64()
        .ok_or(bad("Current revision required"))?;
    let side = v["side"]
        .as_str()
        .filter(|s| ["before", "after"].contains(s))
        .ok_or(bad("Version side required"))?;
    let record = record(&a, &t, &entity, &id, version).await?;
    let state = record[side].clone();
    if state.is_null() {
        return Err(bad("Cannot restore a non-existent entity"));
    }
    let mut h = h;
    h.insert(
        "x-rac-history-reason",
        format!("restore:{version}:{side}").parse().unwrap(),
    );
    restore::apply(a, h, &entity, id, state, rev).await
}
