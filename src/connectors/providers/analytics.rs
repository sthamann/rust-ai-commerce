//! Exact bounded GA4 source rows, quota metadata and stale-report tombstones; no invented causal claims.
use super::*;
pub async fn analytics(store: &Store, t: &str, settings: &Value) -> Result<Value> {
    let revision = store.get(t, "google_analytics").await?["revision"].clone();
    let property = text(settings, "propertyId");
    checked(
        !property.is_empty() && property.bytes().all(|b| b.is_ascii_digit()),
        "Numeric GA4 property ID required",
    )?;
    let token = oauth::token(store, t, "google_analytics").await?;
    let mut records = vec![];
    for (name, dimensions, metrics) in [
        (
            "acquisition",
            vec!["date", "sessionSourceMedium"],
            vec!["sessions", "totalUsers", "purchaseRevenue"],
        ),
        (
            "products",
            vec!["itemId", "itemName"],
            vec![
                "itemsViewed",
                "itemsAddedToCart",
                "itemsPurchased",
                "itemRevenue",
            ],
        ),
    ] {
        let body = json!({"dateRanges":[{"startDate":"30daysAgo","endDate":"today"}],"dimensions":dimensions.iter().map(|v|json!({"name":v})).collect::<Vec<_>>(),"metrics":metrics.iter().map(|v|json!({"name":v})).collect::<Vec<_>>(),"limit":"1000","returnPropertyQuota":true});
        let report = network::request(
            &format!(
                "{}/properties/{property}:runReport",
                network::endpoint("analytics")?
            ),
            Some(&body),
            Some(&token),
            false,
        )
        .await?;
        let rows = report["rows"].as_array().cloned().unwrap_or_default();
        checked(rows.len() <= 1000, "GA4 report exceeds bounded rows")?;
        let mut chunks = vec![];
        let mut chunk: Vec<Value> = vec![];
        for row in &rows {
            let mut data = json!({});
            for (keys, field) in [(&dimensions, "dimensionValues"), (&metrics, "metricValues")] {
                for (i, key) in keys.iter().enumerate() {
                    data[*key] = row[field][i]["value"].clone();
                }
            }
            checked(
                data.to_string().len() <= 8000,
                "Report row exceeds source limit",
            )?;
            let mut candidate = chunk.clone();
            candidate.push(data.clone());
            if json!(candidate).to_string().len() > 8000 {
                chunks.push(std::mem::take(&mut chunk));
            }
            chunk.push(data);
        }
        chunks.push(chunk);
        for (i, chunk) in chunks.into_iter().enumerate() {
            records.push(json!({"id":format!("{name}-{i}"),"kind":"analytics_report","title":format!("GA4 {name} · {property}"),"text":json!(chunk).to_string(),"sourceUrl":format!("https://analytics.google.com/analytics/web/#/p{property}/reports"),"metadata":{"productIds":if name=="products"{chunk.iter().map(|r|r["itemId"].clone()).collect::<Vec<_>>()}else{vec![]},"propertyId":property,"report":name,"dateRange":"last 30 days","rowCount":report["rowCount"].as_u64().unwrap_or(rows.len() as u64),"truncated":report["rowCount"].as_u64().unwrap_or(0)>rows.len() as u64,"metadata":report.get("metadata").cloned().unwrap_or(json!({}))}}));
        }
    }
    for r in store.sources(t, "google_analytics").await? {
        if r["deleted"] != true && !records.iter().any(|v| v["id"] == r["id"]) {
            records.push(json!({"id":r["id"],"deleted":true}));
        }
    }
    store
        .put_sources(t, "google_analytics", &records, settings, &revision, None)
        .await?;
    Ok(json!({"reports":2,"sourceRecords":records.len()}))
}
