//! Revision-checked payment and delivery state transitions.
use super::*;

pub(crate) async fn transition_order(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    auth::permit(&h, "orders.write")?;
    let (machine, machine_revision) = machine(&a.db, &t).await?;
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, &h, "merchant").await?;
    let request_key = header(&h, "idempotency-key").or_else(|| v["requestKey"].as_str());
    let fingerprint = hash(&json!({"orderId":id,"body":v}).to_string());
    if let Some(key) = request_key {
        if !(8..=128).contains(&key.len()) {
            return Err(bad("Invalid transition request key"));
        }
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,28))")
            .bind(format!("{t}:{key}"))
            .execute(&mut *tx)
            .await?;
        if let Some(r)=sqlx::query("SELECT fingerprint,response FROM order_transition_requests WHERE tenant=$1 AND request_key=$2").bind(&t).bind(key).fetch_optional(&mut *tx).await?{if r.get::<String,_>("fingerprint")!=fingerprint{return Err(conflict("Transition key reused with different input"));}return Ok(Json(r.get("response")));}
    }
    let r = sqlx::query("SELECT data FROM orders WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(&t)
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Order not found".into()))?;
    let mut o: Value = r.get("data");
    let revision = o["revision"].as_i64().unwrap_or(1);
    if !verified_kernel::revision_admissible(
        u64::try_from(revision).unwrap_or(0),
        v["revision"].as_u64().unwrap_or(0),
    ) {
        return Err(conflict("Order revision changed"));
    }
    let target = v["state"].as_str().ok_or(bad("State required"))?;
    let kind = v["kind"].as_str().ok_or(bad("Kind required"))?;
    match kind {
        "order" => {
            let current = o["state"].as_str().unwrap_or("placed");
            if !machine.transitions.iter().any(|e| {
                e.from == current
                    && e.to == target
                    && v["action"].as_str().is_none_or(|id| id == e.id)
            }) {
                return Err(conflict("Invalid order transition"));
            }
            if let Some(reason) = guard(&o, &machine, kind, target) {
                return Err(conflict(reason));
            }
            if target == "cancelled" {
                if o["payment"]["provider"] == "paypal"
                    || ["paid", "captured", "partially_refunded"]
                        .contains(&o["payment"]["state"].as_str().unwrap_or(""))
                {
                    return Err(conflict("Reconcile or refund payment before cancellation"));
                }
                if o["deliveries"]
                    .as_array()
                    .is_some_and(|ds| ds.iter().any(|d| d["state"] != "open"))
                {
                    return Err(conflict("Shipped orders require a return workflow"));
                }
                for item in o["cart"]["lineItems"]
                    .as_array()
                    .ok_or(bad("Invalid order lines"))?
                {
                    sqlx::query("UPDATE products SET stock=stock+$1,revision=revision+1 WHERE tenant=$2 AND id=$3").bind(item["quantity"].as_i64().unwrap_or(0) as i32).bind(&t).bind(item["referencedId"].as_str().unwrap_or("")).execute(&mut *tx).await?;
                }
                o["payment"]["state"] = json!("cancelled");
            }
            o["state"] = json!(target);
        }
        "payment" => {
            if let Some(reason) = guard(&o, &machine, kind, target) {
                return Err(conflict(reason));
            }
            if o["payment"]["provider"] == "paypal" {
                return Err(conflict(
                    "External payments require a confirmed provider receipt",
                ));
            }
            let current = o["payment"]["state"].as_str().unwrap_or("");
            if !verified_kernel::manual_payment_admissible(
                machine
                    .states
                    .iter()
                    .any(|s| s.id == o["state"].as_str().unwrap_or("") && s.terminal),
                o["payment"]["provider"] == "paypal",
                ["pending", "authorized"].contains(&current),
                target == "paid",
            ) {
                return Err(conflict("Invalid payment transition"));
            }
            o["payment"]["state"] = json!(target);
        }
        "delivery" => {
            if let Some(reason) = guard(&o, &machine, kind, target) {
                return Err(conflict(reason));
            }
            let index = v["deliveryIndex"].as_u64().unwrap_or(0) as usize;
            let d = o["deliveries"]
                .as_array_mut()
                .and_then(|v| v.get_mut(index))
                .ok_or(bad("Order has no delivery"))?;
            let current = d["state"].as_str().unwrap_or("open");
            if !matches!(
                (current, target),
                ("open", "shipped") | ("shipped", "delivered")
            ) {
                return Err(conflict("Invalid delivery transition"));
            }
            if target == "shipped"
                && let Some(track) = v["trackingCode"].as_str()
            {
                if track.len() > 100 {
                    return Err(bad("Tracking code too long"));
                }
                d["trackingCode"] = json!(track);
            }
            d["state"] = json!(target);
        }
        _ => return Err(bad("Kind must be payment or delivery")),
    }
    sqlx::query("INSERT INTO order_activity(tenant,order_id,actor,kind,data) VALUES($1,$2,$3,'transition',$4)").bind(&t).bind(&id).bind(header(&h,"x-rac-user").unwrap_or("unknown")).bind(json!({"kind":kind,"state":target,"revision":revision+1,"trackingCode":v["trackingCode"],"deliveryIndex":v["deliveryIndex"],"requestKey":request_key})).execute(&mut *tx).await?;
    o["revision"] = json!(revision + 1);
    crate::commerce::order_fields(&mut o);
    sqlx::query("UPDATE orders SET data=$1 WHERE tenant=$2 AND id=$3")
        .bind(&o)
        .bind(&t)
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    // Completed cart and order lookup return the same latest operational state.
    sqlx::query("UPDATE carts SET data=jsonb_set(data,'{order}',$1) WHERE tenant=$2 AND id=$3")
        .bind(&o)
        .bind(&t)
        .bind(r.get::<Value, _>("data")["cart"]["id"].as_str().unwrap())
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'order.updated',$2)")
        .bind(&t)
        .bind(json!({"orderId":id,"kind":kind,"state":target,"revision":revision+1}))
        .execute(&mut *tx)
        .await?;
    let event_kind = match kind {
        "order" => "order.state_changed",
        "payment" => "payment.state_changed",
        _ => "delivery.state_changed",
    };
    let from = r.get::<Value, _>("data");
    let mut event_order = o.clone();
    if let Some(cart) = event_order["cart"].as_object_mut() {
        cart.remove("token");
    }
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,$2,$3)").bind(&t).bind(event_kind).bind(json!({"orderId":id,"kind":kind,"from":if kind=="order" {from["state"].clone()} else if kind=="payment" {from["payment"]["state"].clone()} else {from["deliveries"][v["deliveryIndex"].as_u64().unwrap_or(0) as usize]["state"].clone()},"state":target,"revision":revision+1,"requestKey":request_key,"order":event_order})).execute(&mut *tx).await?;
    let mut response = o.clone();
    if let Some(cart) = response["cart"].as_object_mut() {
        cart.remove("token");
    }
    response["workflow"] = workflow(&response, &machine, machine_revision);
    if let Some(key) = request_key {
        sqlx::query("INSERT INTO order_transition_requests(tenant,request_key,order_id,fingerprint,response) VALUES($1,$2,$3,$4,$5)").bind(&t).bind(key).bind(&id).bind(fingerprint).bind(&response).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    if let Some(cart) = o["cart"].as_object_mut() {
        cart.remove("token");
    }
    Ok(Json(response))
}
