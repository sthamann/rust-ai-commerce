//! Selected UCP checkout adapters sharing the native cart.
use crate::*;

pub(crate) const UCP_VERSION: &str = "2026-08-25";
pub(crate) fn ucp_meta() -> Value {
    json!({"version":UCP_VERSION,"capabilities":{"dev.ucp.shopping.checkout":[{"version":UCP_VERSION}]}})
}
pub(crate) async fn ucp_profile() -> Json<Value> {
    Json(
        json!({"ucp":{"version":UCP_VERSION,"services":{"dev.ucp.shopping":[{"version":UCP_VERSION,"spec":"https://ucp.dev/2026-08-25/specification/overview","transport":"rest","schema":"https://ucp.dev/2026-08-25/services/shopping/rest.openapi.json","endpoint":"http://127.0.0.1:8787/ucp/v1"}]},"capabilities":{"dev.ucp.shopping.checkout":[{"version":UCP_VERSION,"spec":"https://ucp.dev/2026-08-25/specification/shopping/checkout","schema":"https://ucp.dev/2026-08-25/schemas/shopping/checkout.json"}]},"payment_handlers":{}}}),
    )
}
pub(crate) fn ucp_items(v: &Value) -> Result<Vec<Item>> {
    let rows = v["line_items"]
        .as_array()
        .ok_or(bad("line_items required"))?;
    let mut items = vec![];
    for i in rows {
        let q = i["quantity"]
            .as_u64()
            .filter(|q| *q <= 10000)
            .ok_or(bad("quantity required"))?;
        items.push(Item {
            id: i["item"]["id"]
                .as_str()
                .ok_or(bad("item.id required"))?
                .into(),
            quantity: q as u32,
        });
    }
    validate_items(&items)?;
    Ok(items)
}
pub(crate) fn ucp_document(c: &StoredCart, q: &Value) -> Value {
    let minor = |v: &Value| (v.as_f64().unwrap_or(0.) * 100.).round() as i64;
    let status = if c.status == "completed" {
        "completed"
    } else if c.status == "cancelled" {
        "canceled"
    } else if c
        .data
        .buyer
        .as_ref()
        .and_then(|b| b["email"].as_str())
        .is_some_and(|s| s.contains('@'))
        && !c.data.items.is_empty()
    {
        "ready_for_complete"
    } else {
        "incomplete"
    };
    let mut doc = json!({"ucp":ucp_meta(),"id":c.id,"status":status,"currency":"EUR","line_items":q["lineItems"].as_array().unwrap().iter().map(|l|json!({"id":l["id"],"item":{"id":l["referencedId"],"title":l["label"],"price":minor(&l["price"]["unitPrice"])},"quantity":l["quantity"],"totals":[{"type":"subtotal","amount":minor(&l["price"]["totalPrice"])},{"type":"total","amount":minor(&l["price"]["totalPrice"])}]})).collect::<Vec<_>>(),"totals":[{"type":"subtotal","amount":minor(&q["price"]["positionPrice"])},{"type":"total","amount":minor(&q["price"]["totalPrice"])}],"messages":if c.status=="open"{json!([{"type":"info","code":"requires_buyer_input","content":"Continue in merchant checkout. Payment is simulated in this prototype."}])}else{json!([])},"links":[],"payment":{"instruments":[]},"continue_url":"http://127.0.0.1:8787/","order":c.data.order.as_ref().map(|o|json!({"id":o["id"],"permalink_url":format!("http://127.0.0.1:8787/#order/{}",o["id"].as_str().unwrap())}))});
    if c.data.order.is_none() {
        doc.as_object_mut().unwrap().remove("order");
    }
    if let Some(b) = &c.data.buyer {
        doc["buyer"] = b.clone();
    }
    doc
}
pub(crate) async fn ucp_create(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let items = ucp_items(&v)?;
    let c = new_cart(
        &a,
        &t,
        v["session"].as_str().unwrap_or(""),
        &language_context(&a, &h).await?.0,
        "ucp",
    )
    .await?;
    let mut ch = h.clone();
    ch.insert("sw-context-token", c.token.parse().unwrap());
    let c = set_cart(&a, &ch, items, Some(1), Some(v.get("buyer").cloned())).await?;
    let mut doc = ucp_document(&c, &cart_json(&a, &c).await?);
    doc["context_token"] = json!(c.token);
    Ok(Json(doc))
}
pub(crate) async fn ucp_load(a: &App, h: &HeaderMap, id: &str) -> Result<StoredCart> {
    let c = load_cart(a, h).await?;
    if c.id != id {
        return Err(Error(StatusCode::NOT_FOUND, "Checkout not found".into()));
    }
    Ok(c)
}
pub(crate) async fn ucp_get(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let c = ucp_load(&a, &h, &id).await?;
    Ok(Json(ucp_document(&c, &cart_json(&a, &c).await?)))
}
pub(crate) async fn ucp_update(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let c = ucp_load(&a, &h, &id).await?;
    let c = set_cart(
        &a,
        &h,
        ucp_items(&v)?,
        Some(c.revision),
        Some(v.get("buyer").cloned()),
    )
    .await?;
    Ok(Json(ucp_document(&c, &cart_json(&a, &c).await?)))
}
pub(crate) async fn ucp_complete(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let current = ucp_load(&a, &h, &id).await?;
    if current.status == "open"
        && current
            .data
            .buyer
            .as_ref()
            .and_then(|b| b["email"].as_str())
            .is_none_or(|s| !s.contains('@'))
    {
        return Err(conflict("Buyer email is required before demo completion"));
    }
    checkout(
        &a,
        &h,
        header(&h, "idempotency-key").ok_or(bad("Idempotency-Key required"))?,
    )
    .await?;
    let c = load_cart(&a, &h).await?;
    Ok(Json(ucp_document(&c, &cart_json(&a, &c).await?)))
}
pub(crate) async fn ucp_cancel(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>> {
    let c = ucp_load(&a, &h, &id).await?;
    let n = sqlx::query(
        "UPDATE carts SET status='cancelled',revision=revision+1 WHERE id=$1 AND status='open'",
    )
    .bind(&c.id)
    .execute(&a.db)
    .await?
    .rows_affected();
    if n != 1 && c.status != "cancelled" {
        return Err(conflict("Completed checkout cannot be cancelled"));
    }
    let c = load_cart(&a, &h).await?;
    Ok(Json(ucp_document(&c, &cart_json(&a, &c).await?)))
}
