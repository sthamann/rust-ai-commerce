//! Atomic checkout, stock locks, extension policy and idempotency.
use crate::*;

pub(crate) async fn checkout(a: &App, h: &HeaderMap, key: &str) -> Result<Value> {
    if key.len() < 8 || key.len() > 128 {
        return Err(bad("Idempotency-Key must contain 8..128 characters"));
    }
    let admitted = load_cart(a, h).await?;
    for i in &admitted.data.items {
        marketing::admit_product(a, h, &i.id).await?;
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
    let mut purchase = json!({"items":c.data.items,"checkout":c.data.checkout,"group":c.data.group,"buyer":c.data.buyer,"coupons":c.data.coupons,"salesChannel":c.data.sales_channel});
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
        if !verified_kernel::replay_admissible(
            r.get::<String, _>("cart_id") == c.id,
            c.status == "open",
            r.get::<String, _>("fingerprint") == fingerprint,
        ) {
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
    let parents:Vec<String>=sqlx::query_scalar("SELECT DISTINCT parent_id FROM products WHERE tenant=$1 AND id=ANY($2) AND parent_id IS NOT NULL").bind(&c.tenant).bind(&ids).fetch_all(&mut *tx).await?;
    let mut locks = ids.clone();
    locks.extend(parents);
    locks.sort();
    locks.dedup();
    let rows =
        sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=ANY($2) ORDER BY id FOR UPDATE")
            .bind(&c.tenant)
            .bind(locks)
            .fetch_all(&mut *tx)
            .await?;
    let locked: Vec<_> = rows.iter().map(product).collect();
    let ps = locked
        .iter()
        .filter(|p| ids.contains(&p.id))
        .map(|p| {
            let mut p = p.clone();
            if let Some(parent) = locked
                .iter()
                .find(|root| Some(&root.id) == p.parent_id.as_ref())
            {
                p.extra = commerce::inherited_extra(&parent.extra, &p.extra);
            }
            p
        })
        .collect::<Vec<_>>();
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
    if selected.shipping_method_id != "pickup"
        && selected.address.is_none()
        && !ps.iter().all(|p| p.extra["digital"] == true)
    {
        return Err(bad("Delivery address required"));
    }
    let priced = commerce::tax_products(&ps, &selected, &config)?;
    let mut q = commerce::enrich(
        marketing::promote(
            &mut tx,
            &c,
            commerce::enrich(
                quote(&c, &priced)?,
                &c,
                &priced,
                &config,
                settings.get("revision"),
            )?,
        )
        .await?,
        &c,
        &priced,
        &config,
        settings.get("revision"),
    )?;
    commerce::dates_conn(&mut tx, &mut q).await?;
    for i in &c.data.items {
        let p = ps.iter().find(|p| p.id == i.id).unwrap();
        if !u64::try_from(p.stock)
            .is_ok_and(|stock| verified_kernel::stock_admissible(stock, u64::from(i.quantity)))
        {
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
    if external && staging::parent(a, &c.tenant).await?.is_some() {
        return Err(bad("External payments are disabled in private sandboxes"));
    }
    if external && !["paypal-sandbox", "paypal-live"].contains(&selected.payment_method_id.as_str())
    {
        return Err(bad("Provider connector is not configured"));
    }
    if external {
        payments::account(&c.tenant)?;
        payments::base()?;
        if (selected.payment_method_id == "paypal-live") != (payments::environment() == "live") {
            return Err(bad("Payment method environment mismatch"));
        }
    }
    // Financial providers/manual invoices require usable contact and billing data.
    // The explicit simulated demo method keeps legacy headless fixture carts compatible.
    if !verified_kernel::checkout_contact_admissible(
        q["paymentMethod"]["mode"] == "simulated",
        c.data.email.is_some(),
        selected.billing_address.is_some(),
    ) {
        return Err(bad("Customer email and billing address required"));
    }
    let customer_snapshot = accounts::order_snapshot(&mut tx, &c, &selected).await?;
    let id = uid();
    // Explicit simulated authorization: no external money is charged.
    let mut order = json!({"id":id,"orderNumber":format!("RAC-{}",&id[..8]),"cart":q,"state":"placed","channel":c.data.channel,"revision":1,"deliveries":q["deliveries"],"payment":{"method":q["paymentMethod"],"provider":if q["paymentMethod"]["mode"]=="simulated"{"simulated"}else{"manual"},"state":if q["paymentMethod"]["mode"]=="simulated"{"authorized"}else{"pending"},"realMoneyCharged":false},"customerGroup":c.data.group});
    order
        .as_object_mut()
        .unwrap()
        .extend(customer_snapshot.as_object().unwrap().clone());
    commerce::order_fields(&mut order);
    sqlx::query("INSERT INTO orders(id,tenant,cart_id,idempotency_key,fingerprint,data) VALUES($1,$2,$3,$4,$5,$6)").bind(&id).bind(&c.tenant).bind(&c.id).bind(key).bind(&fingerprint).bind(&order).execute(&mut *tx).await?;
    marketing::record_uses(&mut tx, &c.tenant, &id, &q).await?;
    assets::snapshot(&mut tx, &c, &id).await?;
    if external {
        payments::prepare(&mut tx, &c, &mut order, minor).await?;
        commerce::order_fields(&mut order);
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
    if let Some(customer_id) = &c.data.customer_id {
        sqlx::query("UPDATE customers SET last_payment_method_id=$1 WHERE tenant=$2 AND id=$3")
            .bind(&selected.payment_method_id)
            .bind(&c.tenant)
            .bind(customer_id)
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
