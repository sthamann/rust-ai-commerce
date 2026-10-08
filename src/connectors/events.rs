//! One bounded event envelope feeds existing durable, idempotent connector queues; no parallel scheduler.
use super::*;
fn items<'a>(tenant: &str, app: &str, envelope: &'a Value) -> Result<Vec<&'a Value>> {
    let values = if let Some(batch) = envelope.get("events") {
        checked(
            envelope["apiVersion"] == "1" && envelope["tenant"] == tenant && envelope["app"] == app,
            "Invalid event batch context",
        )?;
        let rows = batch
            .as_array()
            .ok_or(Error::Invalid("Events must be an array"))?;
        checked(
            !rows.is_empty() && rows.len() <= 25,
            "Event batch must contain 1..25 events",
        )?;
        rows.iter().collect()
    } else {
        vec![envelope]
    };
    // Validate the entire batch before submitting its first job. Partial enqueue retries keep each event's stable request key.
    for event in &values {
        let id = event["eventId"]
            .as_i64()
            .filter(|id| *id > 0)
            .ok_or(Error::Invalid("Invalid event ID"))?;
        checked(
            event["tenant"] == tenant
                && event["idempotencyKey"] == format!("{tenant}:{app}:{id}")
                && event["kind"]
                    .as_str()
                    .is_some_and(|k| !k.is_empty() && k.len() <= 100)
                && event["data"].is_object(),
            "Invalid event identity or payload",
        )?;
    }
    Ok(values)
}
pub(super) async fn receive(store: &Store, t: &str, a: &str, envelope: &Value) -> Result<Value> {
    let events = items(t, a, envelope)?;
    let mut results = Vec::with_capacity(events.len());
    for event in events {
        let result = if a == "email" {
            email::event(store, t, event).await?
        } else if a == "slack"
            && store.get(t, a).await?["settings"]["notifyOrders"] == true
            && event["kind"] == "order.placed"
        {
            actions::action(store, t, a, "post_order", &json!({"requestKey":event["idempotencyKey"],"event":event["data"],"kind":event["kind"]})).await?
        } else {
            json!({"ignored":true})
        };
        results.push(result);
    }
    if envelope.get("events").is_some() {
        Ok(json!({"accepted":results.len(),"results":results}))
    } else {
        Ok(results.remove(0))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn batch_validation_binds_every_event_to_one_tenant_and_app_before_enqueue() {
        let item = json!({"eventId":12,"tenant":"shop-a","idempotencyKey":"shop-a:email:12","kind":"order.placed","data":{}});
        assert!(items("shop-a", "email", &item).is_ok());
        let mut batch =
            json!({"apiVersion":"1","tenant":"shop-a","app":"email","events":[item.clone(),item]});
        assert_eq!(items("shop-a", "email", &batch).unwrap().len(), 2);
        batch["events"][1]["tenant"] = json!("shop-b");
        assert!(items("shop-a", "email", &batch).is_err());
        batch["events"] = json!([]);
        assert!(items("shop-a", "email", &batch).is_err());
    }
}
