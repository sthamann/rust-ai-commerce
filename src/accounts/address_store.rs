//! Tenant-owned address persistence, optimistic revisions and atomic default assignment.
use crate::*;
pub(crate) async fn address_list(a: &App, t: &str, email: &str) -> Result<Value> {
    let rows=sqlx::query("SELECT id,data,revision FROM customer_addresses WHERE tenant=$1 AND email=$2 ORDER BY created_at,id LIMIT 100").bind(t).bind(email).fetch_all(&a.db).await?;
    let r=sqlx::query("SELECT default_billing_address_id,default_shipping_address_id,revision FROM customers WHERE tenant=$1 AND email=$2").bind(t).bind(email).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Customer not found".into()))?;
    Ok(
        json!({"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"revision":r.get::<i64,_>("revision"),"address":r.get::<Value,_>("data")})).collect::<Vec<_>>(),"defaultBillingAddressId":r.get::<Option<String>,_>("default_billing_address_id"),"defaultShippingAddressId":r.get::<Option<String>,_>("default_shipping_address_id"),"customerRevision":r.get::<i64,_>("revision")}),
    )
}
pub(crate) async fn address_save(
    a: &App,
    t: &str,
    email: &str,
    id: Option<&str>,
    v: &Value,
    h: &HeaderMap,
) -> Result<Value> {
    let mut address: commerce::Address =
        serde_json::from_value(v["address"].clone()).map_err(|_| bad("Invalid address"))?;
    address.validate()?;
    let (s, _) = commerce::config(a, t).await?;
    commerce::validate_address_geography(&address, &s)?;
    if !s.countries.contains(&address.country) {
        return Err(bad("Address country unavailable"));
    }
    let mut tx = a.db.begin().await?;
    if header(h, "x-rac-user").is_some() {
        history::context(&mut tx, h, "merchant").await?;
    } else {
        history::customer_context(&mut tx, email).await?;
    }
    let result = address_save_conn(&mut tx, t, email, id, v, &address).await?;
    tx.commit().await?;
    Ok(result)
}
pub(crate) async fn address_save_conn(
    conn: &mut sqlx::PgConnection,
    t: &str,
    email: &str,
    id: Option<&str>,
    v: &Value,
    address: &commerce::Address,
) -> Result<Value> {
    sqlx::query("SELECT id FROM customers WHERE tenant=$1 AND email=$2 FOR UPDATE")
        .bind(t)
        .bind(email)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Customer not found".into()))?;
    let address_id = id.map(str::to_owned).unwrap_or_else(uid);
    if id.is_some() {
        let n=sqlx::query("UPDATE customer_addresses SET data=$1,revision=revision+1,updated_at=now() WHERE tenant=$2 AND email=$3 AND id=$4 AND revision=$5").bind(json!(address)).bind(t).bind(email).bind(&address_id).bind(v["revision"].as_i64().ok_or(bad("Address revision required"))?).execute(&mut *conn).await?.rows_affected();
        if n != 1 {
            return Err(conflict("Address changed or unavailable"));
        }
    } else {
        let n: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM customer_addresses WHERE tenant=$1 AND email=$2",
        )
        .bind(t)
        .bind(email)
        .fetch_one(&mut *conn)
        .await?;
        if n >= 100 {
            return Err(bad("Address book limit reached"));
        }
        sqlx::query("INSERT INTO customer_addresses(tenant,email,id,data) VALUES($1,$2,$3,$4)")
            .bind(t)
            .bind(email)
            .bind(&address_id)
            .bind(json!(address))
            .execute(&mut *conn)
            .await?;
    }
    sqlx::query("UPDATE customers SET default_billing_address_id=CASE WHEN $4 OR default_billing_address_id IS NULL THEN $1 ELSE default_billing_address_id END,default_shipping_address_id=CASE WHEN $5 OR default_shipping_address_id IS NULL THEN $1 ELSE default_shipping_address_id END,revision=revision+1 WHERE tenant=$2 AND email=$3").bind(&address_id).bind(t).bind(email).bind(v["defaultBilling"].as_bool().unwrap_or(false)).bind(v["defaultShipping"].as_bool().unwrap_or(false)).execute(&mut *conn).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'customer.address_changed',$2)")
        .bind(t)
        .bind(json!({"email":email,"addressId":address_id}))
        .execute(&mut *conn)
        .await?;
    Ok(json!({"id":address_id,"saved":true}))
}
pub(crate) async fn address_delete(
    a: &App,
    t: &str,
    email: &str,
    id: &str,
    revision: i64,
    h: &HeaderMap,
) -> Result<Value> {
    let mut tx = a.db.begin().await?;
    if header(h, "x-rac-user").is_some() {
        history::context(&mut tx, h, "merchant").await?;
    } else {
        history::customer_context(&mut tx, email).await?;
    }
    sqlx::query("SELECT id FROM customers WHERE tenant=$1 AND email=$2 FOR UPDATE")
        .bind(t)
        .bind(email)
        .fetch_one(&mut *tx)
        .await?;
    let n = sqlx::query(
        "DELETE FROM customer_addresses WHERE tenant=$1 AND email=$2 AND id=$3 AND revision=$4",
    )
    .bind(t)
    .bind(email)
    .bind(id)
    .bind(revision)
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if n != 1 {
        return Err(conflict("Address changed or unavailable"));
    }
    sqlx::query("UPDATE customers SET revision=revision+1 WHERE tenant=$1 AND email=$2")
        .bind(t)
        .bind(email)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'customer.address_deleted',$2)")
        .bind(t)
        .bind(json!({"email":email,"addressId":id}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(json!({"deleted":true}))
}
pub(crate) async fn address_get(
    conn: &mut sqlx::PgConnection,
    t: &str,
    email: &str,
    id: &str,
) -> Result<commerce::Address> {
    let data: Value = sqlx::query_scalar(
        "SELECT data FROM customer_addresses WHERE tenant=$1 AND email=$2 AND id=$3 FOR SHARE",
    )
    .bind(t)
    .bind(email)
    .bind(id)
    .fetch_optional(conn)
    .await?
    .ok_or(Error(StatusCode::NOT_FOUND, "Address not found".into()))?;
    let mut address: commerce::Address =
        serde_json::from_value(data).map_err(|_| bad("Invalid stored address"))?;
    address.validate()?;
    Ok(address)
}
