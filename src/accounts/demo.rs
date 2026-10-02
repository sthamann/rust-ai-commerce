//! Public synthetic customer fixture for newly provisioned demo shops; never fills real customer addresses.
use crate::*;
pub(crate) async fn seed_address(conn: &mut sqlx::PgConnection, t: &str) -> Result<()> {
    let fixture: Value = serde_json::from_str(include_str!("../../fixtures/demo-customer.json"))
        .expect("static demo customer");
    sqlx::query("UPDATE customers SET profile=$1 WHERE tenant=$2 AND email='buyer@example.test' AND profile='{}'::jsonb").bind(&fixture["profile"]).bind(t).execute(&mut *conn).await?;
    let mut address: commerce::Address =
        serde_json::from_value(fixture["address"].clone()).expect("static demo address");
    address.validate()?;
    accounts::address_save_conn(
        conn,
        t,
        "buyer@example.test",
        None,
        &json!({"defaultBilling":true,"defaultShipping":true}),
        &address,
    )
    .await?;
    Ok(())
}
