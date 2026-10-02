//! Payment provider identity, tenant account configuration and immutable wire context.
use super::*;
#[derive(Clone)]
pub(crate) struct Account {
    pub client: String,
    pub secret: String,
    pub webhook: String,
    pub merchant: Option<String>,
}
pub(crate) fn account(t: &str) -> Result<Account> {
    let all: Value =
        serde_json::from_str(&env::var("PAYPAL_SANDBOX_ACCOUNTS").unwrap_or("{}".into()))
            .map_err(|_| bad("Invalid payment account configuration"))?;
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
    })
}
pub(crate) fn base() -> Result<String> {
    let base =
        env::var("PAYPAL_SANDBOX_BASE_URL").unwrap_or("https://api-m.sandbox.paypal.com".into());
    let url = reqwest::Url::parse(&base).map_err(|_| bad("Invalid sandbox URL"))?;
    if base != "https://api-m.sandbox.paypal.com"
        && !(url.scheme() == "http"
            && ["127.0.0.1", "localhost"].contains(&url.host_str().unwrap_or("")))
    {
        return Err(bad(
            "Only PayPal Sandbox or an explicit loopback contract fixture is supported",
        ));
    }
    Ok(base.trim_end_matches('/').into())
}
pub(crate) fn environment() -> &'static str {
    if env::var("PAYPAL_SANDBOX_BASE_URL").is_ok_and(|s| s != "https://api-m.sandbox.paypal.com") {
        "contract-fixture"
    } else {
        "sandbox"
    }
}
pub(crate) async fn prepare(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    c: &StoredCart,
    order: &mut Value,
    minor: i64,
) -> Result<()> {
    let version: Option<String> = sqlx::query_scalar(
        "SELECT version FROM app_packages WHERE tenant=$1 AND id='paypal' AND active FOR SHARE",
    )
    .bind(&c.tenant)
    .fetch_optional(&mut **tx)
    .await?;
    let version = version.ok_or(conflict("Payment app is not active"))?;
    let id = uid();
    order["payment"] = json!({"method":order["cart"]["paymentMethod"],"provider":"paypal","state":"pending","attemptId":id,"environment":environment(),"realMoneyCharged":false});
    sqlx::query("INSERT INTO payment_attempts(id,tenant,order_id,provider,adapter_version,amount_minor,currency,environment) VALUES($1,$2,$3,'paypal',$4,$5,'EUR',$6)").bind(&id).bind(&c.tenant).bind(order["id"].as_str().unwrap()).bind(version).bind(minor).bind(environment()).execute(&mut **tx).await?;
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
    pub tenant: String,
    pub order: String,
    pub amount: i64,
    pub currency: String,
    pub state: String,
    pub provider_order: Option<String>,
    pub capture: Option<String>,
    pub refunded: i64,
    pub adapter_version: String,
    pub environment: String,
}
pub(crate) fn attempt(r: &sqlx::postgres::PgRow) -> Attempt {
    Attempt {
        id: r.get("id"),
        tenant: r.get("tenant"),
        order: r.get("order_id"),
        amount: r.get("amount_minor"),
        currency: r.get("currency"),
        state: r.get("state"),
        provider_order: r.get("provider_order"),
        capture: r.get("capture_id"),
        refunded: r.get("refunded_minor"),
        adapter_version: r.get("adapter_version"),
        environment: r.get("environment"),
    }
}
pub(crate) fn amount_string(minor: i64) -> String {
    format!("{}.{:02}", minor / 100, minor % 100)
}
pub(crate) fn parse_minor(value: &str) -> Result<i64> {
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.len() != 2
        || parts[1].len() != 2
        || !parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|c| c.is_ascii_digit()))
    {
        return Err(bad("Invalid provider money amount"));
    }
    let major = parts[0]
        .parse::<i64>()
        .map_err(|_| bad("Amount overflow"))?;
    major
        .checked_mul(100)
        .and_then(|v| v.checked_add(parts[1].parse::<i64>().ok()?))
        .ok_or(bad("Amount overflow"))
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
        if p.adapter_version != "1.0.0" || p.environment != environment() {
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
    PaypalSandbox.execute(a, p, op, key, input).await
}

#[cfg(test)]
mod tests {
    use super::*;
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
