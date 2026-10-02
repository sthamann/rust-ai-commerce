//! Login/logout and personal workspace discovery. Only hashed opaque tokens persist.
use super::*;
pub(crate) async fn issue_session(a: &App, user: &str, tenant: &str) -> Result<Value> {
    let token = format!("{}{}", uid(), uid());
    sqlx::query("INSERT INTO user_sessions(digest,user_id,default_tenant) VALUES($1,$2,$3)")
        .bind(hash(&token))
        .bind(user)
        .bind(tenant)
        .execute(&a.db)
        .await?;
    let mut value = user_data(a, user).await?;
    value["token"] = json!(token);
    value["workspace"] = json!(tenant);
    Ok(value)
}
pub(crate) async fn user_data(a: &App, user: &str) -> Result<Value> {
    let r = sqlx::query("SELECT id,email,name FROM merchant_users WHERE id=$1")
        .bind(user)
        .fetch_one(&a.db)
        .await?;
    let ms=sqlx::query("SELECT t.id,t.name,m.role FROM memberships m JOIN tenants t ON t.id=m.tenant WHERE m.user_id=$1 AND m.active ORDER BY t.name").bind(user).fetch_all(&a.db).await?;
    Ok(
        json!({"user":{"id":r.get::<String,_>("id"),"email":r.get::<String,_>("email"),"name":r.get::<String,_>("name")},"workspaces":ms.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"role":r.get::<String,_>("role")})).collect::<Vec<_>>(),"expiresIn":43200}),
    )
}
pub(crate) async fn user_login(State(a): State<App>, Json(v): Json<Value>) -> Result<Json<Value>> {
    let email = email(&v)?;
    let p = v["password"].as_str().unwrap_or("");
    if p.len() > 128 {
        return Err(bad("Invalid credential"));
    }
    let row = sqlx::query("SELECT id,password_hash FROM merchant_users WHERE email=$1")
        .bind(email)
        .fetch_optional(&a.db)
        .await?;
    let saved=row.as_ref().map(|r|r.get::<String,_>("password_hash")).unwrap_or_else(||"$argon2id$v=19$m=19456,t=2,p=1$MTIzNDU2Nzg5MDEyMzQ1Ng$lo5xAWIznNfPKgoIj+puNrTmiUVwvthCpdHQt31aaCk".into());
    if !verify_password(p.into(), saved).await? || row.is_none() {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "Invalid credentials".into(),
        ));
    }
    let user = row.unwrap().get::<String, _>("id");
    let membership = sqlx::query(
        "SELECT tenant FROM memberships WHERE user_id=$1 AND active ORDER BY tenant LIMIT 1",
    )
    .bind(&user)
    .fetch_optional(&a.db)
    .await?
    .ok_or(Error(
        StatusCode::FORBIDDEN,
        "No active workspace membership".into(),
    ))?;
    Ok(Json(
        issue_session(&a, &user, &membership.get::<String, _>("tenant")).await?,
    ))
}
pub(crate) async fn user_session(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let user = header(&h, "x-rac-user").ok_or(bad("User required"))?;
    if user == "bootstrap" {
        let rows = sqlx::query("SELECT id,name FROM tenants ORDER BY name")
            .fetch_all(&a.db)
            .await?;
        return Ok(Json(
            json!({"user":{"id":"bootstrap","email":"","name":"Instance administrator"},"workspaces":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"role":"owner"})).collect::<Vec<_>>(),"workspace":tenant(&h)?}),
        ));
    }
    let mut data = user_data(&a, user).await?;
    data["workspace"] = json!(tenant(&h)?);
    Ok(Json(data))
}
pub(crate) async fn user_logout(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    if let Some(t) = header(&h, "authorization").and_then(|v| v.strip_prefix("Bearer ")) {
        sqlx::query("DELETE FROM user_sessions WHERE digest=$1")
            .bind(hash(t))
            .execute(&a.db)
            .await?;
    }
    Ok(Json(json!({"loggedOut":true})))
}
