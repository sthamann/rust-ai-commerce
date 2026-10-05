//! Tenant-owned translated customer groups preserve exact rule IDs and select an explicit existing price/tax presentation basis.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CustomerGroup {
    pub id: String,
    pub translations: HashMap<String, super::method_text::Text>,
    pub price_basis: String,
}
pub(super) fn defaults() -> Vec<CustomerGroup> {
    serde_json::from_value(json!([
      {"id":"consumer","priceBasis":"consumer","translations":{"en-GB":{"name":"Consumers"},"de-DE":{"name":"Privatkunden"},"es-ES":{"name":"Clientes particulares"},"fr-FR":{"name":"Particuliers"}}},
      {"id":"business","priceBasis":"business","translations":{"en-GB":{"name":"Business customers"},"de-DE":{"name":"Geschäftskunden"},"es-ES":{"name":"Clientes profesionales"},"fr-FR":{"name":"Professionnels"}}}
    ])).unwrap()
}
impl Settings {
    pub(crate) fn is_business(&self, group: &str) -> bool {
        let entry = self.customer_groups.iter().find(|g| g.id == group);
        verified_kernel::customer_group_net(
            entry.is_some(),
            entry.is_some_and(|g| g.price_basis == "business"),
        )
    }
}
pub(super) fn validate_groups(s: &Settings) -> Result<()> {
    let mut seen = std::collections::HashSet::new();
    if s.customer_groups.is_empty() || s.customer_groups.len() > 100 {
        return Err(bad("Invalid customer group count"));
    }
    for g in &s.customer_groups {
        if !apps::identifier(&g.id)
            || g.id.len() > 50
            || !seen.insert(&g.id)
            || !["consumer", "business"].contains(&g.price_basis.as_str())
        {
            return Err(bad("Invalid customer group identity or price basis"));
        }
        super::method_text::validate_text(&g.translations, s)?;
        if (g.id == "consumer" && g.price_basis != "consumer")
            || (g.id == "business" && g.price_basis != "business")
        {
            return Err(bad("Built-in customer group price basis is fixed"));
        }
    }
    if !seen.contains(&"consumer".to_string()) || !seen.contains(&"business".to_string()) {
        return Err(bad("Built-in customer groups are required"));
    }
    Ok(())
}
pub(crate) async fn groups(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let t = merchant(&a, &h)?;
    if auth::permit(&h, "customers.read").is_err() {
        auth::permit(&h, "settings.read")?;
    }
    let (s, revision) = config(&a, &t).await?;
    Ok(Json(
        json!({"elements":s.customer_groups,"revision":revision,"mainLocale":s.main_locale,"availableLocales":s.locales}),
    ))
}
