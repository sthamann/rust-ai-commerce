//! One server-derived action catalogue drives UI, HTTP and MCP; built-in business guards cannot be bypassed.
use super::*;
pub(crate) fn guard(o: &Value, kind: &str, target: &str) -> Option<&'static str> {
    if ["cancelled", "expired", "payment_review"].contains(&o["state"].as_str().unwrap_or("")) {
        return Some("terminalOrder");
    }
    match (kind, target) {
        ("order", "cancelled")
            if o["payment"]["provider"] == "paypal"
                || ["paid", "captured", "partially_refunded"]
                    .contains(&o["payment"]["state"].as_str().unwrap_or("")) =>
        {
            Some("refundFirst")
        }
        ("order", "cancelled")
            if o["deliveries"]
                .as_array()
                .is_some_and(|ds| ds.iter().any(|d| d["state"] != "open")) =>
        {
            Some("returnFirst")
        }
        ("order", "completed")
            if !(["paid", "captured"].contains(&o["payment"]["state"].as_str().unwrap_or(""))
                || o["payment"]["provider"] == "simulated"
                    && o["payment"]["state"] == "authorized") =>
        {
            Some("paymentFirst")
        }
        ("order", "completed")
            if o["deliveries"]
                .as_array()
                .is_some_and(|ds| ds.iter().any(|d| d["state"] != "delivered")) =>
        {
            Some("deliveryFirst")
        }
        ("payment", _) if o["payment"]["provider"] == "paypal" => Some("providerConfirmation"),
        _ => None,
    }
}
pub(crate) fn workflow(o: &Value, m: &OrderMachine, revision: i64) -> Value {
    let mut actions = Vec::new();
    let current = o["state"].as_str().unwrap_or("placed");
    if m.states.iter().any(|s| s.id == current && s.terminal) {
        return json!({"revision":revision,"states":m.states,"actions":[]});
    }
    if !m.states.iter().any(|s| s.id == current && s.terminal) {
        for e in m.transitions.iter().filter(|e| e.from == current) {
            let reason = guard(o, "order", &e.to);
            actions.push(json!({"id":e.id,"kind":"order","from":e.from,"state":e.to,"label":e.label,"enabled":reason.is_none(),"reason":reason}));
        }
    }
    if ["pending", "authorized"].contains(&o["payment"]["state"].as_str().unwrap_or(""))
        && o["payment"]["provider"] != "paypal"
    {
        let reason = guard(o, "payment", "paid");
        actions.push(json!({"id":"mark_paid","kind":"payment","from":o["payment"]["state"],"state":"paid","enabled":reason.is_none(),"reason":reason}));
    }
    if let Some(ds) = o["deliveries"].as_array() {
        for (index, d) in ds.iter().enumerate() {
            let next = match d["state"].as_str() {
                Some("open") => Some("shipped"),
                Some("shipped") => Some("delivered"),
                _ => None,
            };
            if let Some(next) = next {
                let reason = guard(o, "delivery", next);
                actions.push(json!({"id":format!("delivery_{index}_{next}"),"kind":"delivery","from":d["state"],"state":next,"deliveryIndex":index,"enabled":reason.is_none(),"reason":reason}));
            }
        }
    }
    json!({"revision":revision,"states":m.states,"actions":actions})
}
