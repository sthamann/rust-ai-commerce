//! Expiring API/MCP keys are bounded to one workspace and intersect their creator's current membership.
use super::{permit, validate_permissions};
use crate::{
    App, Error, Json, Path, RequestContext, Result, State, StatusCode, bad, hash, header, merchant,
    uid,
};
use serde_json::{Value, json};
use sqlx::Row;
#[derive(serde::Deserialize)]
pub(crate) struct Member {
    pub tenant: String,
    pub role: String,
    pub permissions: Value,
}
pub(crate) struct Identity {
    pub user: String,
    pub default: String,
    pub scopes: Option<Vec<String>>,
    pub app: Option<String>,
    pub app_permissions: Option<Value>,
    pub tenant: Option<String>,
    pub parent: Option<String>,
    pub preview_owner: Option<String>,
    pub preview_valid: Option<bool>,
    pub status: Option<String>,
    pub members: Vec<Member>,
    pub channel: Option<crate::performance::access_snapshot::ChannelSnapshot>,
}
pub(crate) async fn resolve_identity(
    a: &App,
    token: &str,
    selected: Option<&str>,
) -> Result<Identity> {
    resolve_identity_channel(a, token, selected, None).await
}
pub(crate) async fn resolve_identity_channel(
    a: &App,
    token: &str,
    selected: Option<&str>,
    channel: Option<&str>,
) -> Result<Identity> {
    let r = sqlx::query(include_str!("identity.sql"))
        .bind(hash(token))
        .bind(selected)
        .bind(channel)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(
            StatusCode::UNAUTHORIZED,
            "Session or integration key expired or invalid".into(),
        ))?;
    let scopes: Option<Value> = r.get("scopes");
    Ok(Identity {
        user: r.get("user_id"),
        app: r.get("app_id"),
        app_permissions: r.get("app_permissions"),
        default: r.get("default_tenant"),
        tenant: r.get("tenant"),
        parent: r.get("parent"),
        preview_owner: r.get("preview_owner"),
        preview_valid: r.get("preview_valid"),
        status: r.get("status"),
        channel: r.get::<Option<Value>, _>("channel_data").map(|data| {
            crate::performance::access_snapshot::ChannelSnapshot {
                data,
                revision: r.get("channel_revision"),
            }
        }),
        scopes: scopes
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| bad("Invalid integration scopes"))?,
        members: serde_json::from_value(r.get("memberships"))
            .map_err(|_| bad("Invalid membership grants"))?,
    })
}
pub(crate) async fn resolve_credential(
    a: &App,
    token: &str,
) -> Result<(String, String, Option<Vec<String>>)> {
    let identity = resolve_identity(a, token, None).await?;
    Ok((identity.user, identity.default, identity.scopes))
}
pub(crate) async fn integration_list(
    State(a): State<App>,
    h: RequestContext,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    permit(&h, "users")?;
    let rows=sqlx::query("SELECT id,name,user_id,app_id,permissions,created_at::text AS created,expires_at::text AS expires FROM integration_keys WHERE tenant=$1 ORDER BY created_at DESC LIMIT 100").bind(t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"name":r.get::<String,_>("name"),"userId":r.get::<String,_>("user_id"),"appId":r.get::<Option<String>,_>("app_id"),"permissions":r.get::<Value,_>("permissions"),"createdAt":r.get::<String,_>("created"),"expiresAt":r.get::<String,_>("expires")})).collect::<Vec<_>>()}),
    ))
}
pub(crate) async fn integration_create(
    State(a): State<App>,
    h: RequestContext,
    Json(input): Json<super::dto::Integration>,
) -> Result<Json<Value>> {
    let v = json!(input);
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
    h: RequestContext,
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
