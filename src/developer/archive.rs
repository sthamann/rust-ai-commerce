//! Recoverable App Studio project deletion; installed packages and app records retain their independent lifecycle.
use super::*;
pub(super) async fn set(a: &App, h: &HeaderMap, v: &Value) -> Result<Value> {
    auth::permit(h, "users")?;
    let t = staging::live(a, h).await?;
    let app = v["app"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 32)
        .ok_or(bad("App required"))?;
    let archived = v["archived"]
        .as_bool()
        .ok_or(bad("Archived boolean required"))?;
    if v["approve"] != true {
        return Err(bad("Approve the App Studio removal/restore first"));
    }
    let n = sqlx::query("UPDATE developer_builds SET archived=$3, archived_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE tenant=$1 AND app=$2 AND archived<>$3")
        .bind(&t).bind(app).bind(archived).execute(&a.db).await?.rows_affected();
    if n == 0 {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "App Studio project unavailable in this state".into(),
        ));
    }
    Ok(json!({"app":app,"archived":archived,"versions":n}))
}
pub(super) async fn remove(
    State(a): State<App>,
    h: HeaderMap,
    Path(app): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    Ok(Json(
        set(
            &a,
            &h,
            &json!({"app":app,"archived":true,"approve":v["approve"]}),
        )
        .await?,
    ))
}
pub(super) async fn restore(
    State(a): State<App>,
    h: HeaderMap,
    Path(app): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    Ok(Json(
        set(
            &a,
            &h,
            &json!({"app":app,"archived":false,"approve":v["approve"]}),
        )
        .await?,
    ))
}
