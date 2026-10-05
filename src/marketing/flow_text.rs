//! Shop-language validation and main-language fallback for both simple flows and graphical action nodes.
use super::*;
pub(super) fn shape(value: &Value) -> Result<()> {
    let map = value
        .as_object()
        .filter(|m| !m.is_empty() && m.len() <= 100)
        .ok_or(bad("Flow instruction map required"))?;
    if map.iter().any(|(key, v)| {
        !commerce::valid_locale_key(key)
            || !v.is_null()
                && v.as_str()
                    .is_none_or(|s| s.trim().is_empty() || s.len() > 3200)
    }) {
        return Err(bad("Invalid flow instruction translation"));
    }
    Ok(())
}
pub(super) fn validate(f: &flows::Flow, settings: &commerce::Settings) -> Result<()> {
    if !settings.locales.contains(&f.locale) {
        return Err(bad("Flow locale must be enabled in this shop"));
    }
    if f.action != "pipeline" {
        commerce::validate_names(&json!(f.instruction), settings, 3200)?;
    }
    if let Some(p) = &f.pipeline {
        for node in &p.nodes {
            if let pipeline::Node::Action { action, config, .. } = node
                && matches!(action.as_str(), "note" | "ai_proposal")
            {
                commerce::validate_names(&config["instruction"], settings, 3200)?;
            }
        }
    }
    Ok(())
}
pub(super) fn effective<'a>(value: &'a Value, locale: &str, main: &str) -> &'a str {
    commerce::translated_string(value, locale, main)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn instructions_use_shop_main_not_english_and_keep_regional_overrides() {
        let v = json!({"es":"Principal", "en":"English", "de":null, "de-AT":"Austria"});
        assert_eq!(effective(&v, "de-DE", "es-ES"), "Principal");
        assert_eq!(effective(&v, "de-AT", "es-ES"), "Austria");
        assert!(shape(&v).is_ok());
        assert!(shape(&json!({"it":"Italiano"})).is_ok());
        assert!(shape(&json!({"en-12":"Invalid"})).is_err());
        assert!(shape(&json!({"es":" "})).is_err());
        assert!(shape(&json!({"es":"x".repeat(3201)})).is_err());
    }
    #[test]
    fn dynamic_enabled_language_requires_main_and_rejects_foreign_keys() {
        let mut settings: commerce::Settings =
            serde_json::from_str(include_str!("../../fixtures/demo-settings.json")).unwrap();
        settings.main_locale = "es-ES".into();
        settings.locales.push("it-IT".into());
        let mut f: flows::Flow = serde_json::from_value(json!({"name":{"es":"Flujo"},"active":true,"event":"order.placed","condition":{"type":"alwaysValid"},"action":"note","instruction":{"es":"Principal"},"locale":"it-IT"})).unwrap();
        assert!(f.validate().is_ok());
        assert!(validate(&f, &settings).is_ok());
        f.instruction = HashMap::from([("en".into(), Some("English".into()))]);
        assert!(validate(&f, &settings).is_err());
        f.instruction.insert("es".into(), Some("Principal".into()));
        f.instruction.insert("ja".into(), Some("Foreign".into()));
        assert!(validate(&f, &settings).is_err());
    }
}
