//! Versioned app-owned payment methods; declarations never grant financial authority.
use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ProviderContract {
    pub api_version: String,
    pub methods: Vec<ProviderMethod>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ProviderMethod {
    pub id: String,
    pub name: HashMap<String, String>,
    pub currencies: Vec<String>,
    pub countries: Vec<String>,
    pub capabilities: Vec<String>,
    pub checkout: String,
    pub intent: String,
}
pub(crate) fn validate_contract(m: &apps::Manifest) -> Result<()> {
    let Some(p) = &m.payment_provider else {
        return Ok(());
    };
    if ["paypal", "manual", "simulated"].contains(&m.id.as_str())
        || m.runtime != "service"
        || m.category.as_deref() != Some("payment")
        || !m.permissions.iter().any(|v| v == "payments.provider")
        || p.api_version != "1"
        || p.methods.is_empty()
        || p.methods.len() > 32
    {
        return Err(bad(
            "Payment provider requires service runtime, payment category and API 1",
        ));
    }
    let mut ids = std::collections::HashSet::new();
    for method in &p.methods {
        if !apps::identifier(&method.id)
            || !ids.insert(&method.id)
            || method.name.is_empty()
            || method.name.values().any(|n| n.is_empty() || n.len() > 200)
            || method.currencies.is_empty()
            || method.currencies.len() > 32
            || method
                .currencies
                .iter()
                .any(|c| c.len() != 3 || !c.bytes().all(|b| b.is_ascii_uppercase()))
            || method.countries.len() > 300
            || method
                .countries
                .iter()
                .any(|c| c.len() != 2 || !c.bytes().all(|b| b.is_ascii_uppercase()))
            || !["redirect", "embedded"].contains(&method.checkout.as_str())
            || !["capture", "authorize"].contains(&method.intent.as_str())
            || !method.capabilities.iter().any(|c| c == &method.intent)
            || method.capabilities.len() > 8
            || method.capabilities.iter().any(|c| {
                ![
                    "capture",
                    "authorize",
                    "void",
                    "refund",
                    "recurring",
                    "vault",
                ]
                .contains(&c.as_str())
            })
        {
            return Err(bad("Invalid payment method contract"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn manifest() -> apps::Manifest {
        serde_json::from_str(include_str!(
            "../../extensions/apps/payment-provider/manifest.json"
        ))
        .unwrap()
    }
    #[test]
    fn reserved_identity_and_invalid_capability_contracts_are_rejected() {
        let base = manifest();
        assert!(validate_contract(&base).is_ok());
        for id in ["paypal", "manual", "simulated"] {
            let mut m = base.clone();
            m.id = id.into();
            assert!(validate_contract(&m).is_err());
        }
        let mut m = base.clone();
        let duplicate = m.payment_provider.as_ref().unwrap().methods[0].clone();
        m.payment_provider.as_mut().unwrap().methods.push(duplicate);
        assert!(validate_contract(&m).is_err());
        let mut m = base.clone();
        m.payment_provider.as_mut().unwrap().methods[0].capabilities = vec!["refund".into()];
        assert!(validate_contract(&m).is_err());
        let mut m = base;
        m.runtime = "declarative".into();
        assert!(validate_contract(&m).is_err());
    }
}
