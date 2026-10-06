//! One server-derived action catalogue drives UI, HTTP and MCP; built-in business guards cannot be bypassed.
use super::*;
pub(crate) fn guard(o: &Value, m: &OrderMachine, kind: &str, target: &str) -> Option<&'static str> {
    let state = o["state"].as_str().unwrap_or("");
    let terminal = m.states.iter().any(|s| s.id == state && s.terminal)
        || ["expired", "payment_review"].contains(&state);
    if !verified_kernel::order_edit_admissible(terminal) {
        return Some("terminalOrder");
    }
    let external = crate::payments::external(o);
    let ps = o["payment"]["state"].as_str().unwrap_or("");
    let refund = ["paid", "captured", "partially_refunded"].contains(&ps);
    let deliveries_open = o["deliveries"]
        .as_array()
        .is_none_or(|ds| ds.iter().all(|d| d["state"] == "open"));
    let delivered = o["deliveries"]
        .as_array()
        .is_none_or(|ds| ds.iter().all(|d| d["state"] == "delivered"));
    let payment_ready = ["paid", "captured"].contains(&ps)
        || o["payment"]["provider"] == "simulated" && ps == "authorized";
    match (kind, target) {
        ("order", "cancelled")
            if !verified_kernel::cancellation_admissible(
                terminal,
                external,
                refund,
                deliveries_open,
            ) =>
        {
            Some(if external || refund {
                "refundFirst"
            } else {
                "returnFirst"
            })
        }
        ("order", "completed")
            if !verified_kernel::completion_admissible(terminal, payment_ready, delivered) =>
        {
            Some(if !payment_ready {
                "paymentFirst"
            } else {
                "deliveryFirst"
            })
        }
        ("payment", _) if external => Some("providerConfirmation"),
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
            let reason = guard(o, m, "order", &e.to);
            actions.push(json!({"id":e.id,"kind":"order","from":e.from,"state":e.to,"label":e.label,"enabled":reason.is_none(),"reason":reason}));
        }
    }
    if ["pending", "authorized"].contains(&o["payment"]["state"].as_str().unwrap_or(""))
        && !crate::payments::external(o)
    {
        let reason = guard(o, m, "payment", "paid");
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
                let reason = guard(o, m, "delivery", next);
                actions.push(json!({"id":format!("delivery_{index}_{next}"),"kind":"delivery","from":d["state"],"state":next,"deliveryIndex":index,"enabled":reason.is_none(),"reason":reason}));
            }
        }
    }
    json!({"revision":revision,"states":m.states,"actions":actions})
}
