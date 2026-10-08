//! Atomic checkout, stock locks, extension policy and idempotency.
use crate::*;

pub(crate) async fn checkout(a: &App, h: &RequestContext, key: &str) -> Result<Value> {
    if key.len() < 8 || key.len() > 128 {
        return Err(bad("Idempotency-Key must contain 8..128 characters"));
    }
    let admitted = load_cart(a, h).await?;
    for i in &admitted.data.items {
        marketing::admit_product(a, h, &i.id).await?;
    }
    let (initial_config, _) = commerce::config(a, &admitted.tenant).await?;
    let prepared_policy = if initial_config.is_business(&admitted.data.group) {
        Some(sandbox_cache::prepare(a, &admitted.tenant).await?)
    } else {
        None
    };
    let mut tx = a.db.begin().await?;
    history::context(&mut tx, h, "checkout").await?;
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
    if c.data.customer_id.is_some()
        && let Some(email) = &c.data.email
    {
        history::customer_context(&mut tx, email).await?;
    }
    let mut purchase = json!({"items":c.data.items,"checkout":c.data.checkout,"group":c.data.group,"buyer":c.data.buyer,"coupons":c.data.coupons,"salesChannel":c.data.sales_channel,"currency":c.data.currency});
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
    // Recheck the new catalog admission under product locks: edits cannot deactivate/hide a SKU
    // between the initial request check and the authoritative inventory/price snapshot.
    if rows.iter().any(|r| !r.get::<bool, _>("active")) {
        return Err(Error(StatusCode::NOT_FOUND, "Product unavailable".into()));
    }
    let hidden: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product_channel_visibility WHERE tenant=$1 AND product_id=ANY($2) AND channel_id=$3 AND NOT visible)")
        .bind(&c.tenant).bind(rows.iter().map(|r|r.get::<String,_>("id")).collect::<Vec<_>>())
        .bind(marketing::channel_id(h)).fetch_one(&mut *tx).await?;
    if hidden {
        return Err(Error(
            StatusCode::NOT_FOUND,
            "Product hidden in this sales channel".into(),
        ));
    }
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
    let (config, settings_revision) =
        commerce::scoped_locked(&mut tx, &c.tenant, &c.data.sales_channel).await?;
    let code = config.currencies.selected(&c.data.currency)?.code.clone();
    if let Some(requested) = header(h, "x-commerce-currency")
        && requested != code
    {
        return Err(conflict("Checkout currency changed; review again"));
    }
    let config =
        payments::currency_methods_conn(&mut tx, &c.tenant, &c.data.sales_channel, &code, config)
            .await?;
    let legal_snapshot = legal::snapshot(&mut tx, &c, &config, &ps).await?;
    let selected = commerce::selection(&c.data);
    for address in [&selected.address, &selected.billing_address]
        .into_iter()
        .flatten()
    {
        commerce::validate_address_geography(address, &config)?;
    }
    apps::validate_configurations(&mut tx, &c).await?;
    if selected.shipping_method_id != "pickup"
        && selected.address.is_none()
        && !ps.iter().all(|p| p.extra["digital"] == true)
    {
        return Err(bad("Delivery address required"));
    }
    let taxes = commerce::tax_settings_for_cart(&mut tx, &c, &ps, &config).await?;
    let priced = commerce::tax_products(&ps, &selected, &taxes)?;
    let mut q = commerce::enrich(
        marketing::promote(
            &mut tx,
            &c,
            commerce::enrich(
                quote(&c, &priced, &config)?,
                &c,
                &priced,
                &config,
                settings_revision,
            )?,
        )
        .await?,
        &c,
        &priced,
        &config,
        settings_revision,
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
    let currency = config.currencies.selected(&c.data.currency)?;
    let money = currencies::amount(
        q["price"]["totalPrice"]
            .as_f64()
            .ok_or(bad("Invalid total"))?,
        &currency.code,
        currency.scale,
    )?;
    let minor = money.minor();
    // Legacy API clients may omit the pair. Browser checkout always binds its reviewed quote.
    match (
        header(h, "x-commerce-cart-revision"),
        header(h, "x-commerce-total-minor"),
    ) {
        (None, None) => {}
        (Some(revision), Some(total)) => {
            let revision = revision
                .parse::<u64>()
                .map_err(|_| bad("Invalid reviewed cart revision"))?;
            let total = total
                .parse::<i64>()
                .map_err(|_| bad("Invalid reviewed total"))?;
            if !u64::try_from(total)
                .ok()
                .zip(u64::try_from(minor).ok())
                .is_some_and(|(expected, actual)| {
                    verified_kernel::checkout_review_admissible(
                        verified_kernel::revision_admissible(c.revision as u64, revision),
                        expected,
                        actual,
                        q["selectionNeedsConfirmation"] != true,
                    )
                })
            {
                return Err(conflict("Checkout changed; review your order again"));
            }
        }
        _ => {
            return Err(bad(
                "Reviewed cart revision and total must be supplied together",
            ));
        }
    }
    if config.is_business(&c.data.group) {
        let digest: String =
            sqlx::query_scalar("SELECT digest FROM extensions WHERE tenant=$1 FOR SHARE")
                .bind(&c.tenant)
                .fetch_one(&mut *tx)
                .await?;
        let sandbox = prepared_policy
            .as_ref()
            .filter(|s| s.digest() == digest)
            .ok_or(conflict(
                "Business policy changed during checkout; retry your reviewed purchase",
            ))?;
        if !sandbox.approve(minor, 100_000).map_err(bad)? {
            return Err(conflict("Company purchase rejected by tenant extension"));
        }
    }
    let external = q["paymentMethod"]["mode"] == "app";
    if external && staging::parent_conn(&mut tx, &c.tenant).await?.is_some() {
        return Err(bad("External payments are disabled in private sandboxes"));
    }
    if external && q["paymentMethod"]["provider"].is_null() {
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
    order["money"] = json!(money);
    order["currencyContext"] = q["currencyContext"].clone();
    order["legal"] = legal_snapshot;
    order
        .as_object_mut()
        .unwrap()
        .extend(customer_snapshot.as_object().unwrap().clone());
    commerce::order_fields(&mut order);
    sqlx::query("INSERT INTO orders(id,tenant,cart_id,idempotency_key,fingerprint,data) VALUES($1,$2,$3,$4,$5,$6)").bind(&id).bind(&c.tenant).bind(&c.id).bind(key).bind(&fingerprint).bind(&order).execute(&mut *tx).await?;
    commerce::inventory::allocate(&mut tx, &c, &id).await?;
    marketing::record_uses(&mut tx, &c.tenant, &id, &q).await?;
    assets::snapshot(&mut tx, &c, &id).await?;
    if external {
        let return_origin = if q["paymentMethod"]["provider"].is_string() {
            match header(h, "origin") {
                Some(origin) => Some(
                    payments::sessions::origin_conn(
                        &mut tx,
                        &c.tenant,
                        &c.data.sales_channel,
                        Some(origin),
                    )
                    .await?,
                ),
                None => None,
            }
        } else {
            None
        };
        payments::prepare(&mut tx, &c, &mut order, minor, return_origin.as_deref()).await?;
        commerce::order_fields(&mut order);
        sqlx::query("UPDATE orders SET data=$1 WHERE id=$2")
            .bind(&order)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    commerce::inventory::consume(&mut tx, &c).await?;
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
