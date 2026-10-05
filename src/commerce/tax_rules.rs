//! Priority-based destination rules; current tax law is merchant configuration, not bundled tax advice.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DestinationRule {
    pub id: String,
    pub country: String,
    pub rate: f64,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub states: Vec<String>,
    #[serde(default)]
    pub postal_codes: Vec<String>,
    #[serde(default)]
    pub postal_prefixes: Vec<String>,
    #[serde(default)]
    pub postal_from: Option<String>,
    #[serde(default)]
    pub postal_to: Option<String>,
    #[serde(default)]
    pub active_from: Option<String>,
    #[serde(default)]
    pub active_until: Option<String>,
    #[serde(default)]
    pub condition: Option<Value>,
}
pub(crate) fn validate_tax_rules(t: &TaxConfig, s: &Settings) -> Result<()> {
    let world = super::geography::catalogue(s);
    let mut ids = std::collections::HashSet::new();
    if t.rules.len() > 500
        || t.default_rate
            .is_some_and(|x| !x.is_finite() || !(0. ..=100.).contains(&x))
    {
        return Err(bad("Invalid default tax rate or rule limit"));
    }
    for r in &t.rules {
        let country = world
            .iter()
            .find(|c| c.code == r.country)
            .ok_or(bad("Unknown tax rule country"))?;
        if !ids.insert(&r.id)
            || !apps::identifier(&r.id)
            || !r.rate.is_finite()
            || !(0. ..=100.).contains(&r.rate)
            || r.states
                .iter()
                .any(|st| !country.states.iter().any(|x| x.code == *st))
            || r.postal_codes.len() > 100
            || r.postal_prefixes.len() > 100
            || r.postal_codes
                .iter()
                .chain(r.postal_prefixes.iter())
                .any(|v| v.is_empty() || v.len() > 32)
        {
            return Err(bad("Invalid destination tax rule"));
        }
        match (&r.postal_from, &r.postal_to) {
            (Some(a), Some(b))
                if a.len() == b.len()
                    && a <= b
                    && a.bytes().all(|x| x.is_ascii_digit())
                    && b.bytes().all(|x| x.is_ascii_digit()) => {}
            (None, None) => {}
            _ => return Err(bad("Postal ranges require equal-length numeric bounds")),
        }
        for d in [&r.active_from, &r.active_until].into_iter().flatten() {
            if d.len() != 10 {
                return Err(bad("Tax dates require YYYY-MM-DD"));
            }
            chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
                .map_err(|_| bad("Tax dates require YYYY-MM-DD"))?;
        }
        if let (Some(a), Some(b)) = (&r.active_from, &r.active_until)
            && a > b
        {
            return Err(bad("Tax validity range is inverted"));
        }
        if let Some(c) = &r.condition {
            marketing::validate_condition(c)?;
        }
    }
    Ok(())
}
pub(crate) fn destination_rate(t: &TaxConfig, c: &CheckoutSelection, today: &str) -> Result<f64> {
    let address = c.address.as_ref();
    let state = address.map(|a| a.country_state_id.as_str()).unwrap_or("");
    let postal = address.map(|a| a.postal_code.as_str()).unwrap_or("");
    let mut matches = t
        .rules
        .iter()
        .filter(|r| {
            let date = r.active_from.as_deref().is_none_or(|d| d <= today)
                && r.active_until.as_deref().is_none_or(|d| d >= today);
            let zip = (r.postal_codes.is_empty() || r.postal_codes.iter().any(|x| x == postal))
                && (r.postal_prefixes.is_empty()
                    || r.postal_prefixes.iter().any(|x| postal.starts_with(x)))
                && r.postal_from.as_ref().is_none_or(|a| {
                    postal.bytes().all(|x| x.is_ascii_digit())
                        && postal.len() == a.len()
                        && postal >= a.as_str()
                        && postal <= r.postal_to.as_deref().unwrap_or("")
                });
            verified_kernel::destination_tax_admissible(
                r.condition.is_none(),
                r.country == c.country,
                r.states.is_empty() || r.states.iter().any(|x| x == state),
                zip,
                date,
            )
        })
        .collect::<Vec<_>>();
    matches.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then_with(|| b.specificity().cmp(&a.specificity()))
            .then_with(|| a.id.cmp(&b.id))
    });
    matches
        .first()
        .map(|r| r.rate)
        .or_else(|| t.rates.get(&c.country).copied())
        .or(t.default_rate)
        .ok_or(bad("Country tax rate missing"))
}
impl DestinationRule {
    fn specificity(&self) -> usize {
        usize::from(!self.states.is_empty())
            + 2 * usize::from(
                !self.postal_codes.is_empty()
                    || !self.postal_prefixes.is_empty()
                    || self.postal_from.is_some(),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tax() -> TaxConfig {
        serde_json::from_value(
            json!({"id":"standard","rates":{"US":5},"defaultRate":19,"rules":[]}),
        )
        .unwrap()
    }
    fn rule(id: &str, rate: f64, priority: i32) -> DestinationRule {
        serde_json::from_value(
            json!({"id":id,"country":"US","rate":rate,"priority":priority,"states":["US-CA"]}),
        )
        .unwrap()
    }
    #[test]
    fn destination_order_boundaries_and_fail_closed_condition() {
        let mut t = tax();
        let mut c = CheckoutSelection {
            country: "US".into(),
            address: Some(Address {
                country_state_id: "US-CA".into(),
                postal_code: "90210".into(),
                ..Address::default()
            }),
            ..CheckoutSelection::defaults()
        };
        t.rules = vec![rule("state", 7.25, 0), rule("postal", 9.5, 0)];
        t.rules[1].postal_from = Some("90000".into());
        t.rules[1].postal_to = Some("91999".into());
        assert_eq!(destination_rate(&t, &c, "2026-10-05").unwrap(), 9.5);
        t.rules[0].priority = 1;
        assert_eq!(destination_rate(&t, &c, "2026-10-05").unwrap(), 7.25);
        t.rules[0].condition = Some(json!({"type":"alwaysValid"}));
        assert_eq!(destination_rate(&t, &c, "2026-10-05").unwrap(), 9.5);
        t.rules[1].active_until = Some("2026-10-04".into());
        assert_eq!(destination_rate(&t, &c, "2026-10-05").unwrap(), 5.);
        c.country = "ZZ".into();
        assert_eq!(destination_rate(&t, &c, "2026-10-05").unwrap(), 19.);
        t.default_rate = None;
        assert!(destination_rate(&t, &c, "2026-10-05").is_err());
    }
    #[test]
    fn validity_inclusive_and_alpha_postcode_cannot_enter_numeric_range() {
        let mut t = tax();
        t.rules = vec![rule("range", 9.5, 0)];
        t.rules[0].postal_from = Some("90000".into());
        t.rules[0].postal_to = Some("91999".into());
        t.rules[0].active_from = Some("2026-10-05".into());
        t.rules[0].active_until = Some("2026-10-05".into());
        let mut c = CheckoutSelection {
            country: "US".into(),
            address: Some(Address {
                country_state_id: "US-CA".into(),
                postal_code: "91000".into(),
                ..Address::default()
            }),
            ..CheckoutSelection::defaults()
        };
        assert_eq!(destination_rate(&t, &c, "2026-10-05").unwrap(), 9.5);
        c.address.as_mut().unwrap().postal_code = "910AA".into();
        assert_eq!(destination_rate(&t, &c, "2026-10-05").unwrap(), 5.);
    }
}
