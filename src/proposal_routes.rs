//! HTTP proposal creation, approval and task listing.
use crate::*;

pub(crate) async fn agent_plan(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "knowledge.read")?;
    Ok(Json(
        plan_with(
            &a,
            &t,
            v["instruction"].as_str().unwrap_or(""),
            choice(&v)?.as_ref(),
            "",
            &language_context(&a, &h).await?.0,
            &h,
        )
        .await?,
    ))
}
pub(crate) async fn agent_apply(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    if v["approve"] != true {
        return Err(bad("Explicit approve=true required"));
    }
    Ok(Json(apply(&a, &t, &id, &h).await?))
}
pub(crate) async fn tasks(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let rs = sqlx::query(
        "SELECT id,proposal,applied FROM tasks WHERE tenant=$1 ORDER BY created_at DESC LIMIT 30",
    )
    .bind(t)
    .fetch_all(&a.db)
    .await?;
    Ok(Json(
        json!({"tasks":rs.iter().map(|r|json!({"id":r.get::<String,_>("id"),"preview":r.get::<Value,_>("proposal"),"applied":r.get::<bool,_>("applied")})).collect::<Vec<_>>()}),
    ))
}
