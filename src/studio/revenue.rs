//! Merchant turnover remains separated by invoice currency; historical values are never repriced with today's FX.
use super::*;
pub(super) async fn summary(a: &App, tenant: &str) -> Result<Value> {
    let rows = sqlx::query("SELECT coalesce(data->'cart'->'price'->>'currency','EUR') AS currency,sum((data->'cart'->'price'->>'totalPrice')::numeric)::text AS amount FROM orders WHERE tenant=$1 GROUP BY 1 ORDER BY 1").bind(tenant).fetch_all(&a.db).await?;
    let amounts = rows.iter().map(|r|json!({"currency":r.get::<String,_>("currency"),"amount":r.get::<String,_>("amount")})).collect::<Vec<_>>();
    let single = amounts.first().filter(|_| amounts.len() == 1);
    Ok(
        json!({"amounts":amounts,"singleTotal":if amounts.is_empty(){Some(0.)}else{single.and_then(|v|v["amount"].as_str()).and_then(|s|s.parse::<f64>().ok())},"singleCurrency":single.map(|v|v["currency"].clone())}),
    )
}
