//! Bounded order search, token-redacted detail and append-only operational notes.
use super::*;
pub(super) async fn list(
    State(a): State<App>,
    h: HeaderMap,
    axum::extract::Query(c): axum::extract::Query<Criteria>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "orders.read")?;
    let n = c.validate()?;
    let rows=sqlx::query("SELECT o.data #- '{cart,token}' AS data,o.created_at::text AS created,coalesce(o.data->'orderCustomer'->>'email',c.data->>'email') AS email FROM orders o JOIN carts c ON c.id=o.cart_id WHERE o.tenant=$1 AND ($2='' OR (o.created_at,o.id)<(SELECT created_at,id FROM orders WHERE tenant=$1 AND id=$2)) AND ($3='' OR strpos(lower(o.data->>'orderNumber'||' '||coalesce(o.data->'orderCustomer'->>'email',c.data->>'email','')),lower($3))>0) AND ($4='' OR o.data->>'state'=$4) ORDER BY o.created_at DESC,o.id DESC LIMIT $5").bind(t).bind(c.after).bind(c.query).bind(c.state).bind(n+1).fetch_all(&a.db).await?;
    let more = rows.len() > n as usize;
    let elements = rows
        .iter()
        .take(n as usize)
        .map(|r| {
            let mut o: Value = r.get("data");
            commerce::order_fields(&mut o);
            o["createdAt"] = json!(r.get::<String, _>("created"));
            o["customerEmail"] = json!(r.get::<Option<String>, _>("email"));
            o
        })
        .collect::<Vec<_>>();
    let after = elements.last().map(|v| v["id"].clone());
    Ok(Json(
        json!({"elements":elements,"hasMore":more,"nextCursor":if more{after}else{None}}),
    ))
}
pub(super) async fn detail(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "orders.read")?;
    let r=sqlx::query("SELECT o.data #- '{cart,token}' AS data,o.created_at::text AS created,coalesce(o.data->'orderCustomer'->>'email',c.data->>'email') AS email FROM orders o JOIN carts c ON c.id=o.cart_id WHERE o.tenant=$1 AND o.id=$2").bind(&t).bind(&id).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Order not found".into()))?;
    let mut v: Value = r.get("data");
    commerce::order_fields(&mut v);
    v["createdAt"] = json!(r.get::<String, _>("created"));
    v["customerEmail"] = json!(r.get::<Option<String>, _>("email"));
    let rows=sqlx::query("SELECT id,actor,kind,data,created_at::text AS created FROM order_activity WHERE tenant=$1 AND order_id=$2 ORDER BY id DESC LIMIT 100").bind(&t).bind(&id).fetch_all(&a.db).await?;
    v["activity"]=json!(rows.iter().map(|r|json!({"id":r.get::<i64,_>("id"),"actor":r.get::<String,_>("actor"),"kind":r.get::<String,_>("kind"),"data":r.get::<Value,_>("data"),"createdAt":r.get::<String,_>("created")})).collect::<Vec<_>>());
    let (machine, revision) = commerce::machine(&a.db, &t).await?;
    v["workflow"] = commerce::workflow(&v, &machine, revision);
    Ok(Json(v))
}
pub(super) async fn note(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "orders.write")?;
    let text = v["text"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 4000)
        .ok_or(bad("Note must contain 1..4000 characters"))?;
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    let n=sqlx::query("UPDATE orders SET data=jsonb_set(data,'{revision}',to_jsonb((data->>'revision')::bigint+1)) WHERE tenant=$1 AND id=$2 AND (data->>'revision')::bigint=$3").bind(&t).bind(&id).bind(v["revision"].as_i64().ok_or(bad("revision required"))?).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Order revision changed"));
    }
    sqlx::query(
        "INSERT INTO order_activity(tenant,order_id,actor,kind,data) VALUES($1,$2,$3,'note',$4)",
    )
    .bind(&t)
    .bind(&id)
    .bind(header(&h, "x-rac-user").unwrap())
    .bind(json!({"text":text}))
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE carts SET data=jsonb_set(carts.data,'{order}',o.data) FROM orders o WHERE carts.id=o.cart_id AND o.tenant=$1 AND o.id=$2").bind(t).bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"saved":true})))
}
