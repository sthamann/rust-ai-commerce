//! Durable withdrawal/data-rights intake, tenant-scoped operator review and customer-held receipt access.
use super::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Intake {
    kind: String,
    name: String,
    email: String,
    reference: String,
    message: String,
    request_key: String,
}
pub(super) async fn create(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Intake>,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    auth::email(&json!({"email": v.email}))?;
    if ![
        "withdrawal",
        "access",
        "erase",
        "correct",
        "portability",
        "objection",
    ]
    .contains(&v.kind.as_str())
        || v.name.trim().is_empty()
        || v.name.len() > 200
        || v.email.len() > 254
        || !v.email.contains('@')
        || v.reference.len() > 200
        || v.message.len() > 6000
        || v.request_key.len() < 8
        || v.request_key.len() > 128
    {
        return Err(bad("Invalid consumer request"));
    }
    if v.kind == "withdrawal" && v.reference.trim().is_empty() {
        return Err(bad("Contract reference required"));
    }
    let id = hash(&format!("{}:{}:{}", c.tenant, c.id, v.request_key));
    let data = json!({"name":v.name,"email":v.email,"reference":v.reference,"message":v.message,"receivedAt":chrono::Utc::now().to_rfc3339(),"identityVerified":false,"automaticRefund":false,"locale":c.data.locale});
    let mut tx = a.db.begin().await?;
    // Cart lock serializes rate admission and retry; a reference is a declaration, never an order-access grant.
    sqlx::query("SELECT id FROM carts WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(&c.tenant)
        .bind(&c.id)
        .fetch_one(&mut *tx)
        .await?;
    if let Some(r) =
        sqlx::query("SELECT data,kind,state FROM consumer_requests WHERE tenant=$1 AND id=$2")
            .bind(&c.tenant)
            .bind(&id)
            .fetch_optional(&mut *tx)
            .await?
    {
        let old: Value = r.get("data");
        if old["name"] != data["name"]
            || old["email"] != data["email"]
            || old["reference"] != data["reference"]
            || old["message"] != data["message"]
            || r.get::<String, _>("kind") != v.kind
        {
            return Err(conflict("Request key reused with different content"));
        }
        return Ok(Json(
            json!({"id":id,"kind":v.kind,"data":public_data(&old),"state":r.get::<String,_>("state")}),
        ));
    }
    let count:i64=sqlx::query_scalar("SELECT count(*) FROM consumer_requests WHERE tenant=$1 AND cart_id=$2 AND created_at>now()-interval '1 day'").bind(&c.tenant).bind(&c.id).fetch_one(&mut *tx).await?;
    if count >= 20 {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Consumer request limit reached".into(),
        ));
    }
    sqlx::query("INSERT INTO consumer_requests(tenant,id,cart_id,channel_id,kind,data) VALUES($1,$2,$3,$4,$5,$6)")
      .bind(&c.tenant).bind(&id).bind(&c.id).bind(&c.data.sales_channel).bind(&v.kind).bind(&data).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,$2,$3)")
      .bind(&c.tenant).bind(format!("consumer.{}.requested",v.kind)).bind(json!({"requestId":id,"salesChannelId":c.data.sales_channel,"kind":v.kind,"receipt":data})).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"kind":v.kind,"data":data,"state":"received"}),
    ))
}
pub(super) async fn receipt(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let c = load_cart(&a, &h).await?;
    let r=sqlx::query("SELECT kind,data,state FROM consumer_requests WHERE tenant=$1 AND id=$2 AND cart_id=$3 AND channel_id=$4").bind(&c.tenant).bind(&id).bind(&c.id).bind(&c.data.sales_channel).fetch_optional(&a.db).await?.ok_or(Error(StatusCode::NOT_FOUND,"Request not found".into()))?;
    Ok(Json(
        json!({"id":id,"kind":r.get::<String,_>("kind"),"data":public_data(&r.get::<Value,_>("data")),"state":r.get::<String,_>("state")}),
    ))
}
pub(super) async fn list(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.read")?;
    let rs=sqlx::query("SELECT id,kind,data,state,revision,channel_id FROM consumer_requests WHERE tenant=$1 ORDER BY created_at DESC,id LIMIT 100").bind(&t).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rs.iter().map(|r|json!({"id":r.get::<String,_>("id"),"kind":r.get::<String,_>("kind"),"data":r.get::<Value,_>("data"),"state":r.get::<String,_>("state"),"revision":r.get::<i64,_>("revision"),"salesChannelId":r.get::<String,_>("channel_id")})).collect::<Vec<_>>(),"limit":100}),
    ))
}
pub(super) async fn update(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "customers.write")?;
    let state = v["state"]
        .as_str()
        .filter(|s| ["in_review", "completed", "declined"].contains(s))
        .ok_or(bad("Invalid consumer request state"))?;
    let revision = v["revision"].as_i64().ok_or(bad("Revision required"))?;
    let note = v["note"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 6000)
        .ok_or(bad("Review note required"))?;
    let mut tx = a.db.begin().await?;
    let n=sqlx::query("UPDATE consumer_requests SET state=$1,revision=revision+1,data=data||jsonb_build_object('reviewNote',$2::text,'reviewedAt',now()::text,'reviewedBy',$3::text) WHERE tenant=$4 AND id=$5 AND revision=$6 RETURNING revision")
      .bind(state).bind(note).bind(header(&h,"x-rac-user").unwrap_or("merchant")) .bind(&t).bind(&id).bind(revision).fetch_optional(&mut *tx).await?.ok_or(conflict("Request changed or unavailable"))?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'consumer.request.reviewed',$2)")
        .bind(&t)
        .bind(json!({"requestId":id,"state":state,"revision":n.get::<i64,_>("revision")}))
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO consumer_request_reviews(tenant,request_id,revision,actor,state,note) VALUES($1,$2,$3,$4,$5,$6)").bind(&t).bind(&id).bind(revision+1).bind(header(&h,"x-rac-user").unwrap_or("merchant")).bind(state).bind(note).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"revision":revision+1})))
}

/// Internal review notes and reviewer identities never leave the merchant boundary.
fn public_data(v: &Value) -> Value {
    let mut result = json!({});
    for k in [
        "name",
        "email",
        "reference",
        "message",
        "receivedAt",
        "identityVerified",
        "automaticRefund",
        "locale",
    ] {
        result[k] = v[k].clone();
    }
    result
}
