//! Shared field-level content fallback for metadata and configurable object names.
use super::*;
pub(crate) fn translated_string<'a>(values: &'a Value, locale: &str, main: &str) -> &'a str {
    [
        locale,
        locale.split('-').next().unwrap_or(locale),
        main,
        main.split('-').next().unwrap_or(main),
    ]
    .into_iter()
    .find_map(|key| values[key].as_str())
    .unwrap_or("")
}
pub(crate) fn translated_object(values: &Value, locale: &str, main: &str) -> Value {
    let mut result = json!({});
    for key in [
        main.split('-').next().unwrap(),
        main,
        locale.split('-').next().unwrap(),
        locale,
    ] {
        if let Some(object) = values[key].as_object() {
            for (field, value) in object {
                if !value.is_null() {
                    result[field] = value.clone();
                }
            }
        }
    }
    result
}
pub(crate) fn localize_extra(extra: &mut Value, chain: &[String]) {
    let Some(selected) = chain.first() else {
        return;
    };
    for field in ["seo", "specifications", "richDescription"] {
        let mut effective = Value::Null;
        for locale in chain.iter().rev() {
            let base = locale.split('-').next().unwrap();
            for key in [base, locale.as_str()] {
                let value = &extra[field][key];
                if value.is_null() {
                    continue;
                }
                if value.is_object() && effective.is_object() {
                    for (k, v) in value.as_object().unwrap() {
                        if !v.is_null() {
                            effective[k] = v.clone();
                        }
                    }
                } else {
                    effective = value.clone();
                }
            }
        }
        if !effective.is_null() {
            extra[field][selected.split('-').next().unwrap()] = effective.clone();
            extra[field][selected] = effective;
        }
    }
}
pub(crate) fn validate_names(names: &Value, settings: &Settings, max: usize) -> Result<()> {
    let map = names
        .as_object()
        .filter(|m| !m.is_empty() && m.len() <= 100)
        .ok_or(bad("Translated names required"))?;
    for (key, value) in map {
        if !super::product_languages::allowed(key, settings)
            || !value.is_null() && value.as_str().is_none_or(|s| s.is_empty() || s.len() > max)
        {
            return Err(bad("Invalid translated name"));
        }
    }
    if names[&settings.main_locale]
        .as_str()
        .or_else(|| names[settings.main_locale.split('-').next().unwrap()].as_str())
        .is_none_or(|s| s.is_empty())
    {
        return Err(bad("Main language name required"));
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn each_field_inherits_main_and_preserves_blank() {
        let map = json!({"es":{"name":"Nombre","description":"Original","slug":"producto"},"de":{"name":null,"description":""}});
        let out = translated_object(&map, "de-DE", "es-ES");
        assert_eq!(out["name"], "Nombre");
        assert_eq!(out["description"], "");
        assert_eq!(out["slug"], "producto");
    }
    #[test]
    fn metadata_uses_resolved_language_chain() {
        let mut extra = json!({"seo":{"en":{"title":"EN"},"es":{"title":"ES","description":"Original"},"de":{"title":null}},"richDescription":{"es":[{"type":"paragraph","text":"Hola"}]}});
        localize_extra(&mut extra, &["de-DE".into(), "es-ES".into()]);
        assert_eq!(extra["seo"]["de"]["title"], "ES");
        assert_eq!(extra["richDescription"]["de"][0]["text"], "Hola");
    }
}
