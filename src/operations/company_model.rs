//! Company profile admission, sparse channel inheritance and structured-address print projection.
use super::*;
pub(super) const FIELDS: &[&str] = &[
    "name",
    "address",
    "street",
    "houseNumber",
    "additionalAddressLine1",
    "additionalAddressLine2",
    "postalCode",
    "city",
    "country",
    "countryStateId",
    "taxId",
    "vatId",
    "economicId",
    "legalForm",
    "registrationNumber",
    "registerType",
    "registerCourt",
    "managingDirectors",
    "legalRepresentatives",
    "contentResponsible",
    "contentResponsibleAddress",
    "supervisoryAuthority",
    "professionalChamber",
    "professionalTitle",
    "professionalCountry",
    "professionalRulesUrl",
    "shareCapital",
    "outstandingCapital",
    "liquidationNotice",
    "email",
    "phoneNumber",
    "website",
    "bankName",
    "iban",
    "bic",
    "logoId",
    "brandName",
    "legalNotice",
    "responsibilityScope",
];
pub(super) const LOCALIZED: &[&str] = &["brandName", "legalNotice", "responsibilityScope"];
pub(crate) fn resolve(base: &Value, overrides: &Value) -> Value {
    let mut value = base.clone();
    if !value.is_object() {
        value = json!({});
    }
    if let Some(patch) = overrides.as_object() {
        for (key, field) in patch {
            if field.is_null() {
                continue;
            }
            if LOCALIZED.contains(&key.as_str()) && field.is_object() {
                let mut text = value[key].as_object().cloned().unwrap_or_default();
                for (locale, text_value) in field.as_object().unwrap() {
                    if !text_value.is_null() {
                        text.insert(locale.clone(), text_value.clone());
                    }
                }
                value[key] = Value::Object(text);
            } else {
                value[key] = field.clone();
            }
        }
    }
    if value["street"]
        .as_str()
        .is_some_and(|s| !s.trim().is_empty())
    {
        value["address"] = json!(address(&value));
    }
    value
}
pub(crate) fn address(v: &Value) -> String {
    let get = |k: &str| v[k].as_str().unwrap_or("").trim();
    if get("street").is_empty() {
        return get("address").into();
    }
    [
        format!("{} {}", get("street"), get("houseNumber"))
            .trim()
            .to_string(),
        get("additionalAddressLine1").into(),
        get("additionalAddressLine2").into(),
        format!("{} {}", get("postalCode"), get("city"))
            .trim()
            .into(),
        get("countryStateId").into(),
        get("country").into(),
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join(", ")
}
pub(crate) fn validate(data: &Value, settings: &commerce::Settings, partial: bool) -> Result<()> {
    let object = data.as_object().ok_or(bad("Master data object required"))?;
    for (key, v) in object {
        if !FIELDS.contains(&key.as_str()) {
            return Err(bad("Unknown company field"));
        }
        if v.is_null() && partial {
            continue;
        }
        if LOCALIZED.contains(&key.as_str()) {
            let texts = v
                .as_object()
                .filter(|v| v.len() <= 100)
                .ok_or(bad("Localized company text required"))?;
            for (locale, text) in texts {
                if !commerce::company_locale_allowed(locale, settings)
                    || !text.is_null()
                        && text.as_str().is_none_or(|s| {
                            s.len() > if key == "brandName" { 500 } else { 8000 }
                                || s.contains('\0')
                        })
                {
                    return Err(bad("Invalid localized company text"));
                }
            }
        } else if v.as_str().is_none_or(|s| s.len() > 500 || s.contains('\0')) {
            return Err(bad("Invalid company field"));
        }
    }
    if partial {
        return Ok(());
    }
    if data["name"].as_str().is_none_or(|s| s.trim().is_empty()) || address(data).is_empty() {
        return Err(bad("Company name and address required"));
    }
    if data["street"].as_str().is_some_and(|s| !s.is_empty())
        && ["city", "country"]
            .iter()
            .any(|k| data[k].as_str().is_none_or(|s| s.is_empty()))
    {
        return Err(bad("Structured address requires city and country"));
    }
    let country = data["country"].as_str().unwrap_or("");
    if !country.is_empty() {
        let row = commerce::company_countries(settings)
            .into_iter()
            .find(|c| c.code == country)
            .ok_or(bad("Unknown company country"))?;
        let state = data["countryStateId"].as_str().unwrap_or("");
        if !state.is_empty() && !row.states.iter().any(|s| s.code == state) {
            return Err(bad("Unknown company subdivision"));
        }
    } else if data["countryStateId"]
        .as_str()
        .is_some_and(|s| !s.is_empty())
    {
        return Err(bad("Subdivision requires country"));
    }
    for key in ["website", "professionalRulesUrl"] {
        if let Some(url) = data[key].as_str().filter(|s| !s.is_empty()) {
            let parsed = reqwest::Url::parse(url).map_err(|_| bad("Invalid company URL"))?;
            if !["https", "http"].contains(&parsed.scheme())
                || parsed.host_str().is_none()
                || !parsed.username().is_empty()
                || parsed.password().is_some()
            {
                return Err(bad("Invalid company URL"));
            }
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sparse_inheritance_preserves_empty_and_localized_null() {
        let b = json!({"name":"Base","phoneNumber":"111","brandName":{"es":"Marca","de":"Marke"},"street":"Road","houseNumber":"2","city":"Town","country":"DE"});
        let p =
            json!({"name":null,"phoneNumber":"","houseNumber":"9","brandName":{"de":null,"es":""}});
        let v = resolve(&b, &p);
        assert_eq!(v["name"], "Base");
        assert_eq!(v["phoneNumber"], "");
        assert_eq!(v["brandName"]["de"], "Marke");
        assert_eq!(v["brandName"]["es"], "");
        assert_eq!(v["address"], "Road 9, Town, DE");
    }
    #[test]
    fn legacy_address_is_not_guessed() {
        assert_eq!(
            address(&json!({"address":"Unparsed 4, Anywhere"})),
            "Unparsed 4, Anywhere"
        );
    }
}
