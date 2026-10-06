//! Bounded multilingual legal configuration; policy changes invalidate optional-purpose consent.
use crate::*;
pub(crate) const PURPOSES: &[&str] = &[
    "analytics",
    "personalization",
    "externalMedia",
    "maps",
    "marketing",
];
pub(crate) const DOCUMENTS: &[&str] = &[
    "privacy",
    "terms",
    "withdrawal",
    "shipping",
    "accessibility",
    "disputes",
];
pub(crate) const SECTORS: &[&str] = &[
    "general",
    "textiles",
    "food",
    "cosmetics",
    "electronics",
    "ageRestricted",
    "digital",
    "subscriptions",
    "regulated",
];
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Config {
    #[serde(default)]
    pub strict_checkout: bool,
    #[serde(default = "days")]
    pub consent_days: u32,
    #[serde(default = "purposes")]
    pub purposes: HashMap<String, bool>,
    #[serde(default)]
    pub services: Vec<Service>,
    #[serde(default)]
    pub documents: HashMap<String, HashMap<String, String>>,
    #[serde(default = "sectors")]
    pub sectors: Vec<String>,
    #[serde(default)]
    pub operator_notes: HashMap<String, String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Service {
    pub id: String,
    pub provider: String,
    pub purpose: String,
    pub description: HashMap<String, String>,
    pub retention: String,
    pub privacy_url: String,
}
fn days() -> u32 {
    180
}
fn purposes() -> HashMap<String, bool> {
    PURPOSES.iter().map(|p| ((*p).into(), true)).collect()
}
fn sectors() -> Vec<String> {
    vec!["general".into()]
}
impl Default for Config {
    fn default() -> Self {
        Self {
            strict_checkout: false,
            consent_days: days(),
            purposes: purposes(),
            services: vec![],
            documents: HashMap::new(),
            sectors: sectors(),
            operator_notes: HashMap::new(),
        }
    }
}
pub(crate) fn version(c: &Config) -> String {
    let mut v = json!(c);
    v.as_object_mut().unwrap().remove("operatorNotes");
    hash(&v.to_string())
}
pub(crate) fn validate(c: &Config, s: &commerce::Settings) -> Result<()> {
    if !(1..=365).contains(&c.consent_days)
        || c.services.len() > 40
        || c.sectors.len() > SECTORS.len()
        || c.sectors.iter().any(|v| !SECTORS.contains(&v.as_str()))
        || c.purposes.keys().any(|v| !PURPOSES.contains(&v.as_str()))
    {
        return Err(bad("Invalid privacy configuration"));
    }
    let text = |texts: &HashMap<String, String>, limit| -> Result<()> {
        if texts.len() > 100
            || texts.iter().any(|(l, t)| {
                !commerce::company_locale_allowed(l, s) || t.len() > limit || t.contains('\0')
            })
        {
            return Err(bad("Invalid localized legal text"));
        }
        Ok(())
    };
    for (key, texts) in &c.documents {
        if !DOCUMENTS.contains(&key.as_str()) {
            return Err(bad("Unknown legal document"));
        }
        text(texts, 30000)?;
    }
    let mut ids = std::collections::HashSet::new();
    for service in &c.services {
        if !apps::identifier(&service.id)
            || !ids.insert(&service.id)
            || !PURPOSES.contains(&service.purpose.as_str())
            || service.provider.len() > 200
            || service.provider.trim().is_empty()
            || service.retention.len() > 300
        {
            return Err(bad("Invalid privacy service"));
        }
        text(&service.description, 2000)?;
        if !reqwest::Url::parse(&service.privacy_url).is_ok_and(|u| {
            u.scheme() == "https"
                && u.host_str().is_some()
                && u.username().is_empty()
                && u.password().is_none()
        }) {
            return Err(bad("Invalid privacy service URL"));
        }
    }
    if c.operator_notes.len() > 40
        || c.operator_notes
            .iter()
            .any(|(k, v)| k.len() > 100 || v.len() > 8000 || v.contains('\0'))
    {
        return Err(bad("Invalid compliance notes"));
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn policy_versions_are_deterministic_and_sensitive() {
        let a = Config::default();
        let mut b = a.clone();
        b.purposes.insert("analytics".into(), false);
        assert_eq!(version(&a), version(&a));
        assert_ne!(version(&a), version(&b));
    }
}
