//! Customer-bound, short-lived provider UI sessions; iframe messages are never ledger receipts.
use super::{attempt, customer, generic_receipts, remote};
use crate::{
    App, Error, Json, Path, RequestContext, Result, State, StatusCode, Value, bad, conflict, env,
    json, tenant, uid,
};

pub(crate) async fn session(
    State(a): State<App>,
    h: RequestContext,
    Path(id): Path<String>,
    axum::extract::Query(input): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Value>> {
    customer(&a, &h, &id).await?;
    let t = tenant(&h)?;
    let row = sqlx::query("SELECT * FROM payment_attempts WHERE tenant=$1 AND id=$2")
        .bind(&t)
        .bind(&id)
        .fetch_one(&a.db)
        .await?;
    let p = attempt(&row);
    if p.provider == "paypal"
        || p.context["checkout"] != "embedded"
        || !["ready", "approved"].contains(&p.state.as_str())
    {
        return Err(conflict("Embedded payment is not available in this state"));
    }
    let parent = origin(
        &a,
        &t,
        p.context["channel"].as_str().unwrap_or("default"),
        input.get("parentOrigin").map(String::as_str),
    )
    .await?;
    let nonce = uid();
    let v = remote::execute(
        &a,
        &p,
        "checkout_session",
        &nonce,
        &json!({"nonce":nonce,"parentOrigin":parent}),
    )
    .await?;
    generic_receipts::identity(&p, &v)?;
    let url = remote::approval_url(&p, &v["uiUrl"])?.ok_or(bad("Checkout UI URL required"))?;
    if reqwest::Url::parse(&url)
        .map_err(|_| bad("Invalid checkout origin"))?
        .origin()
        == reqwest::Url::parse(&parent)
            .map_err(|_| bad("Invalid commerce origin"))?
            .origin()
    {
        return Err(bad("Provider UI must use a separate origin"));
    }
    let token = v["sessionToken"]
        .as_str()
        .filter(|s| s.len() >= 24 && s.len() <= 2048)
        .ok_or(bad("Bounded checkout session token required"))?;
    let ttl = v["expiresIn"]
        .as_u64()
        .filter(|n| *n > 0 && *n <= 600)
        .ok_or(bad("Short-lived checkout session required"))?;
    if v["nonce"] != nonce {
        return Err(bad("Checkout session nonce mismatch"));
    }
    Ok(Json(
        json!({"uiUrl":url,"sessionToken":token,"nonce":nonce,"expiresIn":ttl}),
    ))
}

/// Browser origins are accepted only from operator configuration or the tenant's owned channel address.
pub(crate) async fn origin(
    a: &App,
    t: &str,
    channel: &str,
    requested: Option<&str>,
) -> Result<String> {
    let mut tx = a.db.begin().await?;
    origin_conn(&mut tx, t, channel, requested).await
}
pub(crate) async fn origin_conn(
    conn: &mut sqlx::PgConnection,
    t: &str,
    channel: &str,
    requested: Option<&str>,
) -> Result<String> {
    let core = env::var("COMMERCE_PUBLIC_ORIGIN")
        .or_else(|_| env::var("PUBLIC_BASE_URL"))
        .unwrap_or("http://127.0.0.1:8787".into());
    let supplied = requested.unwrap_or(&core);
    let u = reqwest::Url::parse(supplied).map_err(|_| bad("Invalid checkout parent origin"))?;
    let normalized = u.origin().ascii_serialization();
    if !["http", "https"].contains(&u.scheme())
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
    {
        return Err(bad("Checkout parent must be an origin"));
    }
    if reqwest::Url::parse(&core).is_ok_and(|c| c.origin() == u.origin()) {
        return Ok(normalized);
    }
    if u.scheme() == "https"
        && u.port().is_none()
        && let Ok(suffix) = env::var("SHOP_DOMAIN_SUFFIX")
    {
        let host = u.host_str().unwrap_or("");
        if host == format!("{t}.{suffix}") {
            return Ok(normalized);
        }
        if let Some(alias) = host.strip_suffix(&format!(".{suffix}")) {
            let owned: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM hosted_frontends WHERE tenant=$1 AND channel=$2 AND alias=$3)").bind(t).bind(channel).bind(alias).fetch_one(conn).await?;
            if owned {
                return Ok(normalized);
            }
        }
    }
    Err(Error(
        StatusCode::FORBIDDEN,
        "Checkout origin does not belong to this shop/channel".into(),
    ))
}
