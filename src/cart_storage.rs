//! Cart creation, loading and input validation.
use crate::*;

pub(crate) async fn load_cart(a: &App, h: &HeaderMap) -> Result<StoredCart> {
    let r = sqlx::query("SELECT * FROM carts WHERE tenant=$1 AND token=$2")
        .bind(tenant(h)?)
        .bind(token(h)?)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Cart not found".into()))?;
    let c = stored(&r)?;
    if c.data.sales_channel != marketing::channel_id(h) {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Cart belongs to another sales channel".into(),
        ));
    }
    marketing::channel(a, &c.tenant, &c.data.sales_channel, &c.data.locale).await?;
    Ok(c)
}
pub(crate) async fn new_cart(
    a: &App,
    t: &str,
    session: &str,
    locale: &str,
    channel: &str,
) -> Result<StoredCart> {
    let (settings, _) = commerce::config(a, t).await?;
    let country = if settings.countries.contains(&"DE".into()) {
        "DE".into()
    } else {
        settings
            .countries
            .first()
            .cloned()
            .ok_or(bad("No delivery country configured"))?
    };
    let shipping = settings
        .shipping
        .iter()
        .filter(|v| v.active && v.countries.contains(&country))
        .min_by_key(|v| v.id != "pickup")
        .ok_or(bad("No shipping method configured"))?;
    let payment = settings
        .payments
        .iter()
        .filter(|v| v.active && !v.business_only)
        .min_by_key(|v| v.id != "demo-card")
        .ok_or(bad("No consumer payment method configured"))?;
    let checkout = commerce::CheckoutSelection {
        country,
        shipping_method_id: shipping.id.clone(),
        payment_method_id: payment.id.clone(),
        ..commerce::CheckoutSelection::defaults()
    };
    let c = StoredCart {
        id: uid(),
        tenant: t.into(),
        token: uid(),
        data: Cart {
            coupons: vec![],
            sales_channel: "default".into(),
            app_configurations: HashMap::new(),
            items: vec![],
            group: "consumer".into(),
            email: None,
            customer_id: None,
            company: None,
            session: session.chars().take(128).collect(),
            buyer: None,
            order: None,
            locale: locale.into(),
            channel: channel.into(),
            checkout: Some(checkout),
        },
        revision: 1,
        status: "open".into(),
    };
    sqlx::query("INSERT INTO carts(id,tenant,token,data) VALUES($1,$2,$3,$4)")
        .bind(&c.id)
        .bind(t)
        .bind(&c.token)
        .bind(json!(c.data))
        .execute(&a.db)
        .await?;
    Ok(c)
}
pub(crate) fn validate_items(items: &[Item]) -> Result<()> {
    if items.len() > 100 {
        return Err(bad("Maximum 100 distinct items"));
    }
    let mut seen = std::collections::HashSet::new();
    for i in items {
        if i.quantity == 0 || i.quantity > 10000 || !seen.insert(&i.id) {
            return Err(bad(
                "Items must have unique IDs and quantities from 1 to 10000",
            ));
        }
    }
    Ok(())
}

pub(crate) async fn new_cart_context(
    a: &App,
    h: &HeaderMap,
    session: &str,
    transport: &str,
) -> Result<StoredCart> {
    let t = tenant(h)?;
    let locale = language_context(a, h).await?.0;
    let channel = marketing::channel_id(h);
    marketing::channel(a, &t, channel, &locale).await?;
    let identity = if header(h, "x-customer-token").is_some() {
        Some(accounts::identity(a, h).await?.1)
    } else {
        None
    };
    let mut c = new_cart(a, &t, session, &locale, transport).await?;
    c.data.sales_channel = channel.into();
    if let Some(email) = identity {
        let r = sqlx::query("SELECT * FROM customers WHERE tenant=$1 AND email=$2")
            .bind(&t)
            .bind(&email)
            .fetch_one(&a.db)
            .await?;
        c.data.email = Some(email.clone());
        c.data.customer_id = Some(r.get("id"));
        c.data.group = r.get("group_name");
        c.data.company = r.get("company");
        if let Some(checkout) = &mut c.data.checkout {
            checkout.customer_email = Some(email.clone());
            checkout.billing_address_id = r.get("default_billing_address_id");
            checkout.shipping_address_id = r.get("default_shipping_address_id");
            let mut conn = a.db.acquire().await?;
            if let Some(id) = &checkout.billing_address_id {
                checkout.billing_address =
                    Some(accounts::address_get(&mut conn, &t, &email, id).await?);
            }
            if let Some(id) = &checkout.shipping_address_id {
                checkout.address = Some(accounts::address_get(&mut conn, &t, &email, id).await?);
                checkout.country = checkout.address.as_ref().unwrap().country.clone();
            }
            let p: Value = r.get("profile");
            if let Some(id) = p["defaultPaymentMethodId"].as_str() {
                checkout.payment_method_id = id.into();
            }
            let (settings, _) = commerce::config(a, &t).await?;
            *checkout = commerce::resolve_selection(checkout.clone(), &c.data.group, &settings);
        }
    }
    sqlx::query("UPDATE carts SET data=$1 WHERE id=$2")
        .bind(json!(c.data))
        .bind(&c.id)
        .execute(&a.db)
        .await?;
    Ok(c)
}
