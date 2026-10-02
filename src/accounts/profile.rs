//! Typed customer-owned profile updates; price groups, email and merchant roles cannot be self-assigned.
use super::*;
pub(super) async fn get(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (t, email) = identity(&a, &h).await?;
    let r = sqlx::query(
        "SELECT profile,company,group_name FROM customers WHERE tenant=$1 AND email=$2",
    )
    .bind(t)
    .bind(&email)
    .fetch_one(&a.db)
    .await?;
    Ok(Json(
        json!({"email":email,"profile":r.get::<Value,_>("profile"),"company":r.get::<Option<String>,_>("company"),"customerGroup":r.get::<String,_>("group_name")}),
    ))
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Profile {
    name: String,
    address: Option<commerce::Address>,
}
pub(super) async fn save(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let (t, email) = identity(&a, &h).await?;
    let p: Profile =
        serde_json::from_value(v).map_err(|_| bad("Only name and address can be updated"))?;
    if p.name.trim().is_empty()
        || p.name.len() > 100
        || p.address.as_ref().is_some_and(|a| {
            [&a.name, &a.street, &a.postal_code, &a.city]
                .iter()
                .any(|s| s.is_empty() || s.len() > 200)
        })
    {
        return Err(bad("Invalid customer profile"));
    }
    sqlx::query("UPDATE customers SET profile=$1 WHERE tenant=$2 AND email=$3")
        .bind(json!(p))
        .bind(t)
        .bind(email)
        .execute(&a.db)
        .await?;
    Ok(Json(json!({"saved":true})))
}
pub(super) async fn password(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let (t, email) = identity(&a, &h).await?;
    let current: String =
        sqlx::query_scalar("SELECT password_hash FROM customers WHERE tenant=$1 AND email=$2")
            .bind(&t)
            .bind(&email)
            .fetch_one(&a.db)
            .await?;
    let old = v["oldPassword"]
        .as_str()
        .ok_or(bad("Current password required"))?;
    if !auth::verify_password(old.to_string(), current.clone()).await? {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "Invalid credentials".into(),
        ));
    }
    let new = auth::hash_password(auth::password(&json!({"password":v["newPassword"]}))?).await?;
    let mut tx = a.db.begin().await?;
    let n = sqlx::query(
        "UPDATE customers SET password_hash=$1 WHERE tenant=$2 AND email=$3 AND password_hash=$4",
    )
    .bind(new)
    .bind(&t)
    .bind(&email)
    .bind(current)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if n != 1 {
        return Err(conflict("Credential changed"));
    }
    sqlx::query("DELETE FROM customer_sessions WHERE tenant=$1 AND email=$2")
        .bind(&t)
        .bind(&email)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"customerToken":session(&a,&t,&email).await?})))
}
