//! Independent platform authorization: live personal sessions, current grants, no integration/bootstrap escalation.
use crate::*;
pub(crate) async fn authenticate(a: &App, h: &HeaderMap) -> Result<String> {
    let token = header(h, "authorization")
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or(Error(
            StatusCode::UNAUTHORIZED,
            "Personal operator login required".into(),
        ))?;
    let (user, _, scopes) = auth::resolve_credential(a, token).await?;
    let active: Option<bool> =
        sqlx::query_scalar("SELECT active FROM platform_operators WHERE user_id=$1")
            .bind(&user)
            .fetch_optional(&a.db)
            .await?;
    if !verified_kernel::platform_admissible(
        scopes.is_none() && token != *a.token,
        active.is_some(),
        active.unwrap_or(false),
    ) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Platform operator access required".into(),
        ));
    }
    Ok(user)
}
pub(super) fn actor(h: &HeaderMap) -> Result<&str> {
    header(h, "x-rac-platform-user")
        .ok_or(Error(StatusCode::UNAUTHORIZED, "Operator required".into()))
}
