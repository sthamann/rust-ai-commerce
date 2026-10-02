//! Customer credential verification and context rotation.
use crate::*;

pub(crate) async fn login(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let email = v["email"].as_str().unwrap_or("");
    let password = v["password"].as_str().unwrap_or("");
    let r = sqlx::query("SELECT * FROM customers WHERE tenant=$1 AND email=$2 AND active")
        .bind(&t)
        .bind(email)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(
            StatusCode::UNAUTHORIZED,
            "Invalid credentials".into(),
        ))?;
    if !auth::verify_password(password.to_owned(), r.get("password_hash")).await? {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "Invalid credentials".into(),
        ));
    }
    let mut tx = a.db.begin().await?;
    let row = sqlx::query("SELECT * FROM carts WHERE tenant=$1 AND token=$2 FOR UPDATE")
        .bind(&t)
        .bind(token(&h)?)
        .fetch_one(&mut *tx)
        .await?;
    let mut c = stored(&row)?;
    if c.status != "open" {
        return Err(conflict("Cart is terminal"));
    }
    c.data.email = Some(email.into());
    c.data.customer_id = Some(r.get("id"));
    let mut selected = commerce::selection(&c.data);
    selected.customer_email = Some(email.into());
    selected.billing_address_id = r.get("default_billing_address_id");
    selected.shipping_address_id = r.get("default_shipping_address_id");
    if let Some(id) = &selected.billing_address_id {
        selected.billing_address = Some(accounts::address_get(&mut tx, &t, email, id).await?);
    }
    if let Some(id) = &selected.shipping_address_id {
        selected.address = Some(accounts::address_get(&mut tx, &t, email, id).await?);
        selected.country = selected.address.as_ref().unwrap().country.clone();
    }
    let profile: Value = r.get("profile");
    if let Some(id) = profile["defaultPaymentMethodId"].as_str() {
        selected.payment_method_id = id.into();
    }
    let (settings, _) = commerce::config(&a, &t).await?;
    c.data.checkout = Some(commerce::resolve_selection(
        selected,
        &r.get::<String, _>("group_name"),
        &settings,
    ));
    c.data.group = r.get("group_name");
    c.data.company = r.get("company");
    let new_token = uid(); // Rotate the context after authentication.
    sqlx::query("UPDATE carts SET data=$1,token=$2,revision=revision+1 WHERE id=$3")
        .bind(json!(c.data))
        .bind(&new_token)
        .bind(&c.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE customers SET first_login=coalesce(first_login,now()),last_login=now() WHERE tenant=$1 AND email=$2").bind(&t).bind(email).execute(&mut *tx).await?;
    tx.commit().await?;
    c.token = new_token;
    c.revision += 1;
    let mut result = cart_json(&a, &c).await?;
    result["customerToken"] = json!(accounts::session(&a, &t, email).await?);
    Ok(Json(result))
}
