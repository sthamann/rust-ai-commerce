//! Fine-grained workspace overrides. Owners retain control; delegates cannot grant rights they lack.
use super::*;
pub(crate) const SCOPES: &[&str] = &[
    "catalog.read",
    "catalog.write",
    "orders.read",
    "orders.write",
    "customers.read",
    "customers.write",
    "documents.read",
    "documents.create",
    "payments.read",
    "payments.manage",
    "team.manage",
    "settings.read",
    "settings.write",
    "apps.manage",
    "knowledge.read",
];
pub(crate) fn scope(kind: &str) -> &str {
    match kind {
        "catalog" => "catalog.write",
        "users" => "team.manage",
        "operations" => "orders.write",
        "settings" => "settings.write",
        "extension" => "apps.manage",
        x => x,
    }
}
pub(crate) fn allowed(h: &HeaderMap, kind: &str) -> bool {
    let role = header(h, "x-rac-role").unwrap_or("");
    if role == "owner" {
        return SCOPES.contains(&scope(kind)) || kind == "read";
    }
    if kind == "read" {
        return !role.is_empty();
    }
    if let Some(raw) = header(h, "x-rac-permissions") {
        return serde_json::from_str::<Vec<String>>(raw)
            .is_ok_and(|v| v.iter().any(|x| x == scope(kind)));
    }
    match scope(kind) {
        "catalog.read" | "orders.read" | "payments.read" | "settings.read" | "knowledge.read" => {
            !role.is_empty()
        }
        "catalog.write" => ["admin", "editor"].contains(&role),
        x if SCOPES.contains(&x) => role == "admin",
        _ => false,
    }
}
pub(crate) fn validate_permissions(h: &HeaderMap, v: &Value) -> Result<Value> {
    if v.is_null() {
        return Ok(Value::Null);
    }
    let values = v
        .as_array()
        .filter(|x| x.len() <= SCOPES.len())
        .ok_or(bad("Invalid permission list"))?;
    for x in values {
        let x = x.as_str().ok_or(bad("Invalid permission"))?;
        if !SCOPES.contains(&x) {
            return Err(bad("Unknown permission"));
        }
        if !allowed(h, x) {
            return Err(Error(
                StatusCode::FORBIDDEN,
                "Cannot delegate a permission you do not hold".into(),
            ));
        }
    }
    Ok(v.clone())
}
pub(crate) async fn access(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    Ok(Json(
        json!({"permissions":SCOPES.iter().filter(|s|allowed(&h,s)).collect::<Vec<_>>(),"available":SCOPES}),
    ))
}
pub(crate) async fn sessions(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    let user = header(&h, "x-rac-user").unwrap();
    let rows=sqlx::query("SELECT digest,created_at::text AS created,expires_at::text AS expires FROM user_sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 100").bind(user).fetch_all(&a.db).await?;
    let current = header(&h, "authorization")
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(hash);
    Ok(Json(
        json!({"sessions":rows.iter().map(|r|{let id:String=r.get("digest");json!({"id":id,"current":current.as_ref()==Some(&id),"createdAt":r.get::<String,_>("created"),"expiresAt":r.get::<String,_>("expires")})}).collect::<Vec<_>>()}),
    ))
}
pub(crate) async fn revoke_session(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    sqlx::query("DELETE FROM user_sessions WHERE user_id=$1 AND digest=$2")
        .bind(header(&h, "x-rac-user").unwrap())
        .bind(id)
        .execute(&a.db)
        .await?;
    Ok(Json(json!({"revoked":true})))
}
pub(crate) async fn revoke_invite(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    permit(&h, "users")?;
    sqlx::query("UPDATE user_invites SET redeemed_at=now() WHERE tenant=$1 AND id=$2 AND redeemed_at IS NULL").bind(t).bind(id).execute(&a.db).await?;
    Ok(Json(json!({"revoked":true})))
}
