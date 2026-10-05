//! Shared translated names and descriptions with field-wise shop-main-language inheritance.
use super::*;
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Text {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}
pub(crate) fn text_field<'a>(
    values: &'a HashMap<String, Text>,
    locale: &str,
    main: &str,
    description: bool,
) -> Option<&'a str> {
    [
        locale,
        locale.split('-').next().unwrap_or(locale),
        main,
        main.split('-').next().unwrap_or(main),
    ]
    .into_iter()
    .find_map(|key| {
        values.get(key).and_then(|t| {
            if description {
                t.description.as_deref()
            } else {
                t.name.as_deref()
            }
        })
    })
}
pub(crate) fn validate_text(values: &HashMap<String, Text>, s: &Settings) -> Result<()> {
    if values.len() > 100
        || values.iter().any(|(l, t)| {
            !s.locales
                .iter()
                .any(|x| x == l || x.split('-').next() == Some(l.as_str()))
                || t.name.as_ref().is_some_and(|v| v.len() > 200)
                || t.description.as_ref().is_some_and(|v| v.len() > 4000)
        })
    {
        return Err(bad("Invalid translated method text"));
    }
    Ok(())
}
pub(crate) fn localized_shipping(v: &Shipping, locale: &str, s: &Settings) -> Value {
    let mut value = json!(v);
    value["name"] =
        json!(text_field(&v.translations, locale, &s.main_locale, false).unwrap_or(&v.name));
    value["description"] =
        json!(text_field(&v.translations, locale, &s.main_locale, true).unwrap_or(""));
    value
}
pub(crate) fn localized_payment(v: &Payment, locale: &str, s: &Settings) -> Value {
    let mut value = json!(v);
    value["name"] =
        json!(text_field(&v.translations, locale, &s.main_locale, false).unwrap_or(&v.name));
    value["description"] =
        json!(text_field(&v.translations, locale, &s.main_locale, true).unwrap_or(""));
    value
}
