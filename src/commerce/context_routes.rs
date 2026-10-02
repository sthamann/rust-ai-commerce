//! Public method discovery and revision-checked checkout context changes.
use super::*;

pub(crate) async fn options(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let (s, revision) = config(&a, &t).await?;
    let business = if header(&h, "sw-context-token").is_some() {
        load_cart(&a, &h).await?.data.group == "business"
    } else {
        false
    };
    Ok(Json(
        json!({"countries":s.countries,"shipping":s.shipping.into_iter().filter(|v|v.active).collect::<Vec<_>>(),"payments":s.payments.into_iter().filter(|v|v.active&&(!v.business_only||business)).collect::<Vec<_>>(),"revision":revision}),
    ))
}
pub(crate) async fn select_checkout(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let requested: CheckoutSelection = serde_json::from_value(v["checkout"].clone())
        .map_err(|_| bad("Invalid checkout selection"))?;
    if let Some(ad) = &requested.address {
        for f in [&ad.name, &ad.street, &ad.postal_code, &ad.city] {
            if f.trim().is_empty() || f.len() > 160 {
                return Err(bad(
                    "Complete address fields required (maximum 160 characters)",
                ));
            }
        }
    }
    let mut tx = a.db.begin().await?;
    let r = sqlx::query("SELECT * FROM carts WHERE tenant=$1 AND token=$2 FOR UPDATE")
        .bind(tenant(&h)?)
        .bind(token(&h)?)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Cart not found".into()))?;
    let mut c = stored(&r)?;
    if c.status != "open" {
        return Err(conflict("Cart is terminal"));
    }
    if v["revision"].as_i64() != Some(c.revision) {
        return Err(conflict("Cart revision changed; reload before editing"));
    }
    c.data.checkout = Some(requested);
    c.revision += 1;
    let q = cart_json(&a, &c).await?;
    if q["selectionNeedsConfirmation"] == true {
        return Err(bad("Selected country, shipping or payment is unavailable"));
    }
    sqlx::query("UPDATE carts SET data=$1,revision=$2 WHERE id=$3")
        .bind(json!(c.data))
        .bind(c.revision)
        .bind(c.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(q))
}
