//! Revision-checked payment and delivery state transitions.
use super::*;

pub(crate) async fn transition_order(
    State(a): State<App>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    let mut tx = a.db.begin().await?;
    let r = sqlx::query("SELECT data FROM orders WHERE tenant=$1 AND id=$2 FOR UPDATE")
        .bind(&t)
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Order not found".into()))?;
    let mut o: Value = r.get("data");
    let revision = o["revision"].as_i64().unwrap_or(1);
    if v["revision"].as_i64() != Some(revision) {
        return Err(conflict("Order revision changed"));
    }
    let target = v["state"].as_str().ok_or(bad("State required"))?;
    let kind = v["kind"].as_str().ok_or(bad("Kind required"))?;
    match kind {
        "payment" => {
            let current = o["payment"]["state"].as_str().unwrap_or("");
            if target != "paid" || !["pending", "authorized"].contains(&current) {
                return Err(conflict("Invalid payment transition"));
            }
            o["payment"]["state"] = json!(target);
        }
        "delivery" => {
            let d = o["deliveries"]
                .as_array_mut()
                .and_then(|v| v.first_mut())
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
    o["revision"] = json!(revision + 1);
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
        .bind(t)
        .bind(json!({"orderId":id,"kind":kind,"state":target,"revision":revision+1}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(o))
}
