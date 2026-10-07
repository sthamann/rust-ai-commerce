//! Installed payment registry and immutable account/version snapshots; no remote calls inside checkout SQL.
use super::*;
pub(crate) fn external(o: &Value) -> bool {
    !matches!(
        o["payment"]["provider"].as_str(),
        Some("manual" | "simulated") | None
    )
}
pub(crate) async fn install_methods(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    m: &apps::Manifest,
) -> Result<()> {
    let Some(p) = &m.payment_provider else {
        return Ok(());
    };
    let row = sqlx::query("SELECT data FROM commerce_settings WHERE tenant=$1 FOR UPDATE")
        .bind(t)
        .fetch_one(&mut **tx)
        .await?;
    let mut s: commerce::Settings =
        serde_json::from_value(row.get("data")).map_err(|_| bad("Invalid settings"))?;
    for method in &p.methods {
        let id = format!("{}-{}", m.id.replace('_', "-"), method.id.replace('_', "-"));
        if id.len() > 50 {
            return Err(bad("Provider payment method ID exceeds limit"));
        }
        if let Some(old) = s.payments.iter().find(|v| v.id == id) {
            if old.provider.as_deref() != Some(&m.id)
                || old.provider_method.as_deref() != Some(&method.id)
            {
                return Err(conflict("Payment method ID already owned"));
            }
            continue;
        }
        s.payments.push(commerce::Payment {
            id,
            name: method
                .name
                .get("en")
                .or_else(|| method.name.values().next())
                .cloned()
                .unwrap_or_default(),
            translations: method
                .name
                .iter()
                .map(|(l, n)| {
                    (
                        l.clone(),
                        serde_json::from_value(json!({"name":n})).unwrap(),
                    )
                })
                .collect(),
            countries: method
                .countries
                .iter()
                .filter(|c| s.countries.contains(c))
                .cloned()
                .collect(),
            restricted_countries: !method.countries.is_empty(),
            active: false,
            business_only: false,
            mode: "app".into(),
            provider: Some(m.id.clone()),
            provider_method: Some(method.id.clone()),
        });
    }
    commerce::validate_config(&s)?;
    sqlx::query("UPDATE commerce_settings SET data=$1,revision=revision+1 WHERE tenant=$2")
        .bind(json!(s))
        .bind(t)
        .execute(&mut **tx)
        .await?;
    Ok(())
}
pub(crate) async fn prepare_remote(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
    o: &mut Value,
    minor: i64,
    return_origin: Option<&str>,
) -> Result<()> {
    let method = o["cart"]["paymentMethod"].clone();
    let provider = method["provider"]
        .as_str()
        .ok_or(bad("Provider required"))?;
    let row = sqlx::query(
        "SELECT manifest FROM app_packages WHERE tenant=$1 AND id=$2 AND active FOR SHARE",
    )
    .bind(&c.tenant)
    .bind(provider)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(conflict("Payment app is inactive"))?;
    let m: apps::Manifest =
        serde_json::from_value(row.get("manifest")).map_err(|_| bad("Invalid payment manifest"))?;
    let contract = m
        .payment_provider
        .as_ref()
        .ok_or(bad("Payment provider contract missing"))?;
    let method = contract
        .methods
        .iter()
        .find(|v| Some(v.id.as_str()) == method["providerMethod"].as_str())
        .ok_or(bad("Unknown provider method"))?;
    let currency = o["cart"]["price"]["currency"]
        .as_str()
        .unwrap_or("EUR")
        .to_owned();
    if !method.currencies.iter().any(|c| c == &currency)
        || (!method.countries.is_empty()
            && !method
                .countries
                .iter()
                .any(|v| Some(v.as_str()) == o["cart"]["checkout"]["country"].as_str()))
    {
        return Err(bad("Provider method unavailable for currency or country"));
    }
    let channel = c.data.sales_channel.as_str();
    let r=sqlx::query("SELECT * FROM payment_provider_accounts WHERE tenant=$1 AND app=$2 AND channel IN ($3,'default') ORDER BY (channel=$3) DESC LIMIT 1 FOR SHARE").bind(&c.tenant).bind(provider).bind(channel).fetch_optional(&mut **tx).await?.ok_or(conflict("Complete payment provider onboarding first"))?;
    if !r.get::<bool, _>("ready") {
        return Err(conflict("Payment account is not ready"));
    }
    if !r.get::<Value, _>("data")["methods"]
        .as_array()
        .is_some_and(|ms| ms.iter().any(|v| v == &method.id))
    {
        return Err(conflict(
            "Provider has not enabled this method for the merchant",
        ));
    }
    let environment: String = r.get("environment");
    remote::config(provider, &m.version, &environment)?;
    let context = json!({"apiVersion":"1","accountRef":r.get::<String,_>("account_ref"),"method":method.id,"capabilities":method.capabilities,"checkout":method.checkout,"intent":method.intent,"channel":channel,"returnOrigin":return_origin,"currencyScale":o["cart"]["price"]["currencyScale"]});
    let id = uid();
    o["payment"] = json!({"method":o["cart"]["paymentMethod"],"provider":provider,"state":"pending","attemptId":id,"environment":environment,"realMoneyCharged":false});
    sqlx::query("INSERT INTO payment_attempts(id,tenant,order_id,provider,adapter_version,amount_minor,currency,environment,bn_code,provider_context,currency_scale) VALUES($1,$2,$3,$4,$5,$6,$9,$7,'',$8,$10)").bind(&id).bind(&c.tenant).bind(o["id"].as_str().unwrap()).bind(provider).bind(&m.version).bind(minor).bind(environment).bind(context).bind(currency).bind(o["cart"]["price"]["currencyScale"].as_i64().unwrap_or(2) as i16).execute(&mut **tx).await?;
    for item in &c.data.items {
        sqlx::query("INSERT INTO inventory_reservations(tenant,attempt_id,product_id,quantity) VALUES($1,$2,$3,$4)").bind(&c.tenant).bind(&id).bind(&item.id).bind(item.quantity as i32).execute(&mut **tx).await?;
    }
    enqueue_tx(
        tx,
        &c.tenant,
        &id,
        "create",
        &format!("{id}:create"),
        &json!({}),
    )
    .await?;
    Ok(())
}

/// One bounded registry query hides disconnected/uninstalled provider methods from storefront discovery.
pub(crate) async fn available(
    a: &App,
    t: &str,
    channel: &str,
    currency: &str,
) -> Result<std::collections::HashSet<(String, String)>> {
    let rows = sqlx::query("SELECT DISTINCT ON (p.id) p.id,p.version,p.manifest,a.ready,a.data,a.environment FROM app_packages p JOIN payment_provider_accounts a ON a.tenant=p.tenant AND a.app=p.id WHERE p.tenant=$1 AND p.active AND a.channel IN ($2,'default') ORDER BY p.id,(a.channel=$2) DESC").bind(t).bind(channel).fetch_all(&a.db).await?;
    let mut enabled = std::collections::HashSet::new();
    for row in rows {
        let id: String = row.get("id");
        if !row.get::<bool, _>("ready")
            || remote::config(
                &id,
                &row.get::<String, _>("version"),
                &row.get::<String, _>("environment"),
            )
            .is_err()
        {
            continue;
        }
        let manifest: apps::Manifest = serde_json::from_value(row.get("manifest"))
            .map_err(|_| bad("Invalid installed provider"))?;
        let account: Value = row.get("data");
        if let Some(provider) = manifest.payment_provider {
            for method in provider.methods {
                if method.currencies.iter().any(|c| c == currency)
                    && account["methods"]
                        .as_array()
                        .is_some_and(|ms| ms.iter().any(|v| v == &method.id))
                {
                    enabled.insert((id.clone(), method.id));
                }
            }
        }
    }
    Ok(enabled)
}

/// Provider declarations constrain quote discovery; authoritative preparation rechecks under locks.
pub(crate) async fn currency_methods(
    a: &App,
    t: &str,
    channel: &str,
    code: &str,
    mut s: commerce::Settings,
) -> Result<commerce::Settings> {
    let enabled = available(a, t, channel, code).await?;
    for method in &mut s.payments {
        if let Some(provider) = &method.provider {
            method.active &= method
                .provider_method
                .as_ref()
                .is_some_and(|m| enabled.contains(&(provider.clone(), m.clone())));
        }
        if ["paypal-sandbox", "paypal-live"].contains(&method.id.as_str()) {
            method.active &= "AUD BRL CAD CNY CZK DKK EUR HKD HUF ILS JPY MYR MXN TWD NZD NOK PHP PLN GBP SGD SEK CHF THB USD".split(' ').any(|c|c==code);
        }
    }
    Ok(s)
}
