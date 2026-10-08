//! One-use preview handoff becomes a host-only cookie, bound to current session, membership and channel revision.
use crate::*;
use axum::response::Redirect;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .secure_route(
            "/api/automation/channels/{id}/preview",
            &[("POST", "settings.read")],
            post(create),
        )
        .route("/channel-preview/{ticket}", get(redeem))
        .route("/channel-preview/end", post(end))
}
pub(crate) fn cookie(h: &impl crate::request_context::HeaderReader) -> Option<String> {
    header(h, "cookie")?
        .split(';')
        .map(str::trim)
        .find_map(|pair| pair.strip_prefix("vendune_preview=").map(str::to_owned))
}
fn token(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit())
}
pub(crate) async fn valid(
    a: &App,
    t: &str,
    channel: &str,
    revision: i64,
    grant: &str,
    host: Option<&str>,
) -> Result<bool> {
    if !token(grant) {
        return Ok(false);
    }
    let row = sqlx::query("SELECT p.alias,m.role,m.permissions FROM channel_previews p JOIN user_sessions s ON s.digest=p.session_digest JOIN memberships m ON m.user_id=s.user_id AND m.tenant=p.tenant WHERE p.digest=$1 AND p.tenant=$2 AND p.channel=$3 AND p.channel_revision=$4 AND p.redeemed AND p.expires_at>now() AND s.expires_at>now() AND m.active")
        .bind(hash(grant)).bind(t).bind(channel).bind(revision).fetch_optional(&a.db).await?;
    let Some(row) = row else {
        return Ok(false);
    };
    let alias: Option<String> = row.get("alias");
    // Server-to-server Store API has no host mount but still proves the exact tenant/channel/revision.
    if host.is_some_and(|h| alias.as_deref() != Some(h)) {
        return Ok(false);
    }
    let mut identity = RequestContext::new();
    identity.insert(
        "x-rac-role",
        row.get::<String, _>("role")
            .parse()
            .map_err(|_| bad("Invalid membership"))?,
    );
    let permissions: Value = row.get("permissions");
    if !permissions.is_null() {
        identity.insert(
            "x-rac-permissions",
            permissions
                .to_string()
                .parse()
                .map_err(|_| bad("Invalid permissions"))?,
        );
    }
    Ok(auth::permit(&identity, "settings.read").is_ok())
}
async fn create(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    auth::permit(&h, "settings.read")?;
    let t = merchant(&a, &h)?;
    let credential = header(&h, "authorization")
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or(bad("Personal session required"))?;
    let session = hash(credential);
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM user_sessions WHERE digest=$1 AND user_id=$2 AND expires_at>now())")
        .bind(&session).bind(header(&h,"x-rac-user")).fetch_one(&a.db).await?;
    if !exists {
        return Err(bad("Personal session required for a browser preview"));
    }
    let revision: i64 =
        sqlx::query_scalar("SELECT revision FROM sales_channels WHERE tenant=$1 AND id=$2")
            .bind(&t)
            .bind(&id)
            .fetch_optional(&a.db)
            .await?
            .ok_or(Error(StatusCode::NOT_FOUND, "Channel not found".into()))?;
    let alias = v["alias"].as_str();
    let origin = if let Some(alias) = alias {
        let own: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM hosted_frontends WHERE tenant=$1 AND channel=$2 AND alias=$3)")
            .bind(&t).bind(&id).bind(alias).fetch_one(&a.db).await?;
        if !own {
            return Err(bad("Frontend does not belong to this channel"));
        }
        crate::shop_domains::links(alias)["storefrontUrl"]
            .as_str()
            .unwrap()
            .to_owned()
    } else {
        env::var("COMMERCE_PUBLIC_ORIGIN").unwrap_or_else(|_| "http://127.0.0.1:8787".into())
    };
    let ticket = format!("{}{}", uid(), uid());
    sqlx::query("DELETE FROM channel_previews WHERE expires_at<now() AND tenant=$1")
        .bind(&t)
        .execute(&a.db)
        .await?;
    sqlx::query("INSERT INTO channel_previews(digest,tenant,channel,session_digest,channel_revision,alias,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '60 seconds')")
        .bind(hash(&ticket)).bind(&t).bind(&id).bind(session).bind(revision).bind(alias).execute(&a.db).await?;
    let origin = reqwest::Url::parse(&origin).map_err(|_| bad("Invalid preview origin"))?;
    Ok(Json(
        json!({"url":format!("{}/channel-preview/{ticket}?shop={}&channel={}",origin.origin().ascii_serialization(),t,id),"expiresIn":60,"previewSeconds":900,"purchases":false}),
    ))
}
async fn redeem(
    State(a): State<App>,
    Path(ticket): Path<String>,
    request: axum::extract::Request,
) -> Result<Response> {
    let context = RequestContext::from_request(&request);
    let h = &context;
    if !token(&ticket) {
        return Err(bad("Invalid preview link"));
    }
    let t = tenant(h)?;
    let host = request
        .extensions()
        .get::<crate::shop_domains::HostShop>()
        .map(|h| h.alias.as_str());
    let grant = format!("{}{}", uid(), uid());
    // Atomic rotation makes the link one-use; session and revision are rechecked on every subsequent request.
    let row = sqlx::query("UPDATE channel_previews SET digest=$1,redeemed=true,expires_at=now()+interval '15 minutes' WHERE digest=$2 AND tenant=$3 AND channel=$4 AND NOT redeemed AND expires_at>now() AND alias IS NOT DISTINCT FROM $5::text RETURNING alias,channel")
        .bind(hash(&grant)).bind(hash(&ticket)).bind(&t).bind(super::channel_id(h)).bind(host).fetch_optional(&a.db).await?
        .ok_or(Error(StatusCode::UNAUTHORIZED,"Preview link expired or already used".into()))?;
    let alias: Option<String> = row.get("alias");
    let target = if alias.is_some() {
        "/?preview=1".to_owned()
    } else {
        format!(
            "/?shop={t}&preview=1&channel={}",
            row.get::<String, _>("channel")
        )
    };
    let mut response = Redirect::to(&target).into_response();
    let secure = if env::var("COMMERCE_PUBLIC_ORIGIN")
        .unwrap_or_default()
        .starts_with("https://")
    {
        "; Secure"
    } else {
        ""
    };
    response.headers_mut().insert(
        "set-cookie",
        format!("vendune_preview={grant}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900{secure}")
            .parse()
            .unwrap(),
    );
    response
        .headers_mut()
        .insert("cache-control", "private, no-store".parse().unwrap());
    response
        .headers_mut()
        .insert("referrer-policy", "no-referrer".parse().unwrap());
    Ok(response)
}

async fn end() -> Response {
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        "set-cookie",
        "vendune_preview=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
            .parse()
            .unwrap(),
    );
    response
        .headers_mut()
        .insert("cache-control", "private, no-store".parse().unwrap());
    response
}
