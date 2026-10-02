//! Configuration validation and required availability invariants.
use super::*;

pub(crate) fn validate_config(s: &Settings) -> Result<()> {
    fn ids<'a>(v: impl Iterator<Item = &'a str>) -> bool {
        let mut seen = std::collections::HashSet::new();
        v.into_iter().all(|v| {
            !v.is_empty()
                && v.len() <= 50
                && v.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
                && seen.insert(v)
        })
    }
    if s.countries.is_empty()
        || s.countries.len() > 20
        || !ids(s.countries.iter().map(String::as_str))
        || s.countries.iter().any(|v| v.len() != 2)
    {
        return Err(bad("Invalid country list"));
    }
    if s.taxes.len() != 2
        || !s.taxes.iter().any(|t| t.id == "standard")
        || !s.taxes.iter().any(|t| t.id == "reduced")
    {
        return Err(bad("Standard and reduced tax classes required"));
    }
    for t in &s.taxes {
        for c in &s.countries {
            let r = t.rates.get(c).ok_or(bad("Missing country rate"))?;
            if !r.is_finite() || !(0. ..=50.).contains(r) {
                return Err(bad("Tax rates must be 0..50"));
            }
        }
    }
    if s.shipping.is_empty()
        || s.shipping.len() > 20
        || !ids(s.shipping.iter().map(|v| v.id.as_str()))
        || s.payments.is_empty()
        || s.payments.len() > 20
        || !ids(s.payments.iter().map(|v| v.id.as_str()))
    {
        return Err(bad("Invalid shipping/payment IDs"));
    }
    for v in &s.shipping {
        if !v.price.is_finite()
            || !(0. ..=1000.).contains(&v.price)
            || v.free_above
                .is_some_and(|v| !v.is_finite() || !(0. ..=100000.).contains(&v))
            || v.min_days < 0
            || v.max_days < v.min_days
            || v.max_days > 365
            || !["highest", "proportional"].contains(&v.tax_type.as_str())
            || v.name.len() > 80
            || v.countries.iter().any(|v| !s.countries.contains(v))
        {
            return Err(bad("Invalid shipping configuration"));
        }
    }
    for country in &s.countries {
        if !s
            .shipping
            .iter()
            .any(|v| v.active && v.countries.contains(country))
        {
            return Err(bad("Every enabled country needs an active shipping method"));
        }
    }
    if !s.payments.iter().any(|v| v.active && !v.business_only) {
        return Err(bad(
            "At least one consumer payment method must remain active",
        ));
    }
    for v in &s.payments {
        if !["manual", "simulated", "app"].contains(&v.mode.as_str())
            || v.name.len() > 80
            || (v.mode == "app" && v.id != "paypal-sandbox")
        {
            return Err(bad("Unsupported payment mode"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn template() -> Settings {
        serde_json::from_str(include_str!("../../fixtures/demo-settings.json")).unwrap()
    }
    #[test]
    fn valid_configuration_and_unavailable_countries() {
        let mut s = template();
        assert!(validate_config(&s).is_ok());
        s.countries.push("IT".into());
        assert!(validate_config(&s).is_err());
        let mut s = template();
        s.shipping.iter_mut().for_each(|v| v.active = false);
        assert!(validate_config(&s).is_err());
    }
    #[test]
    fn unsafe_payment_and_invalid_tax_or_delivery_are_rejected() {
        let mut s = template();
        s.payments[0].mode = "live-charge".into();
        assert!(validate_config(&s).is_err());
        let mut s = template();
        s.taxes[0].rates.insert("DE".into(), -1.);
        assert!(validate_config(&s).is_err());
        let mut s = template();
        s.shipping[0].max_days = -1;
        assert!(validate_config(&s).is_err());
        let mut s = template();
        s.shipping.push(s.shipping[0].clone());
        assert!(validate_config(&s).is_err());
    }
}
