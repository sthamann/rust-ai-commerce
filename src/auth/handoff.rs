//! One-time personal-session handoff to the Studio; no passwords or bearer tokens in links.
use super::*;
pub(crate) async fn create(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    permit(&h, "read")?;
    let user = header(&h, "x-rac-user")
        .filter(|u| *u != "bootstrap")
        .ok_or(bad("Personal account required"))?;
    let initialized: bool =
        sqlx::query_scalar("SELECT password_initialized FROM merchant_users WHERE id=$1")
            .bind(user)
            .fetch_one(&a.db)
            .await?;
    if !initialized {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Merchant password setup required".into(),
        ));
    }
    let ticket = format!("{}{}", uid(), uid());
    sqlx::query("DELETE FROM merchant_handoffs WHERE expires_at<now()")
        .execute(&a.db)
        .await?;
    sqlx::query("INSERT INTO merchant_handoffs(digest,user_id,tenant,expires_at) VALUES($1,$2,$3,now()+interval '60 seconds')")
        .bind(hash(&ticket)).bind(user).bind(tenant(&h)?).execute(&a.db).await?;
    Ok(Json(json!({"ticket":ticket,"expiresIn":60})))
}
pub(crate) async fn redeem(State(a): State<App>, Json(v): Json<Value>) -> Result<Json<Value>> {
    let ticket = v["ticket"]
        .as_str()
        .filter(|s| s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit()))
        .ok_or(bad("Invalid login link"))?;
    let row=sqlx::query("DELETE FROM merchant_handoffs WHERE digest=$1 AND expires_at>now() RETURNING user_id,tenant")
        .bind(hash(ticket)).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::UNAUTHORIZED,"Login link expired or already used".into()))?;
    let user: String = row.get("user_id");
    let tenant: String = row.get("tenant");
    let active: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM memberships m JOIN merchant_users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.tenant=$2 AND m.active AND u.password_initialized)",
    )
    .bind(&user)
    .bind(&tenant)
    .fetch_one(&a.db)
    .await?;
    if !active {
        return Err(Error(StatusCode::FORBIDDEN, "Shop access revoked".into()));
    }
    Ok(Json(issue_session(&a, &user, &tenant).await?))
}
