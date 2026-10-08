//! Consolidate dashboard reads without unbounded pool fan-out; preserve the existing API and currency/learning semantics.
use super::*;
pub(super) async fn load(a: &App, tenant: &str) -> Result<Value> {
    let mut facts: Value = sqlx::query_scalar(include_str!("overview.sql"))
        .bind(tenant)
        .fetch_one(&a.db)
        .await?;
    let amounts = facts["revenue"].take();
    let revenue = super::revenue::totals(amounts);
    facts["summary"]["revenue"] = revenue["singleTotal"].clone();
    facts["summary"]["revenueByCurrency"] = revenue["amounts"].clone();
    facts["summary"]["revenueCurrency"] = revenue["singleCurrency"].clone();
    for day in facts["timeline"]
        .as_array_mut()
        .expect("SQL timeline array")
    {
        day["revenue"] = if day["currency_count"].as_i64().unwrap_or(0) > 1 {
            Value::Null
        } else {
            json!(
                day["revenue"]
                    .as_str()
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.)
            )
        };
        day.as_object_mut().unwrap().remove("currency_count");
    }
    for variant in facts["variants"]
        .as_array_mut()
        .expect("SQL variants array")
    {
        let views = variant["views"].as_i64().unwrap_or(0);
        let purchases = variant["purchases"].as_i64().unwrap_or(0);
        variant["estimate"] = json!((purchases + 1) as f64 / (views + 2) as f64);
    }
    Ok(facts)
}
