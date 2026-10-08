//! Merchant turnover remains separated by invoice currency; historical values are never repriced with today's FX.
use super::*;
pub(super) fn totals(amounts: Value) -> Value {
    let amounts = amounts.as_array().expect("SQL revenue array");
    let single = amounts.first().filter(|_| amounts.len() == 1);
    json!({"amounts":amounts,"singleTotal":if amounts.is_empty(){Some(0.)}else{single.and_then(|v|v["amount"].as_str()).and_then(|s|s.parse::<f64>().ok())},"singleCurrency":single.map(|v|v["currency"].clone())})
}
