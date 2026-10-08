//! Explicit password setup/recovery or existing-password verification from a trusted, verified-email broker.
//! No public reset-by-email endpoint: assertions bind route, identity, shop, action, expiry and one-use nonce.
use super::{broker, email, hash_password, issue_session, password, verify_password};
use crate::{App, Error, Json, Result, Row, State, StatusCode, Value, bad, validate_tenant};

pub(crate) async fn credentials(State(a): State<App>, Json(v): Json<Value>) -> Result<Json<Value>> {
    let c = broker::assertion(&a, "/api/identity/credentials", &v).await?;
    let action = c["action"]
        .as_str()
        .ok_or(bad("Credential action required"))?;
    if !["set-password", "verify-password"].contains(&action) {
        return Err(bad("Unsupported credential action"));
    }
    let secret = password(&c)?;
    let shop = c["workspaceId"].as_str().ok_or(bad("Shop ID required"))?;
    validate_tenant(shop)?;
    let mut tx = a.db.begin().await?;
    // Lock the canonical account; linked identity, email and active ownership must all match.
    let row = sqlx::query("SELECT u.id,u.password_hash FROM merchant_users u JOIN merchant_identities i ON i.user_id=u.id JOIN memberships m ON m.user_id=u.id WHERE i.issuer=$1 AND i.subject=$2 AND u.email=$3 AND m.tenant=$4 AND m.active AND m.role='owner' FOR UPDATE OF u")
        .bind(c["iss"].as_str().unwrap()).bind(c["sub"].as_str().unwrap())
        .bind(email(&c)?).bind(shop).fetch_optional(&mut *tx).await?
        .ok_or(Error(StatusCode::UNAUTHORIZED, "Merchant identity unavailable".into()))?;
    let user: String = row.get("id");
    if action == "verify-password" {
        if !verify_password(secret, row.get("password_hash")).await? {
            return Err(Error(
                StatusCode::UNAUTHORIZED,
                "Invalid credentials".into(),
            ));
        }
    } else {
        let saved = hash_password(secret).await?;
        sqlx::query(
            "UPDATE merchant_users SET password_hash=$1,password_initialized=true WHERE id=$2",
        )
        .bind(saved)
        .bind(&user)
        .execute(&mut *tx)
        .await?;
        // Password recovery also invalidates older Studio sessions and unredeemed handoffs.
        sqlx::query("DELETE FROM user_sessions WHERE user_id=$1")
            .bind(&user)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM merchant_handoffs WHERE user_id=$1")
            .bind(&user)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(issue_session(&a, &user, shop).await?))
}
