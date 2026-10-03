//! Read bounded tenant flow execution summaries without reloading rule/channel configuration on each Studio refresh.
use super::*;
pub(super) async fn values(a: &App, t: &str) -> Result<Value> {
    let jobs=sqlx::query("SELECT j.id,j.flow,j.state,j.result,j.error,j.cursor,j.execution,to_char(j.available_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS available_at,COALESCE((SELECT t.applied FROM tasks t WHERE t.tenant=j.tenant AND t.id=j.result->>'taskId'),false) AS applied FROM flow_jobs j WHERE j.tenant=$1 ORDER BY j.event_id DESC,j.id LIMIT 50").bind(t).fetch_all(&a.db).await?;
    Ok(json!(jobs.iter().map(|r|json!({"id":r.get::<String,_>("id"),"flow":r.get::<String,_>("flow"),"state":r.get::<String,_>("state"),"result":r.get::<Option<Value>,_>("result"),"error":r.get::<Option<String>,_>("error"),"cursor":r.get::<Option<String>,_>("cursor"),"execution":r.get::<Value,_>("execution"),"availableAt":r.get::<String,_>("available_at"),"applied":r.get::<bool,_>("applied")})).collect::<Vec<_>>()))
}
pub(super) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    auth::permit(&h, "settings.read")?;
    Ok(Json(json!({"jobs":values(&a,&merchant(&a,&h)?).await?})))
}
