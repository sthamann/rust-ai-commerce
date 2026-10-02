//! Workspace member visibility and immediately effective role/revocation changes.
use super::*;
pub(crate) async fn members(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let tenant = merchant(&a, &h)?;
    permit(&h, "users")?;
    let rows=sqlx::query("SELECT u.id,u.name,u.email,m.role,m.active,m.permissions FROM memberships m JOIN merchant_users u ON u.id=m.user_id WHERE m.tenant=$1 ORDER BY u.name").bind(&tenant).fetch_all(&a.db).await?;
    let invites=sqlx::query("SELECT id,email,role,expires_at::text AS expires FROM user_invites WHERE tenant=$1 AND redeemed_at IS NULL AND expires_at>now() ORDER BY expires_at").bind(&tenant).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"members":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"email":r.get::<String,_>("email"),"role":r.get::<String,_>("role"),"active":r.get::<bool,_>("active"),"permissions":r.get::<Value,_>("permissions")})).collect::<Vec<_>>(),"invitations":invites.iter().map(|r|json!({"id":r.get::<String,_>("id"),"email":r.get::<String,_>("email"),"role":r.get::<String,_>("role"),"expires":r.get::<String,_>("expires")})).collect::<Vec<_>>()}),
    ))
}
pub(crate) async fn update_member(
    State(a): State<App>,
    h: HeaderMap,
    Path(user): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    permit(&h, "users")?;
    let role = v["role"].as_str().ok_or(bad("Role required"))?;
    let active = v["active"]
        .as_bool()
        .ok_or(bad("Active boolean required"))?;
    let actor = if header(&h, "x-rac-role") == Some("owner") {
        "owner"
    } else {
        "admin"
    };
    if !role_allowed(actor, role) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Cannot assign this role".into(),
        ));
    }
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE")
        .bind(&t)
        .fetch_one(&mut *tx)
        .await?;
    let old = sqlx::query(
        "SELECT role,active,permissions FROM memberships WHERE tenant=$1 AND user_id=$2",
    )
    .bind(&t)
    .bind(&user)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(Error(StatusCode::NOT_FOUND, "Member not found".into()))?;
    if old.get::<String, _>("role") == "owner" {
        if actor != "owner" {
            return Err(Error(
                StatusCode::FORBIDDEN,
                "Only an owner can change an owner".into(),
            ));
        }
        if old.get::<bool, _>("active") && (!active || role != "owner") {
            let owners: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM memberships WHERE tenant=$1 AND role='owner' AND active",
            )
            .bind(&t)
            .fetch_one(&mut *tx)
            .await?;
            if owners <= 1 {
                return Err(conflict(
                    "The last active owner cannot be removed or demoted",
                ));
            }
        }
    }
    let permissions = if v.get("permissions").is_some() {
        validate_permissions(&h, &v["permissions"])?
    } else {
        old.get("permissions")
    };
    if permissions.is_null() && header(&h, "x-rac-permissions").is_some() {
        let mut defaults = HeaderMap::new();
        defaults.insert("x-rac-role", role.parse().unwrap());
        for scope in SCOPES {
            if allowed(&defaults, scope) && !allowed(&h, scope) {
                return Err(Error(
                    StatusCode::FORBIDDEN,
                    "Cannot delegate broader role defaults".into(),
                ));
            }
        }
    }
    if role == "owner" && !permissions.is_null() {
        return Err(bad("Owner permissions cannot be restricted"));
    }
    sqlx::query(
        "UPDATE memberships SET role=$1,active=$2,permissions=$5 WHERE tenant=$3 AND user_id=$4",
    )
    .bind(role)
    .bind(active)
    .bind(&t)
    .bind(&user)
    .bind(&permissions)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'membership.updated',$2)")
        .bind(t)
        .bind(json!({"actor":header(&h,"x-rac-user"),"subject":user,"role":role,"active":active,"permissions":permissions,"previousRole":old.get::<String,_>("role"),"previousActive":old.get::<bool,_>("active")}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"updated":true})))
}
