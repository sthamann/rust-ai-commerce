//! Optimistic cart mutations and quantity normalization.
use crate::*;

pub(crate) async fn set_items(
    a: &App,
    h: &RequestContext,
    items: Vec<Item>,
    expected: Option<i64>,
) -> Result<StoredCart> {
    set_cart(a, h, items, expected, None).await
}
pub(crate) async fn set_cart(
    a: &App,
    h: &RequestContext,
    items: Vec<Item>,
    expected: Option<i64>,
    buyer: Option<Option<Value>>,
) -> Result<StoredCart> {
    validate_items(&items)?;
    for i in &items {
        marketing::admit_product(a, h, &i.id).await?;
    }
    // Validate the candidate before taking a cart lock. These helpers use the
    // pool: holding one connection per edit while requesting another can exhaust
    // the pool and deadlock concurrent edits. The revision is checked again below.
    let r = sqlx::query("SELECT * FROM carts WHERE tenant=$1 AND token=$2")
        .bind(tenant(h)?)
        .bind(token(h)?)
        .fetch_optional(&a.db)
        .await?
        .ok_or(bad("Cart not found"))?;
    let mut c = stored(&r)?;
    if c.status != "open" {
        return Err(conflict("Cart is terminal"));
    }
    if expected.is_some_and(|v| v != c.revision) {
        return Err(conflict("Cart revision changed; reload before editing"));
    }
    let (_, chain) = language_context(a, h).await?;
    let ps = commerce::cart_products(a, &c.tenant, &chain, &items).await?;
    c.data.items = items
        .into_iter()
        .map(|mut item| {
            let p = ps
                .iter()
                .find(|p| p.id == item.id)
                .ok_or(bad("Unknown product"))?;
            item.quantity = normalized_quantity(p, item.quantity)?;
            Ok(item)
        })
        .collect::<Result<Vec<_>>>()?;
    c.data.locale = language_context(a, h).await?.0;
    if let Some(b) = buyer {
        c.data.buyer = b;
    }
    cart_json(a, &c).await?;
    let mut tx = a.db.begin().await?;
    let locked =
        sqlx::query("SELECT revision,status FROM carts WHERE tenant=$1 AND token=$2 FOR UPDATE")
            .bind(&c.tenant)
            .bind(&c.token)
            .fetch_one(&mut *tx)
            .await?;
    if locked.get::<String, _>("status") != "open" {
        return Err(conflict("Cart is terminal"));
    }
    if locked.get::<i64, _>("revision") != c.revision {
        return Err(conflict("Cart revision changed; reload before editing"));
    }
    c.revision += 1;
    sqlx::query("UPDATE carts SET data=$1,revision=$2 WHERE id=$3")
        .bind(json!(c.data))
        .bind(c.revision)
        .bind(&c.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(c)
}
