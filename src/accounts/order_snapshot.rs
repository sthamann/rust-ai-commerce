//! Checkout-owned immutable customer and address records; future account edits cannot rewrite an order.
use crate::*;
pub(crate) async fn snapshot(
    conn: &mut sqlx::PgConnection,
    c: &StoredCart,
    selected: &commerce::CheckoutSelection,
) -> Result<Value> {
    let customer = if let Some(id) = &c.data.customer_id {
        let r=sqlx::query("SELECT id,customer_number,email,profile,company FROM customers WHERE tenant=$1 AND id=$2 AND active FOR SHARE").bind(&c.tenant).bind(id).fetch_optional(&mut *conn).await?.ok_or(Error(StatusCode::UNAUTHORIZED,"Customer account unavailable".into()))?;
        let profile: Value = r.get("profile");
        json!({"customerId":id,"customerNumber":r.get::<String,_>("customer_number"),"email":r.get::<String,_>("email"),"name":profile["name"],"firstName":profile["firstName"],"lastName":profile["lastName"],"salutationId":profile["salutationId"],"title":profile["title"],"company":r.get::<Option<String>,_>("company"),"vatIds":profile["vatIds"],"guest":false})
    } else {
        json!({"customerId":null,"customerNumber":null,"email":c.data.email,"name":selected.billing_address.as_ref().map(|a|a.name.clone()),"firstName":selected.billing_address.as_ref().map(|a|a.first_name.clone()),"lastName":selected.billing_address.as_ref().map(|a|a.last_name.clone()),"guest":true})
    };
    let settings: Value = sqlx::query_scalar("SELECT data FROM commerce_settings WHERE tenant=$1")
        .bind(&c.tenant)
        .fetch_one(&mut *conn)
        .await?;
    let settings = commerce::decode_config(settings)?;
    let billing_id = uid();
    let shipping_id = uid();
    let date: String = sqlx::query_scalar(
        "SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')",
    )
    .fetch_one(conn)
    .await?;
    Ok(
        json!({"orderCustomer":customer,"billingAddressId":if selected.billing_address.is_some(){Some(&billing_id)}else{None},"billingAddress":selected.billing_address,"shippingAddress":selected.address,"shippingAddressId":if selected.address.is_some(){Some(&shipping_id)}else{None},"orderDateTime":date,"salesChannelId":c.data.sales_channel,"currencyId":"EUR","currencyFactor":1,"taxStatus":if settings.is_business(&c.data.group){"net"}else{"gross"},"customerComment":null,"internalComment":null,"affiliateCode":null,"campaignCode":null}),
    )
}
