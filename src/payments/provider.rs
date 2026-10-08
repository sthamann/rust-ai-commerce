//! Payment provider identity, tenant account configuration and immutable wire context.
use super::{enqueue_tx, paypal, prepare_remote, remote};
use crate::{
    App, Error, Result, Row, StatusCode, StoredCart, Value, bad, conflict, currencies, json, uid,
};

#[derive(Clone)]
pub(crate) struct Account {
    pub client: String,
    pub secret: String,
    pub webhook: String,
    pub merchant: Option<String>,
    pub bn_code: String,
}
pub(crate) fn account(t: &str) -> Result<Account> {
    let all = &crate::runtime_config::get().paypal_accounts;
    let v = &all[t];
    Ok(Account {
        client: v["clientId"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or(Error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Connect this shop's PayPal Sandbox account on the server first".into(),
            ))?
            .into(),
        secret: v["clientSecret"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or(bad("Payment secret missing"))?
            .into(),
        webhook: v["webhookId"].as_str().unwrap_or("").into(),
        merchant: v["merchantId"].as_str().map(str::to_string),
        bn_code: v["bnCode"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or(bad("Provider attribution configuration missing"))?
            .to_string(),
    })
}
pub(crate) fn base() -> Result<String> {
    Ok(crate::runtime_config::get().paypal_base.clone())
}
pub(crate) fn environment() -> &'static str {
    crate::runtime_config::get().paypal_environment
}
pub(crate) async fn prepare(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
    order: &mut Value,
    minor: i64,
    return_origin: Option<&str>,
) -> Result<()> {
    if order["cart"]["paymentMethod"]["provider"].is_string() {
        return prepare_remote(tx, c, order, minor, return_origin).await;
    }
    let version: Option<String> = sqlx::query_scalar(
        "SELECT version FROM app_packages WHERE tenant=$1 AND id='paypal' AND active FOR SHARE",
    )
    .bind(&c.tenant)
    .fetch_optional(&mut **tx)
    .await?;
    let version = version.ok_or(conflict("Payment app is not active"))?;
    let id = uid();
    let bn = account(&c.tenant)?.bn_code;
    order["payment"] = json!({"method":order["cart"]["paymentMethod"],"provider":"paypal","state":"pending","attemptId":id,"environment":environment(),"realMoneyCharged":false,"bnCode":bn});
    sqlx::query("INSERT INTO payment_attempts(id,tenant,order_id,provider,adapter_version,amount_minor,currency,environment,bn_code,provider_context,currency_scale) VALUES($1,$2,$3,'paypal',$4,$5,$8,$6,$7,$9,$10)").bind(&id).bind(&c.tenant).bind(order["id"].as_str().unwrap()).bind(version).bind(minor).bind(environment()).bind(&bn).bind(order["cart"]["price"]["currency"].as_str().unwrap_or("EUR")).bind(json!({"currencyScale":order["cart"]["price"]["currencyScale"]})).bind(order["cart"]["price"]["currencyScale"].as_i64().unwrap_or(2) as i16).execute(&mut **tx).await?;
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
#[derive(Clone)]
pub(crate) struct Attempt {
    pub id: String,
    pub provider: String,
    pub context: Value,
    pub tenant: String,
    pub order: String,
    pub amount: i64,
    pub currency: String,
    pub currency_scale: i16,
    pub state: String,
    pub provider_order: Option<String>,
    pub capture: Option<String>,
    pub refunded: i64,
    pub adapter_version: String,
    pub environment: String,
    pub bn_code: String,
}
pub(crate) fn attempt(r: &sqlx::postgres::PgRow) -> Attempt {
    Attempt {
        id: r.get("id"),
        provider: r.get("provider"),
        context: r.get("provider_context"),
        tenant: r.get("tenant"),
        order: r.get("order_id"),
        amount: r.get("amount_minor"),
        currency: r.get("currency"),
        currency_scale: r.get("currency_scale"),
        state: r.get("state"),
        provider_order: r.get("provider_order"),
        capture: r.get("capture_id"),
        refunded: r.get("refunded_minor"),
        adapter_version: r.get("adapter_version"),
        environment: r.get("environment"),
        bn_code: r.get("bn_code"),
    }
}
pub(crate) fn wire_currency(code: &str) -> Result<vendune::money::Currency> {
    vendune::money::Currency::new(
        code,
        currencies::scale(code).ok_or(bad("Unsupported provider currency"))?,
    )
    .map_err(bad)
}
pub(crate) fn format_amount(minor: i64, code: &str) -> Result<String> {
    Ok(vendune::money::Money::new(minor, wire_currency(code)?).decimal())
}
pub(crate) fn parse_amount(value: &str, code: &str) -> Result<i64> {
    let money = vendune::money::Money::parse(value, wire_currency(code)?).map_err(bad)?;
    if money.minor() < 0 || value.starts_with('-') {
        return Err(bad("Invalid provider money amount"));
    }
    Ok(money.minor())
}
#[cfg(test)]
pub(crate) fn amount_string(minor: i64) -> String {
    vendune::money::Money::new(minor, vendune::money::Currency::eur()).decimal()
}
#[cfg(test)]
pub(crate) fn parse_minor(value: &str) -> Result<i64> {
    let amount =
        vendune::money::Money::parse(value, vendune::money::Currency::eur()).map_err(bad)?;
    if amount.minor() < 0 || value.starts_with('-') {
        return Err(bad("Invalid provider money amount"));
    }
    Ok(amount.minor())
}
/// Each adapter implements this command boundary; the core owns ledger transitions.
pub(crate) trait PaymentProvider {
    async fn execute(
        &self,
        a: &App,
        p: &Attempt,
        op: &str,
        key: &str,
        input: &Value,
    ) -> Result<Value>;
}
struct PaypalSandbox;
impl PaymentProvider for PaypalSandbox {
    async fn execute(
        &self,
        a: &App,
        p: &Attempt,
        op: &str,
        key: &str,
        input: &Value,
    ) -> Result<Value> {
        if p.adapter_version != "1.0.0"
            || p.environment != environment()
            || p.bn_code != account(&p.tenant)?.bn_code
        {
            return Err(Error(StatusCode::SERVICE_UNAVAILABLE,"Payment adapter version/environment mismatch; use the original adapter to reconcile".into()));
        }
        paypal::execute(a, p, op, key, input).await
    }
}
pub(crate) async fn dispatch(
    a: &App,
    p: &Attempt,
    op: &str,
    key: &str,
    input: &Value,
) -> Result<Value> {
    if p.provider == "paypal" {
        PaypalSandbox.execute(a, p, op, key, input).await
    } else {
        remote::execute(a, p, op, key, input).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn currency_wire_amounts_use_iso_precision() {
        assert_eq!(format_amount(123, "JPY").unwrap(), "123");
        assert_eq!(format_amount(7123, "KWD").unwrap(), "7.123");
        assert_eq!(parse_amount("7.123", "KWD").unwrap(), 7123);
        assert!(parse_amount("1.001", "USD").is_err());
        assert!(parse_amount("1.00", "XXX").is_err());
    }
    #[test]
    fn integer_money_roundtrips() {
        for n in [1, 99, 100, 7490, 1000000] {
            assert_eq!(parse_minor(&amount_string(n)).unwrap(), n);
        }
        for s in ["1.2", "-1.00", "NaN", "1e2.00", "999999999999999999999.00"] {
            assert!(parse_minor(s).is_err());
        }
    }
}
