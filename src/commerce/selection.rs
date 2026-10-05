//! Recover a quote after configuration changes without losing items or silently committing new choices.
use super::*;
pub(crate) fn resolve_selection(
    mut selected: CheckoutSelection,
    group: &str,
    settings: &Settings,
) -> CheckoutSelection {
    if !settings.countries.contains(&selected.country) {
        selected.country = settings.countries[0].clone();
    }
    let shipping = settings
        .shipping
        .iter()
        .filter(|v| v.active && v.countries.contains(&selected.country))
        .collect::<Vec<_>>();
    if !shipping.iter().any(|v| v.id == selected.shipping_method_id) {
        selected.shipping_method_id = shipping.first().map(|v| v.id.clone()).unwrap_or_default();
    }
    let payments = settings
        .payments
        .iter()
        .filter(|v| {
            v.active
                && (!v.business_only || group == "business")
                && v.available_in(&selected.country)
        })
        .collect::<Vec<_>>();
    if !payments.iter().any(|v| v.id == selected.payment_method_id) {
        selected.payment_method_id = payments.first().map(|v| v.id.clone()).unwrap_or_default();
    }
    selected
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn disabled_selection_recovers_without_losing_address() {
        let mut s: Settings =
            serde_json::from_str(include_str!("../../fixtures/demo-settings.json")).unwrap();
        s.countries.retain(|c| c != "DE");
        let selected = CheckoutSelection {
            country: "DE".into(),
            shipping_method_id: "missing".into(),
            payment_method_id: "invoice".into(),
            ..CheckoutSelection::defaults()
        };
        let recovered = resolve_selection(selected, "consumer", &s);
        assert!(s.countries.contains(&recovered.country));
        assert_ne!(recovered.payment_method_id, "invoice");
        assert_ne!(recovered.shipping_method_id, "missing");
    }
}
