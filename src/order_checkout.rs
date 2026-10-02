//! Atomic checkout, stock locks, extension policy and idempotency.
use crate::*;

pub(crate) async fn checkout(a: &App, h: &HeaderMap, key: &str) -> Result<Value> {
    if key.len() < 8 || key.len() > 128 {
        return Err(bad("Idempotency-Key must contain 8..128 characters"));
    }
    let mut tx = a.db.begin().await?;
    let lock_key = format!("{}:{key}", tenant(h)?);
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
        .bind(lock_key)
        .execute(&mut *tx)
        .await?;
    let r = sqlx::query("SELECT * FROM carts WHERE tenant=$1 AND token=$2 FOR UPDATE")
        .bind(tenant(h)?)
        .bind(token(h)?)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(bad("Cart not found"))?;
    let mut c = stored(&r)?;
    let mut purchase = json!({"items":c.data.items,"checkout":c.data.checkout,"group":c.data.group,"buyer":c.data.buyer});
    if !c.data.app_configurations.is_empty() {
        purchase["appConfigurations"] = json!(c.data.app_configurations);
    }
    let fingerprint = hash(&format!("{}:{}", c.id, purchase));
    if let Some(r) = sqlx::query(
        "SELECT data,fingerprint,cart_id FROM orders WHERE tenant=$1 AND idempotency_key=$2",
    )
    .bind(&c.tenant)
    .bind(key)
    .fetch_optional(&mut *tx)
    .await?
    {
        if r.get::<String, _>("cart_id") != c.id
            || (c.status == "open" && r.get::<String, _>("fingerprint") != fingerprint)
        {
            return Err(conflict("Idempotency key was used for another purchase"));
        }
        return Ok(r.get("data"));
    }
    if c.status != "open" {
        return Err(conflict("Cart already completed or cancelled"));
    }
    if c.data.items.is_empty() {
        return Err(bad("Cart is empty"));
    }
    let ids: Vec<String> = c.data.items.iter().map(|i| i.id.clone()).collect();
    let rows =
        sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=ANY($2) ORDER BY id FOR UPDATE")
            .bind(&c.tenant)
            .bind(ids)
            .fetch_all(&mut *tx)
            .await?;
    let ps: Vec<_> = rows.iter().map(product).collect();
    // Configuration cannot change between this price calculation and order commit.
    let settings =
        sqlx::query("SELECT data,revision FROM commerce_settings WHERE tenant=$1 FOR SHARE")
            .bind(&c.tenant)
            .fetch_one(&mut *tx)
            .await?;
    let config: commerce::Settings = serde_json::from_value(settings.get("data"))
        .map_err(|_| bad("Invalid commerce configuration"))?;
    let selected = commerce::selection(&c.data);
    apps::validate_configurations(&mut tx, &c).await?;
    if selected.shipping_method_id != "pickup" && selected.address.is_none() {
        return Err(bad("Delivery address required"));
    }
    let priced = commerce::tax_products(&ps, &selected, &config)?;
    let mut q = commerce::enrich(
        quote(&c, &priced)?,
        &c,
        &priced,
        &config,
        settings.get("revision"),
    )?;
    commerce::dates_conn(&mut tx, &mut q).await?;
    for i in &c.data.items {
        let p = ps.iter().find(|p| p.id == i.id).unwrap();
        if p.stock < i.quantity as i32 {
            return Err(conflict("Insufficient stock"));
        }
    }
    let minor = (q["price"]["totalPrice"].as_f64().unwrap() * 100.).round() as i64;
    if c.data.group == "business" {
        // A revision change on another replica must never leave this checkout on a stale policy.
        let source: String =
            sqlx::query_scalar("SELECT wat FROM extensions WHERE tenant=$1 FOR SHARE")
                .bind(&c.tenant)
                .fetch_one(&mut *tx)
                .await?;
        let cached = a.sandboxes.read().unwrap().get(&c.tenant).cloned();
        let sandbox = if let Some(cached) = cached.filter(|s| s.source_matches(&source)) {
            cached
        } else {
            let compiled = tokio::task::spawn_blocking(move || Sandbox::new(&source))
                .await
                .map_err(|e| bad(e.to_string()))?
                .map_err(bad)?;
            let compiled = Arc::new(compiled);
            a.sandboxes
                .write()
                .unwrap()
                .insert(c.tenant.clone(), compiled.clone());
            compiled
        };
        if !sandbox.approve(minor, 100_000).map_err(bad)? {
            return Err(conflict("Company purchase rejected by tenant extension"));
        }
    }
    let external = q["paymentMethod"]["mode"] == "app";
    if external && selected.payment_method_id != "paypal-sandbox" {
        return Err(bad("Provider connector is not configured"));
    }
    if external {
        payments::account(&c.tenant)?;
        payments::base()?;
    }
    let id = uid();
    // Explicit simulated authorization: no external money is charged.
    let mut order = json!({"id":id,"orderNumber":format!("RAC-{}",&id[..8]),"cart":q,"state":"placed","channel":c.data.channel,"revision":1,"deliveries":q["deliveries"],"payment":{"method":q["paymentMethod"],"provider":if q["paymentMethod"]["mode"]=="simulated"{"simulated"}else{"manual"},"state":if q["paymentMethod"]["mode"]=="simulated"{"authorized"}else{"pending"},"realMoneyCharged":false},"customerGroup":c.data.group});
    sqlx::query("INSERT INTO orders(id,tenant,cart_id,idempotency_key,fingerprint,data) VALUES($1,$2,$3,$4,$5,$6)").bind(&id).bind(&c.tenant).bind(&c.id).bind(key).bind(&fingerprint).bind(&order).execute(&mut *tx).await?;
    if external {
        payments::prepare(&mut tx, &c, &mut order, minor).await?;
        sqlx::query("UPDATE orders SET data=$1 WHERE id=$2")
            .bind(&order)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    for i in &c.data.items {
        sqlx::query(
            "UPDATE products SET stock=stock-$1,revision=revision+1 WHERE tenant=$2 AND id=$3",
        )
        .bind(i.quantity as i32)
        .bind(&c.tenant)
        .bind(&i.id)
        .execute(&mut *tx)
        .await?;
    }
    c.data.order = Some(order.clone());
    sqlx::query("UPDATE carts SET status='completed',data=$1,revision=revision+1 WHERE id=$2")
        .bind(json!(c.data))
        .bind(&c.id)
        .execute(&mut *tx)
        .await?;
    if !external && let Some(e)=sqlx::query("UPDATE exposures SET rewarded=true WHERE tenant=$1 AND session=$2 AND rewarded=false RETURNING variant").bind(&c.tenant).bind(&c.data.session).fetch_optional(&mut *tx).await? {
        sqlx::query("UPDATE policy SET purchases=purchases+1 WHERE tenant=$1 AND variant=$2").bind(&c.tenant).bind(e.get::<String,_>("variant")).execute(&mut *tx).await?;
    }
    sqlx::query("INSERT INTO outbox(tenant,kind,data) VALUES($1,'order.placed',$2)")
        .bind(&c.tenant)
        .bind(json!({"orderId":id,"totalMinor":minor}))
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(order)
}
