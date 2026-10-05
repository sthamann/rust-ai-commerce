//! Atomic restoration of the owning customer's address aggregate; geography, references and immutable order snapshots remain guarded.
use super::*;
pub(crate) async fn restore_book(
    conn: &mut sqlx::PgConnection,
    t: &str,
    email: &str,
    state: &Value,
    s: &commerce::Settings,
) -> Result<()> {
    let entries = state["addresses"]
        .as_array()
        .filter(|v| v.len() <= 100)
        .ok_or(bad("Invalid historical address book"))?;
    let mut ids = Vec::new();
    for entry in entries {
        let id = entry["id"]
            .as_str()
            .ok_or(bad("Historical address identity required"))?;
        if id.len() > 100 || ids.contains(&id.to_string()) {
            return Err(bad("Invalid historical address identity"));
        }
        let mut address: commerce::Address = serde_json::from_value(entry["address"].clone())
            .map_err(|_| bad("Invalid historical address"))?;
        address.validate()?;
        commerce::validate_address_geography(&address, s)?;
        if !s.countries.contains(&address.country) {
            return Err(bad("Historical address country is unavailable"));
        }
        let owner: Option<String> = sqlx::query_scalar(
            "SELECT email FROM customer_addresses WHERE tenant=$1 AND id=$2 FOR UPDATE",
        )
        .bind(t)
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
        if owner.as_ref().is_some_and(|owner| owner != email) {
            return Err(bad("Historical address belongs to another customer"));
        }
        sqlx::query("INSERT INTO customer_addresses(tenant,email,id,data) VALUES($1,$2,$3,$4) ON CONFLICT(tenant,id) DO UPDATE SET data=EXCLUDED.data,revision=customer_addresses.revision+1,updated_at=now() WHERE customer_addresses.email=EXCLUDED.email").bind(t).bind(email).bind(id).bind(json!(address)).execute(&mut *conn).await?;
        ids.push(id.to_string());
    }
    sqlx::query("DELETE FROM customer_addresses WHERE tenant=$1 AND email=$2 AND NOT(id=ANY($3))")
        .bind(t)
        .bind(email)
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
    let bill = state["defaultBillingAddressId"].as_str();
    let ship = state["defaultShippingAddressId"].as_str();
    if [bill, ship]
        .into_iter()
        .flatten()
        .any(|id| !ids.iter().any(|v| v == id))
    {
        return Err(bad("Historical default address is missing"));
    }
    sqlx::query("UPDATE customers SET default_billing_address_id=$3,default_shipping_address_id=$4,revision=revision+1 WHERE tenant=$1 AND email=$2").bind(t).bind(email).bind(bill).bind(ship).execute(conn).await?;
    Ok(())
}
