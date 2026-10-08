//! Merchant memory endpoints and revision-bound experiment/dismissal decisions.
use super::*;
pub(crate) fn cognition_router() -> Router<App> {
    Router::new()
        .route(
            "/store-api/intelligence/recommendations/{id}",
            get(recommendations),
        )
        .secure_route(
            "/api/intelligence",
            &[("GET", "knowledge.read")],
            get(memory),
        )
        .secure_route(
            "/api/intelligence/hypotheses/{id}",
            &[("PUT", "catalog.write")],
            axum::routing::put(decide),
        )
}
async fn memory(State(a): State<App>, h: RequestContext) -> Result<Json<Value>> {
    auth::permit(&h, "knowledge.read")?;
    Ok(Json(observations(&a, &merchant(&a, &h)?).await?))
}
async fn decide(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "catalog")?;
    let t = merchant(&a, &h)?;
    let state = v["state"]
        .as_str()
        .filter(|v| ["dismissed", "experiment", "published"].contains(v))
        .ok_or(bad("Choose dismissed, experiment or published"))?;
    if v["approve"] != true {
        return Err(bad("Explicit approve=true required"));
    }
    let mut tx = a.db.begin().await?;
    let changed=sqlx::query("UPDATE knowledge_hypotheses SET state=$1,revision=revision+1 WHERE tenant=$2 AND id=$3 AND revision=$4").bind(state).bind(&t).bind(&id).bind(v["revision"].as_i64().ok_or(bad("revision required"))?).execute(&mut *tx).await?.rows_affected();
    if changed != 1 {
        return Err(conflict("Hypothesis revision changed"));
    }
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'intelligence.decision',$2)")
        .bind(t)
        .bind(json!({"hypothesisId":id,"state":state,"experimentStarted":false}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"state":state,"experimentStarted":false,"nextStep":"Configure a controlled experiment; marking an idea does not run one"}),
    ))
}
