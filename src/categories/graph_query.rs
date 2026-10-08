//! Saved category predicates select only current confirmed public source claims; no inference at browse time.
use super::*;
pub(super) const TYPES: &[&str] = &[
    "intent", "problem", "occasion", "audience", "material", "property",
];

pub(super) fn validate(data: &Value, settings: &commerce::Settings) -> Result<()> {
    let Some(query) = data.get("graphQuery").filter(|v| !v.is_null()) else {
        return Ok(());
    };
    let object = query.as_object().ok_or(bad("Invalid saved fact query"))?;
    if data["type"] != "page"
        || object.len() != 3
        || object
            .keys()
            .any(|key| !["nodeType", "minimumConfidence", "text"].contains(&key.as_str()))
        || !TYPES.contains(&query["nodeType"].as_str().unwrap_or(""))
        || !query["minimumConfidence"]
            .as_f64()
            .is_some_and(|n| n.is_finite() && (0.0..=1.0).contains(&n))
    {
        return Err(bad(
            "Saved fact query requires a listing, supported node type and confidence 0..1",
        ));
    }
    let text = query["text"]
        .as_object()
        .filter(|m| !m.is_empty() && m.len() <= 100)
        .ok_or(bad("Localized fact query required"))?;
    for (locale, value) in text {
        let allowed = settings.locales.iter().any(|l| l == locale)
            || (settings
                .locales
                .iter()
                .filter(|l| l.split('-').next() == Some(locale))
                .count()
                == 1);
        if !allowed
            || (!value.is_null()
                && !value.as_str().is_some_and(|s| {
                    s.is_empty() || (s.trim() == s && s.chars().count() >= 3 && s.len() <= 120)
                }))
        {
            return Err(bad(
                "Fact query text requires an enabled language and 3..120 bytes, or explicit empty/inherit",
            ));
        }
    }
    let main = text
        .get(&settings.main_locale)
        .and_then(Value::as_str)
        .or_else(|| {
            text.get(settings.main_locale.split('-').next().unwrap_or(""))
                .and_then(Value::as_str)
        })
        .unwrap_or("");
    if main.is_empty() {
        return Err(bad("Main-language fact query required"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_query_is_closed_localized_and_bounded() {
        let settings: commerce::Settings =
            serde_json::from_value(json!({"countries":[],"taxes":[],"shipping":[],"payments":[]}))
                .unwrap();
        let mut data = json!({"type":"page","graphQuery":{"nodeType":"intent","minimumConfidence":0.8,"text":{"en":"cycling","de":null,"es":""}}});
        assert!(validate(&data, &settings).is_ok());
        for q in [
            json!({"nodeType":"unknown","minimumConfidence":0.8,"text":{"en":"cycling"}}),
            json!({"nodeType":"intent","minimumConfidence":1.1,"text":{"en":"cycling"}}),
            json!({"nodeType":"intent","minimumConfidence":0.8,"text":{"en":"ab"}}),
            json!({"nodeType":"intent","minimumConfidence":0.8,"text":{"en":"cycling","xx":"test"}}),
            json!({"nodeType":"intent","minimumConfidence":0.8,"text":{"en":"cycling"},"sql":"arbitrary"}),
        ] {
            data["graphQuery"] = q;
            assert!(validate(&data, &settings).is_err());
        }
        data["graphQuery"] = Value::Null;
        assert!(validate(&data, &settings).is_ok());
    }
}
