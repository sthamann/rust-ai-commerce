//! Public method discovery and revision-checked checkout context changes.
use super::*;

pub(crate) async fn options(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = tenant(&h)?;
    let (s, revision) = scoped_config(&a, &t, marketing::channel_id(&h)).await?;
    let business = if header(&h, "sw-context-token").is_some() {
        s.is_business(&load_cart(&a, &h).await?.data.group)
    } else {
        false
    };
    let locale = header(&h, "x-commerce-locale").unwrap_or(&s.main_locale);
    Ok(Json(
        json!({"mainLocale":s.main_locale,"locales":s.locales,"countries":s.countries,"shipping":s.shipping.iter().filter(|v|v.active).map(|v|super::method_text::localized_shipping(v,locale,&s)).collect::<Vec<_>>(),"payments":s.payments.iter().filter(|v|v.active&&(!v.business_only||business)).map(|v|super::method_text::localized_payment(v,locale,&s)).collect::<Vec<_>>(),"revision":revision}),
    ))
}
pub(crate) async fn select_checkout(
    State(a): State<App>,
    h: HeaderMap,
    Json(v): Json<Value>,
) -> Result<Json<Value>> {
    let mut requested: CheckoutSelection = serde_json::from_value(v["checkout"].clone())
        .map_err(|_| bad("Invalid checkout selection"))?;
    if v["checkout"]["address"].is_object()
        && v["checkout"]["address"]["country"].is_null()
        && let Some(ad) = &mut requested.address
    {
        ad.country = requested.country.clone();
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
    if requested.billing_address_id.is_some() || requested.shipping_address_id.is_some() {
        let (_, email) = accounts::identity(&a, &h).await?;
        if c.data.customer_id.is_none() || c.data.email.as_deref() != Some(&email) {
            return Err(Error(
                StatusCode::FORBIDDEN,
                "Address selection requires the owning authenticated cart".into(),
            ));
        }
        if let Some(id) = &requested.billing_address_id {
            requested.billing_address =
                Some(accounts::address_get(&mut tx, &c.tenant, &email, id).await?);
        }
        if let Some(id) = &requested.shipping_address_id {
            requested.address = Some(accounts::address_get(&mut tx, &c.tenant, &email, id).await?);
            requested.country = requested.address.as_ref().unwrap().country.clone();
        }
    }
    if let Some(email) = &requested.customer_email {
        let email = auth::email(&json!({"email":email}))?;
        if c.data.customer_id.is_some() && c.data.email.as_deref() != Some(&email) {
            return Err(bad("Checkout email differs from authenticated customer"));
        }
        c.data.email = Some(email);
    }
    let (settings, _) = scoped_config(&a, &c.tenant, &c.data.sales_channel).await?;
    for ad in [&mut requested.address, &mut requested.billing_address]
        .into_iter()
        .flatten()
    {
        ad.validate()?;
        validate_address_geography(ad, &settings)?;
    }
    if requested
        .address
        .as_ref()
        .is_some_and(|a| a.country != requested.country)
    {
        return Err(bad(
            "Shipping address country differs from checkout country",
        ));
    }
    if requested.billing_address.is_none() {
        requested.billing_address = requested.address.clone();
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
