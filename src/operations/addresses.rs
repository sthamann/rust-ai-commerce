//! Merchant/MCP address operations use identical customer ownership and revision checks to the Store API.
use super::*;
pub(super) async fn list(
    State(a): State<App>,
    h: HeaderMap,
    Path(email): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.read")?;
    Ok(Json(accounts::address_list(&a, &t, &email).await?))
}
pub(super) async fn create(
    State(a): State<App>,
    h: HeaderMap,
    Path(email): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.write")?;
    Ok(Json(
        accounts::address_save(&a, &t, &email, None, &v).await?,
    ))
}
pub(super) async fn save(
    State(a): State<App>,
    h: HeaderMap,
    Path((email, id)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.write")?;
    Ok(Json(
        accounts::address_save(&a, &t, &email, Some(&id), &v).await?,
    ))
}
pub(super) async fn remove(
    State(a): State<App>,
    h: HeaderMap,
    Path((email, id)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.write")?;
    Ok(Json(
        accounts::address_delete(
            &a,
            &t,
            &email,
            &id,
            v["revision"].as_i64().ok_or(bad("revision required"))?,
        )
        .await?,
    ))
}
