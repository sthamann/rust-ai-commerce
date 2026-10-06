//! Transactional provider receipts and order state updates; external responses cannot invent amounts or tenants.
use super::*;
pub(crate) async fn persist(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    p: &Attempt,
    op: &str,
    input: &Value,
    v: &Value,
) -> Result<()> {
    if p.provider != "paypal" {
        return generic_receipts::persist(tx, p, op, input, v).await;
    }
    let mut state = p.state.clone();
    let mut capture = p.capture.clone();
    let mut provider_order = p.provider_order.clone();
    let mut url: Option<String> = None;
    let mut refunded = p.refunded;
    if op == "refund" {
        let amount = input["amountMinor"]
            .as_i64()
            .ok_or(bad("Refund amount missing"))?;
        if v["status"] == "PENDING" {
            return Err(Error(
                StatusCode::ACCEPTED,
                "Provider refund pending".into(),
            ));
        }
        if !receipt_matches(
            amount,
            &v["amount"],
            &p.currency,
            v["status"] == "COMPLETED",
        )? || v["id"].as_str().is_none()
        {
            return Err(bad("Refund receipt does not confirm the requested amount"));
        }
        refunded = refunded
            .checked_add(amount)
            .filter(|v| *v <= p.amount)
            .ok_or(bad("Refund exceeds payment"))?;
        state = if refunded == p.amount {
            "refunded"
        } else {
            "partially_refunded"
        }
        .into();
    } else {
        paypal::validate_order(p, v)?;
        provider_order = Some(
            v["id"]
                .as_str()
                .ok_or(bad("Provider order ID missing"))?
                .into(),
        );
        if v["status"] == "COMPLETED" {
            let captures = v["purchase_units"][0]["payments"]["captures"]
                .as_array()
                .filter(|c| c.len() == 1)
                .ok_or(bad("Expected one capture receipt"))?;
            let c = &captures[0];
            if !receipt_matches(
                p.amount,
                &c["amount"],
                &p.currency,
                c["status"] == "COMPLETED",
            )? {
                return Err(bad("Capture receipt does not match payment"));
            }
            capture = Some(
                c["id"]
                    .as_str()
                    .filter(|s| s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'))
                    .ok_or(bad("Capture ID missing"))?
                    .into(),
            );
            if ["pending", "ready", "approved"].contains(&state.as_str()) {
                state = "captured".into();
            } else if ["cancelled", "expired"].contains(&state.as_str()) {
                state = "captured_late".into();
            }
        } else if ["pending", "ready", "approved"].contains(&state.as_str()) {
            state = if v["status"] == "APPROVED" {
                "approved"
            } else {
                "ready"
            }
            .into();
            url = v["links"]
                .as_array()
                .and_then(|ls| {
                    ls.iter().find(|l| {
                        ["payer-action", "approve"].contains(&l["rel"].as_str().unwrap_or(""))
                    })
                })
                .and_then(|l| l["href"].as_str())
                .map(str::to_string);
            if let Some(s) = &url {
                let parsed =
                    reqwest::Url::parse(s).map_err(|_| bad("Invalid provider approval URL"))?;
                if parsed.scheme() != "https"
                    || !parsed.host_str().is_some_and(|h| {
                        if p.environment == "live" {
                            h == "paypal.com" || h == "www.paypal.com"
                        } else {
                            h == "sandbox.paypal.com" || h.ends_with(".sandbox.paypal.com")
                        }
                    })
                {
                    return Err(bad("Approval URL must belong to PayPal Sandbox"));
                }
            }
        }
    }
    let transitioned = state != p.state;
    sqlx::query("UPDATE payment_attempts SET state=$1,provider_order=coalesce($2,provider_order),approval_url=coalesce($3,approval_url),capture_id=$4,refunded_minor=$5,revision=revision+1 WHERE tenant=$6 AND id=$7").bind(&state).bind(provider_order).bind(url).bind(capture).bind(refunded).bind(&p.tenant).bind(&p.id).execute(&mut **tx).await?;
    if transitioned && state == "approved" {
        // Approval is verified by the provider adapter, never by a browser return URL.
        enqueue_tx(
            tx,
            &p.tenant,
            &p.id,
            "capture",
            &format!("approved:{}", p.id),
            &json!({}),
        )
        .await?;
    }
    if transitioned {
        update_order(tx, p, &state).await?;
    }
    Ok(())
}
pub(crate) async fn update_order(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    p: &Attempt,
    state: &str,
) -> Result<()> {
    let mut o: Value =
        sqlx::query_scalar("SELECT data FROM orders WHERE tenant=$1 AND id=$2 FOR UPDATE")
            .bind(&p.tenant)
            .bind(&p.order)
            .fetch_one(&mut **tx)
            .await?;
    o["payment"]["state"] = json!(state);
    o["payment"]["realMoneyCharged"] = json!(
        p.environment == "live"
            && [
                "captured",
                "captured_late",
                "partially_refunded",
                "refunded"
            ]
            .contains(&state)
    );
    o["revision"] = json!(o["revision"].as_i64().unwrap_or(1) + 1);
    if state == "captured_late" {
        o["state"] = json!("payment_review");
    }
    if ["cancelled", "expired"].contains(&state) {
        o["state"] = json!(state);
    }
    crate::commerce::order_fields(&mut o);
    sqlx::query("UPDATE orders SET data=$1 WHERE tenant=$2 AND id=$3")
        .bind(&o)
        .bind(&p.tenant)
        .bind(&p.order)
        .execute(&mut **tx)
        .await?;
    sqlx::query("UPDATE carts SET data=jsonb_set(data,'{order}',$1) WHERE tenant=$2 AND id=$3")
        .bind(&o)
        .bind(&p.tenant)
        .bind(o["cart"]["id"].as_str().unwrap())
        .execute(&mut **tx)
        .await?;
    let mut event_order = o.clone();
    if let Some(cart) = event_order["cart"].as_object_mut() {
        cart.remove("token");
    }
    let kind = if state == "captured" {
        "payment.captured"
    } else {
        "payment.updated"
    };
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,$2,$3)").bind(&p.tenant).bind(kind).bind(json!({"orderId":p.order,"attemptId":p.id,"state":state,"provider":p.provider,"environment":p.environment,"realMoneyCharged":p.environment=="live" && state=="captured","order":event_order})).execute(&mut **tx).await?;
    if state == "captured" && let Some(e)=sqlx::query("UPDATE exposures SET rewarded=true WHERE tenant=$1 AND session=(SELECT data->>'session' FROM carts WHERE id=$2) AND rewarded=false RETURNING variant").bind(&p.tenant).bind(o["cart"]["id"].as_str().unwrap()).fetch_optional(&mut **tx).await?{sqlx::query("UPDATE policy SET purchases=purchases+1 WHERE tenant=$1 AND variant=$2").bind(&p.tenant).bind(e.get::<String,_>("variant")).execute(&mut **tx).await?;}
    Ok(())
}
pub(crate) async fn release_stock(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    p: &Attempt,
    state: &str,
    void_confirmed: bool,
) -> Result<()> {
    if !verified_kernel::reservation_release_admissible(
        ["pending", "ready", "approved"].contains(&p.state.as_str()),
        p.state == "authorized",
        void_confirmed,
    ) {
        return Err(conflict(
            "Captured or uncertain payment cannot release inventory",
        ));
    }
    let rows=sqlx::query("UPDATE inventory_reservations SET released=true WHERE tenant=$1 AND attempt_id=$2 AND NOT released RETURNING product_id,quantity").bind(&p.tenant).bind(&p.id).fetch_all(&mut **tx).await?;
    for row in rows {
        sqlx::query(
            "UPDATE products SET stock=stock+$1,revision=revision+1 WHERE tenant=$2 AND id=$3",
        )
        .bind(row.get::<i32, _>("quantity"))
        .bind(&p.tenant)
        .bind(row.get::<String, _>("product_id"))
        .execute(&mut **tx)
        .await?;
    }
    sqlx::query(
        "UPDATE payment_attempts SET state=$1,revision=revision+1 WHERE tenant=$2 AND id=$3",
    )
    .bind(state)
    .bind(&p.tenant)
    .bind(&p.id)
    .execute(&mut **tx)
    .await?;
    update_order(tx, p, state).await
}
