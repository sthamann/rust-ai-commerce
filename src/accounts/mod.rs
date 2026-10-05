//! Independent customer sessions, profile/password management and owning-account order history.
use crate::*;
mod address_store;
mod addresses;
mod contacts;
mod metadata;
pub(crate) use metadata::decorate;
mod demo;
mod order_snapshot;
mod profile;
pub(crate) use address_store::*;
pub(crate) use contacts::*;
pub(crate) use demo::seed_address as seed_demo_address;
pub(crate) use order_snapshot::snapshot as order_snapshot;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/store-api/account/register", post(register))
        .route(
            "/store-api/account/addresses",
            get(addresses::list).post(addresses::create),
        )
        .route(
            "/store-api/account/addresses/{id}",
            axum::routing::put(addresses::save).delete(addresses::remove),
        )
        .route(
            "/store-api/account/profile",
            get(profile::get).put(profile::save),
        )
        .route("/store-api/account/orders", get(orders))
        .route("/store-api/account/logout", post(logout))
        .route("/store-api/account/password", post(profile::password))
}
pub(crate) async fn session(a: &App, t: &str, email: &str) -> Result<String> {
    let token = uid();
    sqlx::query("INSERT INTO customer_sessions(digest,tenant,email) VALUES($1,$2,$3)")
        .bind(hash(&token))
        .bind(t)
        .bind(email)
        .execute(&a.db)
        .await?;
    Ok(token)
}
pub(crate) async fn identity(a: &App, h: &HeaderMap) -> Result<(String, String)> {
    let t = tenant(h)?;
    let token = header(h, "x-customer-token").ok_or(Error(
        StatusCode::UNAUTHORIZED,
        "Customer login required".into(),
    ))?;
    let email: Option<String> = sqlx::query_scalar(
        "SELECT s.email FROM customer_sessions s JOIN customers c ON c.tenant=s.tenant AND c.email=s.email WHERE s.tenant=$1 AND s.digest=$2 AND s.expires_at>now() AND c.active",
    )
    .bind(&t)
    .bind(hash(token))
    .fetch_optional(&a.db)
    .await?;
    Ok((
        t,
        email.ok_or(Error(
            StatusCode::UNAUTHORIZED,
            "Customer session expired".into(),
        ))?,
    ))
}
async fn register(State(a): State<App>, h: HeaderMap, Json(v): Json<Value>) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let email = auth::email(&v)?;
    let name = auth::name(&v)?;
    let password = auth::hash_password(auth::password(&v)?).await?;
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1)")
        .bind(&t)
        .fetch_one(&a.db)
        .await?;
    if !exists {
        return Err(bad("Unknown shop"));
    }
    let mut contact:Contact=serde_json::from_value(json!({"name":name,"firstName":v["firstName"].as_str().unwrap_or(""),"lastName":v["lastName"].as_str().unwrap_or(""),"company":v["company"].as_str().unwrap_or(""),"phoneNumber":v["phoneNumber"].as_str().unwrap_or("")})).map_err(|_|bad("Invalid customer contact"))?;
    contact.validate()?;
    let mut initial = Vec::new();
    let (settings, _) = commerce::config(&a, &t).await?;
    for field in ["billingAddress", "shippingAddress"] {
        if !v[field].is_null() {
            let mut ad: commerce::Address = serde_json::from_value(v[field].clone())
                .map_err(|_| bad("Invalid registration address"))?;
            ad.validate()?;
            commerce::validate_address_geography(&ad, &settings)?;
            if !settings.countries.contains(&ad.country) {
                return Err(bad("Address country unavailable"));
            }
            initial.push((field, ad));
        }
    }
    let mut tx = a.db.begin().await?;
    let n=sqlx::query("INSERT INTO customers(tenant,email,password_hash,profile) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(&t).bind(&email).bind(password).bind(json!(contact)).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Account already exists"));
    }
    for (field, ad) in initial {
        address_save_conn(&mut tx,&t,&email,None,&json!({"defaultBilling":field=="billingAddress","defaultShipping":field=="shippingAddress"}),&ad).await?;
    }
    let locale = language_context(&a, &h).await?.0;
    let channel = marketing::channel_id(&h);
    marketing::channel(&a, &t, channel, &locale).await?;
    sqlx::query(
        "UPDATE customers SET language_id=$1,sales_channel_id=$2,company=NULLIF($5,'') WHERE tenant=$3 AND email=$4",
    )
    .bind(locale)
    .bind(channel)
    .bind(&t)
    .bind(&email)
    .bind(&contact.company)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"customerToken":session(&a,&t,&email).await?,"email":email}),
    ))
}
async fn orders(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (t, email) = identity(&a, &h).await?;
    let rows=sqlx::query("SELECT o.data #- '{cart,token}' AS data,o.created_at::text AS time FROM orders o JOIN carts c ON c.id=o.cart_id AND c.tenant=o.tenant WHERE o.tenant=$1 AND ((o.data->'orderCustomer'->>'customerId')=(SELECT id FROM customers WHERE tenant=o.tenant AND email=$2) OR (NOT o.data ? 'orderCustomer' AND c.data->>'email'=$2)) ORDER BY o.created_at DESC LIMIT 100").bind(t).bind(email).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r|{let mut v:Value=r.get("data");commerce::order_fields(&mut v);v["createdAt"]=json!(r.get::<String,_>("time"));v}).collect::<Vec<_>>() }),
    ))
}
async fn logout(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (t, _) = identity(&a, &h).await?;
    sqlx::query("DELETE FROM customer_sessions WHERE tenant=$1 AND digest=$2")
        .bind(&t)
        .bind(hash(header(&h, "x-customer-token").unwrap()))
        .execute(&a.db)
        .await?;
    if let Some(token) = header(&h, "sw-context-token") {
        sqlx::query("UPDATE carts SET data=jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,'{email}','null'),'{customer_id}','null'),'{group}','\"consumer\"'),'{company}','null'),token=$1,revision=revision+1 WHERE tenant=$2 AND token=$3 AND status='open'").bind(uid()).bind(&t).bind(token).execute(&a.db).await?;
    }
    Ok(Json(json!({"loggedOut":true})))
}
