//! Assemble private server-owned rule context once per quote/event; never publish customer facts in cart responses.
use super::*;
pub(crate) async fn rule_facts(
    conn: &mut sqlx::PgConnection,
    c: &StoredCart,
    q: &Value,
) -> Result<Value> {
    let ids = c
        .data
        .items
        .iter()
        .map(|i| i.id.clone())
        .collect::<Vec<_>>();
    let rows = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=ANY($2)")
        .bind(&c.tenant)
        .bind(&ids)
        .fetch_all(&mut *conn)
        .await?;
    let parent_ids = rows
        .iter()
        .filter_map(|r| r.get::<Option<String>, _>("parent_id"))
        .collect::<Vec<_>>();
    let parents = sqlx::query("SELECT * FROM products WHERE tenant=$1 AND id=ANY($2)")
        .bind(&c.tenant)
        .bind(parent_ids)
        .fetch_all(&mut *conn)
        .await?;
    let mut lines = vec![];
    for item in q["lineItems"].as_array().into_iter().flatten() {
        if let Some(r) = rows
            .iter()
            .find(|r| Some(r.get::<String, _>("id").as_str()) == item["referencedId"].as_str())
        {
            let mut p = product(r);
            if let Some(parent) = parents
                .iter()
                .find(|r| Some(r.get::<String, _>("id").as_str()) == p.parent_id.as_deref())
            {
                p.extra = commerce::inherited_extra(&product(parent).extra, &p.extra);
            }
            lines.push(super::line_facts::line(&p, item));
        }
    }
    let selected = commerce::selection(&c.data);
    let mut facts = json!({"lines":lines,"price":q["price"],"shippingCosts":q["shippingCosts"],"checkout":selected,"salesChannel":c.data.sales_channel,"currency":q["price"]["currency"],"language":if c.data.locale.is_empty(){"en-GB"}else{&c.data.locale},"adminSource":false,"goodsCount":lines.len(),"lineCount":lines.len(),"goodsPrice":lines.iter().map(|l|l["totalPrice"].as_f64().unwrap_or(0.)).sum::<f64>(),"weight":lines.iter().map(|l|l["weight"].as_f64().unwrap_or(0.)*l["quantity"].as_f64().unwrap_or(0.)).sum::<f64>(),"volume":lines.iter().map(|l|l["volume"].as_f64().unwrap_or(0.)*l["quantity"].as_f64().unwrap_or(0.)).sum::<f64>(),"hasDeliveryFreeItem":lines.iter().any(|l|l["shippingFree"]==true),"promotionCount":q["discounts"].as_array().map(Vec::len).unwrap_or(0),"promotionValue":q["discountTotal"].as_f64().unwrap_or(0.)});
    for (key, address) in [
        ("billing", selected.billing_address),
        ("shipping", selected.address),
    ] {
        facts[key]=address.map(|a|{let mut v=json!(a);v["zipcode"]=v["postalCode"].clone();v}).unwrap_or(json!({"country":if key=="shipping"{json!(selected.country.clone())}else{Value::Null},"city":null,"street":null,"zipcode":null,"countryStateId":null}));
    }
    facts["customer"] = super::customer_facts::customer(conn, c, &facts).await?;
    facts["currentTime"] = json!(
        sqlx::query_scalar::<_, String>(
            "SELECT to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"
        )
        .fetch_one(&mut *conn)
        .await?
    );
    Ok(facts)
}
pub(crate) async fn order_facts(
    conn: &mut sqlx::PgConnection,
    t: &str,
    id: &str,
    q: &Value,
    facts: &mut Value,
) -> Result<()> {
    let receipts = sqlx::query_scalar::<_, String>(
        "SELECT kind FROM order_receipts WHERE tenant=$1 AND order_id=$2",
    )
    .bind(t)
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    facts["order"] = json!({"state":q["state"],"tags":q["automation"]["tags"].as_array().cloned().unwrap_or_default(),"customFields":q["automation"]["customFields"].as_object().cloned().unwrap_or_default(),"affiliateCode":q["affiliateCode"],"campaignCode":q["campaignCode"],"createdByAdmin":q["createdByAdmin"].as_bool().unwrap_or(false),"documentTypes":receipts,"sentDocumentTypes":[],"deliveryStates":q["deliveries"].as_array().into_iter().flatten().map(|d|d["state"].clone()).collect::<Vec<_>>(),"paymentStates":[q["payment"]["state"].clone()],"trackingSet":q["deliveries"].as_array().into_iter().flatten().any(|d|d["trackingCode"].as_str().is_some_and(|s|!s.is_empty()))});
    Ok(())
}
