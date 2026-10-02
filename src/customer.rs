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
    let r = sqlx::query("SELECT * FROM customers WHERE tenant=$1 AND email=$2")
        .bind(&t)
        .bind(email)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(
            StatusCode::UNAUTHORIZED,
            "Invalid credentials".into(),
        ))?;
    // Demo account only; production registration and credential lifecycle are not implemented.
    let saved = r.get::<String, _>("password_hash");
    let parsed = PasswordHash::new(&saved).map_err(|_| bad("Invalid stored credential"))?;
    if Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_err()
    {
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
    c.data.group = r.get("group_name");
    c.data.company = r.get("company");
    let new_token = uid(); // Rotate the context after authentication.
    sqlx::query("UPDATE carts SET data=$1,token=$2,revision=revision+1 WHERE id=$3")
        .bind(json!(c.data))
        .bind(&new_token)
        .bind(&c.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    c.token = new_token;
    c.revision += 1;
    Ok(Json(cart_json(&a, &c).await?))
}
