//! Typed customer-owned profile updates; price groups, email and merchant roles cannot be self-assigned.
use super::*;
pub(super) async fn get(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (t, email) = identity(&a, &h).await?;
    let r = sqlx::query(
        "SELECT *,created_at::text AS created FROM customers WHERE tenant=$1 AND email=$2",
    )
    .bind(&t)
    .bind(&email)
    .fetch_one(&a.db)
    .await?;
    let mut v = customer_value(&r);
    v["addresses"] = address_list(&a, &t, &email).await?;
    decorate(&a, &t, &email, &mut v).await?;
    Ok(Json(v))
}
pub(super) async fn save(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let (t, email) = identity(&a, &h).await?;
    let mut p: Contact = serde_json::from_value(v)
        .map_err(|_| bad("Only customer contact fields can be updated"))?;
    p.validate()?;
    if let Some(id) = &p.default_payment_method_id {
        let (s, _) = commerce::config(&a, &t).await?;
        let group: String =
            sqlx::query_scalar("SELECT group_name FROM customers WHERE tenant=$1 AND email=$2")
                .bind(&t)
                .bind(&email)
                .fetch_one(&a.db)
                .await?;
        if !s
            .payments
            .iter()
            .any(|m| m.id == *id && m.active && (!m.business_only || s.is_business(&group)))
        {
            return Err(bad("Payment method unavailable for customer"));
        }
    }
    if let Some(ad) = &p.address {
        let (settings, _) = commerce::config(&a, &t).await?;
        if !settings.countries.contains(&ad.country) {
            return Err(bad("Address country unavailable"));
        }
    }
    let mut tx = a.db.begin().await?;
    history::customer_context(&mut tx, &email).await?;
    sqlx::query("UPDATE customers SET profile=$1,company=NULLIF($2,''),revision=revision+1 WHERE tenant=$3 AND email=$4").bind(json!(p)).bind(&p.company).bind(&t).bind(&email).execute(&mut *tx).await?;
    if let Some(ad) = &p.address {
        address_save_conn(
            &mut tx,
            &t,
            &email,
            None,
            &json!({"defaultBilling":true,"defaultShipping":true}),
            ad,
        )
        .await?;
    }
    tx.commit().await?;
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
    history::customer_context(&mut tx, &email).await?;
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
