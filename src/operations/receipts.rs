//! Idempotent immutable invoices/delivery notes with transactional per-shop number ranges.
use super::*;
pub(super) async fn settings(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "documents.read")?;
    settings_value(&a, &h).await
}
pub(super) async fn settings_value(a: &App, h: &HeaderMap) -> Result<Json<Value>> {
    let t = merchant(a, h)?;
    let r = sqlx::query("SELECT data,revision FROM receipt_settings WHERE tenant=$1")
        .bind(t)
        .fetch_optional(&a.db)
        .await?;
    Ok(Json(
        r.map(|r| json!({"data":r.get::<Value,_>("data"),"revision":r.get::<i64,_>("revision")}))
            .unwrap_or(json!({"data":{},"revision":0})),
    ))
}
pub(super) async fn save_settings(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    merchant(&a, &h)?;
    auth::permit(&h, "documents.create")?;
    auth::permit(&h, "settings.write")?;
    save_settings_value(&a, &h, v).await
}
pub(super) async fn save_settings_value(a: &App, h: &HeaderMap, v: Value) -> Result<Json<Value>> {
    let t = merchant(a, h)?;
    for key in ["name", "address", "taxId"] {
        if v["data"][key]
            .as_str()
            .is_none_or(|s| s.trim().is_empty() || s.len() > 500)
        {
            return Err(bad("Seller name, address and taxId required"));
        }
    }
    let data = v["data"]
        .as_object()
        .ok_or(bad("Master data object required"))?;
    for (key, value) in data {
        if ![
            "name",
            "address",
            "taxId",
            "email",
            "phoneNumber",
            "website",
            "registrationNumber",
            "bankName",
            "iban",
            "bic",
            "country",
        ]
        .contains(&key.as_str())
            || value.as_str().is_none_or(|s| s.len() > 500)
        {
            return Err(bad("Invalid master data field"));
        }
    }
    let revision = v["revision"].as_i64().ok_or(bad("revision required"))?;
    let mut tx = a.db.begin().await?;
    // An INSERT source restricted to revision zero never reaches ON CONFLICT
    // for existing records. Admit an existing revision into the source while
    // retaining the authoritative conflict check under PostgreSQL's row lock.
    let n=sqlx::query("INSERT INTO receipt_settings(tenant,data) SELECT $1,$2 WHERE $3=0 OR EXISTS(SELECT 1 FROM receipt_settings WHERE tenant=$1 AND revision=$3) ON CONFLICT(tenant) DO UPDATE SET data=EXCLUDED.data,revision=receipt_settings.revision+1 WHERE receipt_settings.revision=$3").bind(&t).bind(&v["data"]).bind(revision).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(conflict("Receipt settings changed"));
    }
    sqlx::query(
        "INSERT INTO outbox(tenant,kind,data) VALUES($1,'settings.master_data_changed',$2)",
    )
    .bind(t)
    .bind(json!({"revision":revision+1}))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"saved":true,"revision":revision+1})))
}
pub(super) async fn list(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "documents.read")?;
    let rows=sqlx::query("SELECT id,kind,number,locale,created_at::text AS created FROM order_receipts WHERE tenant=$1 AND order_id=$2 ORDER BY created_at DESC LIMIT 100").bind(t).bind(id).fetch_all(&a.db).await?;
    Ok(Json(
        json!({"elements":rows.iter().map(|r|json!({"id":r.get::<String,_>("id"),"kind":r.get::<String,_>("kind"),"number":r.get::<String,_>("number"),"locale":r.get::<String,_>("locale"),"createdAt":r.get::<String,_>("created"),"pdfPath":format!("/api/merchant/receipts/{}/pdf",r.get::<String,_>("id"))})).collect::<Vec<_>>() }),
    ))
}
pub(super) async fn create(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "documents.create")?;
    let key = v["requestKey"]
        .as_str()
        .or_else(|| header(&h, "idempotency-key"))
        .filter(|s| (8..=128).contains(&s.len()))
        .ok_or(bad("requestKey must contain 8..128 characters"))?;
    let kind = v["kind"]
        .as_str()
        .filter(|s| ["invoice", "delivery_note", "cancellation"].contains(s))
        .ok_or(bad("Invalid receipt kind"))?;
    let locale = v["locale"].as_str().unwrap_or("en");
    if !["en", "de", "fr", "es"].contains(&locale) {
        return Err(bad("Unsupported receipt locale"));
    }
    let fingerprint = hash(&format!(
        "{id}:{kind}:{locale}:{}:{}",
        v["revision"], v["referenceId"]
    ));
    let mut tx = a.db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(format!("receipt:{t}:{key}"))
        .execute(&mut *tx)
        .await?;
    if let Some(r) = sqlx::query(
        "SELECT id,number,fingerprint FROM order_receipts WHERE tenant=$1 AND request_key=$2",
    )
    .bind(&t)
    .bind(key)
    .fetch_optional(&mut *tx)
    .await?
    {
        if r.get::<String, _>("fingerprint") != fingerprint {
            return Err(conflict("Receipt request key reused"));
        }
        return Ok(Json(
            json!({"id":r.get::<String,_>("id"),"number":r.get::<String,_>("number")}),
        ));
    }
    let r=sqlx::query("SELECT data #- '{cart,token}' AS data,created_at::text AS created FROM orders WHERE tenant=$1 AND id=$2 FOR UPDATE").bind(&t).bind(&id).fetch_optional(&mut *tx).await?.ok_or(Error(StatusCode::NOT_FOUND,"Order not found".into()))?;
    let order: Value = r.get("data");
    if order["revision"] != v["revision"] {
        return Err(conflict("Order revision changed"));
    }
    let seller: Value =
        sqlx::query_scalar("SELECT data FROM receipt_settings WHERE tenant=$1 FOR SHARE")
            .bind(&t)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(bad("Configure seller details before creating receipts"))?;
    let reference = if kind == "cancellation" {
        let ref_id = v["referenceId"]
            .as_str()
            .ok_or(bad("Original invoice reference required"))?;
        let original:Value=sqlx::query_scalar("SELECT snapshot FROM order_receipts WHERE tenant=$1 AND order_id=$2 AND id=$3 AND kind='invoice'").bind(&t).bind(&id).bind(ref_id).fetch_optional(&mut *tx).await?.ok_or(bad("Original invoice unavailable"))?;
        let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM order_receipts WHERE tenant=$1 AND snapshot->>'referenceId'=$2 AND kind='cancellation')").bind(&t).bind(ref_id).fetch_one(&mut *tx).await?;
        if exists {
            return Err(conflict("Invoice already cancelled"));
        }
        Some(original)
    } else {
        None
    };
    // A single original invoice per order; cancellation does not initiate a provider refund.
    if kind == "invoice" {
        let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM order_receipts WHERE tenant=$1 AND order_id=$2 AND kind='invoice')").bind(&t).bind(&id).fetch_one(&mut *tx).await?;
        if exists {
            return Err(conflict("Invoice already exists"));
        }
    }
    let number:i64=sqlx::query_scalar("INSERT INTO receipt_counters(tenant,kind,next_number) VALUES($1,$2,2) ON CONFLICT(tenant,kind) DO UPDATE SET next_number=receipt_counters.next_number+1 RETURNING next_number-1").bind(&t).bind(kind).fetch_one(&mut *tx).await?;
    let prefix = match kind {
        "invoice" => "INV",
        "delivery_note" => "DEL",
        _ => "CAN",
    };
    let number = format!("{prefix}-{number:08}");
    let receipt = uid();
    let snapshot = json!({"number":number,"kind":kind,"locale":locale,"seller":seller,"order":if let Some(ref original)=reference{original["order"].clone()}else{order.clone()},"issuedAt":sqlx::query_scalar::<_,String>("SELECT now()::text").fetch_one(&mut *tx).await?,"referenceId":v["referenceId"],"referenceNumber":reference.map(|s|s["number"].clone())});
    sqlx::query("INSERT INTO order_receipts(id,tenant,order_id,kind,number,locale,snapshot,request_key,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)").bind(&receipt).bind(&t).bind(&id).bind(kind).bind(&number).bind(locale).bind(snapshot).bind(key).bind(fingerprint).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO order_activity(tenant,order_id,actor,kind,data) VALUES($1,$2,$3,'receipt',$4)",
    )
    .bind(t)
    .bind(id)
    .bind(header(&h, "x-rac-user").unwrap())
    .bind(json!({"id":receipt,"number":number,"kind":kind}))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":receipt,"number":number,"pdfPath":format!("/api/merchant/receipts/{receipt}/pdf")}),
    ))
}
pub(super) async fn pdf(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Response> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "documents.read")?;
    let v: Value =
        sqlx::query_scalar("SELECT snapshot FROM order_receipts WHERE tenant=$1 AND id=$2")
            .bind(t)
            .bind(id)
            .fetch_optional(&a.db)
            .await?
            .ok_or(Error(StatusCode::NOT_FOUND, "Receipt not found".into()))?;
    Ok((
        [
            ("content-type", "application/pdf"),
            ("cache-control", "private, no-store"),
            ("content-disposition", "attachment; filename=receipt.pdf"),
        ],
        receipt_pdf::render(&receipt_text::lines(&v)),
    )
        .into_response())
}
