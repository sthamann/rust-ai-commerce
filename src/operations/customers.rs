//! Tenant-scoped paged CRM and revision-checked merchant changes; credentials never leave storage.
use super::*;
pub(super) async fn list(
    State(a): State<App>,
    h: HeaderMap,
    axum::extract::Query(c): axum::extract::Query<Criteria>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.read")?;
    let n = c.validate()?;
    let rows=sqlx::query("SELECT *,created_at::text AS created FROM customers WHERE tenant=$1 AND email>$2 AND ($3='' OR strpos(lower(email||' '||coalesce(profile->>'name','')) ,lower($3))>0) ORDER BY email LIMIT $4").bind(t).bind(c.after).bind(c.query).bind(n+1).fetch_all(&a.db).await?;
    let more = rows.len() > n as usize;
    let elements = rows.iter().take(n as usize).map(value).collect::<Vec<_>>();
    let after = elements.last().map(|v| v["email"].clone());
    Ok(Json(
        json!({"elements":elements,"hasMore":more,"nextCursor":if more{after}else{None}}),
    ))
}
fn value(r: &sqlx::postgres::PgRow) -> Value {
    accounts::customer_value(r)
}
pub(super) async fn detail(
    State(a): State<App>,
    h: HeaderMap,
    Path(email): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.read")?;
    let r = sqlx::query(
        "SELECT *,created_at::text AS created FROM customers WHERE tenant=$1 AND email=$2",
    )
    .bind(&t)
    .bind(&email)
    .fetch_optional(&a.db)
    .await?
    .ok_or(Error(StatusCode::NOT_FOUND, "Customer not found".into()))?;
    let mut v = value(&r);
    accounts::decorate(&a, &t, &email, &mut v).await?;
    v["addresses"] = accounts::address_list(&a, &t, &email).await?;
    if auth::permit(&h, "orders.read").is_ok() {
        let rows=sqlx::query("SELECT o.data #- '{cart,token}' AS data,o.created_at::text AS created FROM orders o JOIN carts c ON c.id=o.cart_id AND c.tenant=o.tenant WHERE o.tenant=$1 AND ((o.data->'orderCustomer'->>'customerId')=(SELECT id FROM customers WHERE tenant=o.tenant AND email=$2) OR (NOT o.data ? 'orderCustomer' AND c.data->>'email'=$2)) ORDER BY o.created_at DESC LIMIT 100").bind(t).bind(email).fetch_all(&a.db).await?;
        v["orders"] = json!(
            rows.iter()
                .map(|r| {
                    let mut o: Value = r.get("data");
                    o["createdAt"] = json!(r.get::<String, _>("created"));
                    o
                })
                .collect::<Vec<_>>()
        );
    }
    Ok(Json(v))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Edit {
    revision: i64,
    profile: Value,
    company: Option<String>,
    customer_group: String,
    active: bool,
}
pub(super) async fn save(
    State(a): State<App>,
    h: HeaderMap,
    Path(email): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    save_domain(a, h, email, v, None).await
}
pub(crate) async fn restore_customer(
    a: App,
    h: HeaderMap,
    email: String,
    state: Value,
    revision: i64,
) -> Result<Json<Value>> {
    let value = json!({"revision":revision,"profile":state["profile"],"company":state["company"],"customerGroup":state["customerGroup"],"active":state["active"]});
    save_domain(a, h, email, value, Some(state)).await
}
async fn save_domain(
    a: App,
    h: HeaderMap,
    email: String,
    v: Value,
    book: Option<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.write")?;
    let e: Edit = serde_json::from_value(v).map_err(|_| bad("Invalid customer update"))?;
    if e.company.as_ref().is_some_and(|s| s.len() > 200)
        || e.profile.to_string().len() > 4000
        || !e.profile.is_object()
    {
        return Err(bad("Invalid customer profile"));
    }
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    let (settings, _) = commerce::scoped_locked(&mut tx, &t, "default").await?;
    if !settings
        .customer_groups
        .iter()
        .any(|g| g.id == e.customer_group)
    {
        return Err(bad("Unknown customer group"));
    }
    let current: i64 = sqlx::query_scalar(
        "SELECT revision FROM customers WHERE tenant=$1 AND email=$2 FOR UPDATE",
    )
    .bind(&t)
    .bind(&email)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(conflict("Customer changed or unavailable"))?;
    if current != e.revision {
        return Err(conflict("Customer changed or unavailable"));
    }
    let mut contact: accounts::Contact = serde_json::from_value(e.profile.clone())
        .map_err(|_| bad("Invalid customer contact fields"))?;
    contact.validate()?;
    let n=sqlx::query("UPDATE customers SET profile=$1,company=$2,group_name=$3,active=$4,revision=revision+1 WHERE tenant=$5 AND email=$6 AND revision=$7").bind(json!(contact)).bind(e.company).bind(&e.customer_group).bind(e.active).bind(&t).bind(&email).bind(e.revision).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Customer changed or unavailable"));
    }
    if let Some(book) = book {
        let automation = &book["automation"];
        if !automation.is_object() || automation.to_string().len() > 32768 {
            return Err(bad("Invalid customer automation data"));
        }
        sqlx::query("UPDATE customers SET automation=$1 WHERE tenant=$2 AND email=$3")
            .bind(automation)
            .bind(&t)
            .bind(&email)
            .execute(&mut *tx)
            .await?;
        accounts::restore_book(&mut tx, &t, &email, &book, &settings).await?;
    }
    let saved_revision: i64 =
        sqlx::query_scalar("SELECT revision FROM customers WHERE tenant=$1 AND email=$2")
            .bind(&t)
            .bind(&email)
            .fetch_one(&mut *tx)
            .await?;
    // Access and group changes revoke sessions and invalidate all open privileged cart contexts.
    sqlx::query("DELETE FROM customer_sessions WHERE tenant=$1 AND email=$2")
        .bind(&t)
        .bind(&email)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE carts SET token=md5(id||$1),data=jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,'{email}','null'),'{customer_id}','null'),'{group}','\"consumer\"'),'{company}','null'),revision=revision+1 WHERE tenant=$2 AND data->>'email'=$3 AND status='open'").bind(uid()).bind(&t).bind(&email).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'customer.updated',$2)").bind(t).bind(json!({"actor":header(&h,"x-rac-user"),"email":email,"revision":saved_revision,"active":e.active})).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"saved":true,"revision":saved_revision})))
}
