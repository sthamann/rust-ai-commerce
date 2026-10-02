//! Private cloned shops, scope admission and selective atomic release of reviewed changes.
use crate::*;
mod clone;
mod documents;
mod release;
mod snapshot;
pub(crate) use release::*;
pub(crate) use snapshot::*;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/api/environments", get(list).post(clone::create))
        .route("/api/environments/{id}/diff", get(diff))
        .route("/api/environments/{id}/release", post(release))
}
pub(crate) async fn parent(a: &App, t: &str) -> Result<Option<String>> {
    Ok(
        sqlx::query_scalar("SELECT live_tenant FROM shop_environments WHERE tenant=$1")
            .bind(t)
            .fetch_optional(&a.db)
            .await?,
    )
}
pub(crate) async fn live(a: &App, h: &HeaderMap) -> Result<String> {
    let t = merchant(a, h)?;
    if parent(a, &t).await?.is_some() {
        return Err(bad("Use the live workspace for environment management"));
    }
    Ok(t)
}
pub(crate) async fn owned(a: &App, live: &str, stage: &str) -> Result<Value> {
    sqlx::query_scalar("SELECT baseline FROM shop_environments WHERE tenant=$1 AND live_tenant=$2")
        .bind(stage)
        .bind(live)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(
            StatusCode::NOT_FOUND,
            "Environment unavailable".into(),
        ))
}
async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = live(&a, &h).await?;
    let rows=sqlx::query("SELECT tenant,name,created_at::text AS created_at FROM shop_environments WHERE live_tenant=$1 ORDER BY created_at DESC").bind(&t).fetch_all(&a.db).await?;
    let history=sqlx::query("SELECT id,environment,selections,created_at::text AS created_at FROM shop_releases WHERE live_tenant=$1 ORDER BY created_at DESC LIMIT 30").bind(&t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"live":t,"environments":rows.iter().map(|r|json!({"id":r.get::<String,_>("tenant"),"name":r.get::<String,_>("name"),"createdAt":r.get::<String,_>("created_at")})).collect::<Vec<_>>(),"releases":history.iter().map(|r|json!({"id":r.get::<String,_>("id"),"environment":r.get::<String,_>("environment"),"selections":r.get::<Value,_>("selections"),"createdAt":r.get::<String,_>("created_at")})).collect::<Vec<_>>() }),
    ))
}
async fn diff(State(a): State<App>, h: HeaderMap, Path(id): Path<String>) -> Result<Json<Value>> {
    let t = live(&a, &h).await?;
    let base = owned(&a, &t, &id).await?;
    let mut tx = a.db.begin().await?;
    let current = snapshot(&mut tx, &id).await?;
    let actual = snapshot(&mut tx, &t).await?;
    let mut changes = vec![];
    for (key, value) in current.as_object().unwrap() {
        if base["stage"].get(key) != Some(value) {
            changes.push(json!({"key":key,"before":base["stage"].get(key),"after":value,"digest":hash(&value.to_string()),"conflict":actual.get(key)!=base["live"].get(key)}));
        }
    }
    Ok(Json(
        json!({"environment":id,"changes":changes,"excluded":["inventory","customers","orders","payments","credentials","observations"]}),
    ))
}
