//! Single-use, expiring invitations. Acceptance verifies an existing account password.
use super::{
    SCOPES, allowed, email, hash_password, issue_session, name, password, permit, role_allowed,
    verify_password,
};
use crate::{
    App, Error, Json, RequestContext, Result, Row, State, StatusCode, Value, bad, hash, header,
    json, merchant, uid,
};

pub(crate) async fn invite_user(
    State(a): State<App>,
    h: RequestContext,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    permit(&h, "users")?;
    let role = v["role"].as_str().unwrap_or("viewer");
    let actor_role = if header(&h, "x-rac-role") == Some("owner") {
        "owner"
    } else {
        "admin"
    };
    if !role_allowed(actor_role, role) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Cannot assign this role".into(),
        ));
    }
    let mut defaults = RequestContext::new();
    defaults.insert("x-rac-role", role.parse().unwrap());
    if SCOPES
        .iter()
        .any(|s| allowed(&defaults, s) && !allowed(&h, s))
    {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Cannot delegate broader role defaults".into(),
        ));
    }
    let email = email(&v)?;
    let token = format!("{}{}", uid(), uid());
    let id = uid();
    sqlx::query("INSERT INTO user_invites(id,digest,tenant,email,role,created_by) VALUES($1,$2,$3,$4,$5,$6)").bind(&id).bind(hash(&token)).bind(&t).bind(email).bind(role).bind(header(&h,"x-rac-user").unwrap()).execute(&a.db).await?;
    Ok(Json(
        json!({"id":id,"token":token,"role":role,"workspace":t,"expiresIn":86400,"emailSent":false}),
    ))
}
pub(crate) async fn accept_invite(
    State(a): State<App>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let token = v["invitationToken"]
        .as_str()
        .filter(|s| s.len() == 64)
        .ok_or(bad("Invitation token required"))?;
    let password = password(&v)?;
    let name = name(&v)?;
    let mut tx = a.db.begin().await?;
    let invite=sqlx::query("SELECT * FROM user_invites WHERE digest=$1 AND redeemed_at IS NULL AND expires_at>now() FOR UPDATE").bind(hash(token)).fetch_optional(&mut *tx).await?.ok_or(Error(StatusCode::NOT_FOUND,"Invitation expired or redeemed".into()))?;
    let email = invite.get::<String, _>("email");
    let tenant = invite.get::<String, _>("tenant");
    let creator: String = invite.get("created_by");
    if creator != "bootstrap" {
        let member = sqlx::query(
            "SELECT role,permissions FROM memberships WHERE tenant=$1 AND user_id=$2 AND active",
        )
        .bind(&tenant)
        .bind(creator)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(
            StatusCode::FORBIDDEN,
            "Invitation creator lost access".into(),
        ))?;
        let mut actor = RequestContext::new();
        actor.insert(
            "x-rac-role",
            member.get::<String, _>("role").parse().unwrap(),
        );
        let scopes: Value = member.get("permissions");
        if !scopes.is_null() {
            actor.insert("x-rac-permissions", scopes.to_string().parse().unwrap());
        }
        permit(&actor, "users")?;
        let mut defaults = RequestContext::new();
        defaults.insert(
            "x-rac-role",
            invite.get::<String, _>("role").parse().unwrap(),
        );
        if SCOPES
            .iter()
            .any(|s| allowed(&defaults, s) && !allowed(&actor, s))
        {
            return Err(Error(
                StatusCode::FORBIDDEN,
                "Invitation creator cannot grant this role".into(),
            ));
        }
    }
    let existing = sqlx::query("SELECT id,password_hash FROM merchant_users WHERE email=$1")
        .bind(&email)
        .fetch_optional(&mut *tx)
        .await?;
    let user = if let Some(existing) = existing {
        if !verify_password(password, existing.get("password_hash")).await? {
            return Err(Error(
                StatusCode::UNAUTHORIZED,
                "Existing account password required".into(),
            ));
        }
        existing.get::<String, _>("id")
    } else {
        let user = uid();
        let saved = hash_password(password).await?;
        sqlx::query("INSERT INTO merchant_users(id,email,name,password_hash) VALUES($1,$2,$3,$4)")
            .bind(&user)
            .bind(&email)
            .bind(name)
            .bind(saved)
            .execute(&mut *tx)
            .await?;
        user
    };
    // Existing membership cannot be escalated or demoted by redeeming an older invitation.
    sqlx::query(
        "INSERT INTO memberships(user_id,tenant,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    )
    .bind(&user)
    .bind(&tenant)
    .bind(invite.get::<String, _>("role"))
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE user_invites SET redeemed_at=now() WHERE id=$1")
        .bind(invite.get::<String, _>("id"))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(issue_session(&a, &user, &tenant).await?))
}
