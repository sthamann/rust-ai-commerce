//! Expiring API/MCP keys are bounded to one workspace and intersect their creator's current membership.
use super::*;
pub(crate) async fn resolve_credential(
    a: &App,
    token: &str,
) -> Result<(String, String, Option<Vec<String>>)> {
    if let Some(r) = sqlx::query(
        "SELECT user_id,default_tenant FROM user_sessions WHERE digest=$1 AND expires_at>now()",
    )
    .bind(hash(token))
    .fetch_optional(&a.db)
    .await?
    {
        return Ok((r.get("user_id"), r.get("default_tenant"), None));
    }
    let r=sqlx::query("SELECT user_id,tenant,permissions FROM integration_keys WHERE digest=$1 AND expires_at>now()").bind(hash(token)).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::UNAUTHORIZED,"Session or integration key expired or invalid".into()))?;
    let v: Value = r.get("permissions");
    let scopes = serde_json::from_value(v).map_err(|_| bad("Invalid integration scopes"))?;
    Ok((r.get("user_id"), r.get("tenant"), Some(scopes)))
}
pub(crate) async fn integration_list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    permit(&h, "users")?;
    let rows=sqlx::query("SELECT id,name,user_id,permissions,created_at::text AS created,expires_at::text AS expires FROM integration_keys WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"userId":r.get::<String,_>("user_id"),"permissions":r.get::<Value,_>("permissions"),"createdAt":r.get::<String,_>("created"),"expiresAt":r.get::<String,_>("expires")})).collect::<Vec<_>>()}),
    ))
}
pub(crate) async fn integration_create(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    permit(&h, "users")?;
    if header(&h, "x-rac-user") == Some("bootstrap") {
        return Err(bad("Personal account required for an integration key"));
    }
    let permissions = validate_permissions(&h, &v["permissions"])?;
    if permissions.as_array().is_none_or(|v| v.is_empty()) {
        return Err(bad("Explicit integration permissions required"));
    }
    let name = v["name"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 100)
        .ok_or(bad("Integration name required"))?;
    let days = v["expiresInDays"]
        .as_i64()
        .filter(|v| (1..=90).contains(v))
        .ok_or(bad("Integration expiry must be 1..90 days"))?;
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE")
        .bind(&t)
        .fetch_one(&mut *tx)
        .await?;
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM integration_keys WHERE tenant=$1 AND expires_at>now()",
    )
    .bind(&t)
    .fetch_one(&mut *tx)
    .await?;
    if count >= 32 {
        return Err(bad("Maximum 32 active integration keys"));
    }
    let id = uid();
    let key = format!("rac_{}{}", uid(), uid());
    sqlx::query("INSERT INTO integration_keys(id,tenant,user_id,digest,name,permissions,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7*interval '1 day')").bind(&id).bind(&t).bind(header(&h,"x-rac-user").unwrap()).bind(hash(&key)).bind(name).bind(permissions).bind(days as i32).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id,"key":key,"workspace":t})))
}
pub(crate) async fn integration_revoke(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    permit(&h, "users")?;
    sqlx::query("DELETE FROM integration_keys WHERE tenant=$1 AND id=$2")
        .bind(t)
        .bind(id)
        .execute(&a.db)
        .await?;
    Ok(Json(json!({"revoked":true})))
}
