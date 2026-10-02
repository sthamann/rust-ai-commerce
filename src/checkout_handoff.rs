//! Single-use checkout transfer for independent storefronts; no app-specific catalog or checkout rules.
use crate::*;
pub(crate) fn router() -> Router<App> {
    Router::new()
        .route("/store-api/checkout/handoff", post(issue))
        .route("/store-api/checkout/handoff/consume", post(consume))
}
async fn issue(State(a): State<App>, h: HeaderMap, Json(v): Json<Value>) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let mut tx = a.db.begin().await?;
    let r = sqlx::query("SELECT * FROM carts WHERE tenant=$1 AND token=$2 FOR UPDATE")
        .bind(&t)
        .bind(token(&h)?)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(bad("Cart unavailable"))?;
    let c = stored(&r)?;
    if c.status != "open" || c.data.items.is_empty() || v["revision"].as_i64() != Some(c.revision) {
        return Err(conflict("Cart changed, empty or terminal"));
    }
    let ticket = uid();
    sqlx::query("DELETE FROM checkout_handoffs WHERE tenant=$1 AND expires_at<now()")
        .bind(&t)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO checkout_handoffs(digest,tenant,cart_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes') ON CONFLICT(cart_id) DO UPDATE SET digest=EXCLUDED.digest,expires_at=EXCLUDED.expires_at")
        .bind(hash(&ticket)).bind(&t).bind(&c.id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(
        json!({"checkoutPath":format!("/?shop={t}#checkout/{ticket}"),"expiresInSeconds":600,"singleUse":true}),
    ))
}
async fn consume(State(a): State<App>, h: HeaderMap, Json(v): Json<Value>) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let ticket = v["ticket"]
        .as_str()
        .filter(|s| s.len() == 32 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or(bad("Invalid checkout ticket"))?;
    let mut tx = a.db.begin().await?;
    // Lock the cart first, matching issue/order lock order. The secret remains only in the browser fragment.
    let r = sqlx::query("SELECT c.* FROM carts c JOIN checkout_handoffs h ON h.cart_id=c.id AND h.tenant=c.tenant WHERE h.tenant=$1 AND h.digest=$2 AND h.expires_at>now() FOR UPDATE OF c")
        .bind(&t).bind(hash(ticket)).fetch_optional(&mut *tx).await?
        .ok_or(Error(StatusCode::GONE,"Checkout ticket expired or already used".into()))?;
    let c = stored(&r)?;
    if c.status != "open" {
        return Err(conflict("Cart is terminal"));
    }
    let removed = sqlx::query(
        "DELETE FROM checkout_handoffs WHERE tenant=$1 AND digest=$2 AND expires_at>now()",
    )
    .bind(&t)
    .bind(hash(ticket))
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if removed != 1 {
        return Err(Error(
            StatusCode::GONE,
            "Checkout ticket already used".into(),
        ));
    }
    let r = sqlx::query(
        "UPDATE carts SET token=$1,revision=revision+1 WHERE tenant=$2 AND id=$3 RETURNING *",
    )
    .bind(uid())
    .bind(&t)
    .bind(&c.id)
    .fetch_one(&mut *tx)
    .await?;
    let c = stored(&r)?;
    tx.commit().await?;
    Ok(Json(cart_json(&a, &c).await?))
}
