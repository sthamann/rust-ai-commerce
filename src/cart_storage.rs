//! Cart creation, loading and input validation.
use crate::*;

pub(crate) async fn load_cart(a: &App, h: &HeaderMap) -> Result<StoredCart> {
    let r = sqlx::query("SELECT * FROM carts WHERE tenant=$1 AND token=$2")
        .bind(tenant(h)?)
        .bind(token(h)?)
        .fetch_optional(&a.db)
        .await?
        .ok_or(Error(StatusCode::NOT_FOUND, "Cart not found".into()))?;
    stored(&r)
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
        address: None,
    };
    let c = StoredCart {
        id: uid(),
        tenant: t.into(),
        token: uid(),
        data: Cart {
            items: vec![],
            group: "consumer".into(),
            email: None,
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
