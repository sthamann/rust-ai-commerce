//! Store API address book uses independent customer sessions, never merchant credentials.
use super::*;
pub(super) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (t, e) = identity(&a, &h).await?;
    Ok(Json(address_list(&a, &t, &e).await?))
}
pub(super) async fn create(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let (t, e) = identity(&a, &h).await?;
    Ok(Json(address_save(&a, &t, &e, None, &v).await?))
}
pub(super) async fn save(
    State(a): State<App>,
    h: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let (t, e) = identity(&a, &h).await?;
    Ok(Json(address_save(&a, &t, &e, Some(&id), &v).await?))
}
pub(super) async fn remove(
    State(a): State<App>,
    h: HeaderMap,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let (t, e) = identity(&a, &h).await?;
    Ok(Json(
        address_delete(
            &a,
            &t,
            &e,
            &id,
            v["revision"].as_i64().ok_or(bad("revision required"))?,
        )
        .await?,
    ))
}
