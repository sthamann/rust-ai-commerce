//! Explicit product safety/sector facts, with market-language fallback; no inference of certifications.
use super::*;
pub(crate) const FIELDS: &[&str] = &[
    "manufacturer",
    "manufacturerAddress",
    "manufacturerContact",
    "responsiblePerson",
    "responsibleAddress",
    "responsibleContact",
    "identifier",
    "warnings",
    "fibres",
    "ingredients",
    "allergens",
    "nutrition",
    "netQuantity",
    "foodOperator",
    "origin",
    "instructions",
    "energyLabelUrl",
    "energySheetUrl",
    "registration",
    "ageVerification",
    "compatibility",
];
pub(crate) fn validate_product(v: &Value, s: &commerce::Settings) -> Result<()> {
    if v.is_null() {
        return Ok(());
    }
    let object = v
        .as_object()
        .ok_or(bad("Product compliance object required"))?;
    for (key, value) in object {
        if key == "sector" {
            if value.as_str().is_none_or(|v| !model::SECTORS.contains(&v)) {
                return Err(bad("Unknown compliance sector"));
            }
            continue;
        }
        if key == "nonEuManufacturer" {
            if !value.is_boolean() {
                return Err(bad("Manufacturer origin flag required"));
            }
            continue;
        }
        if !FIELDS.contains(&key.as_str()) {
            return Err(bad("Unknown product compliance field"));
        }
        let texts = value
            .as_object()
            .ok_or(bad("Localized compliance information required"))?;
        if texts.len() > 100
            || texts.iter().any(|(l, v)| {
                !commerce::company_locale_allowed(l, s)
                    || !v.is_null()
                        && v.as_str()
                            .is_none_or(|t| t.len() > 6000 || t.contains('\0'))
            })
        {
            return Err(bad("Invalid product compliance text"));
        }
    }
    Ok(())
}
pub(crate) fn product_gaps(
    extra: &Value,
    config: &Config,
    locale: &str,
    main: &str,
) -> Vec<String> {
    let v = &extra["compliance"];
    let sector = v["sector"].as_str().unwrap_or(if extra["digital"] == true {
        "digital"
    } else {
        "general"
    });
    let mut required = vec![];
    if sector != "digital" && sector != "food" {
        required.extend([
            "manufacturer",
            "manufacturerAddress",
            "manufacturerContact",
            "identifier",
        ]);
    }
    if v["nonEuManufacturer"] == true {
        required.extend([
            "responsiblePerson",
            "responsibleAddress",
            "responsibleContact",
        ]);
    }
    match sector {
        "textiles" => required.push("fibres"),
        "food" => required.extend([
            "ingredients",
            "allergens",
            "nutrition",
            "netQuantity",
            "foodOperator",
        ]),
        "cosmetics" => required.extend(["ingredients", "instructions"]),
        "electronics" => required.push("instructions"),
        "digital" => required.push("compatibility"),
        "ageRestricted" => required.push("ageVerification"),
        _ => {}
    }
    // Sector inclusion activates checks for existing catalogs without a classified product.
    if config.sectors.contains(&"textiles".into()) && v["sector"].is_null() {
        required.push("fibres");
    }
    required
        .into_iter()
        .filter(|key| {
            commerce::translated_string(&v[*key], locale, main)
                .trim()
                .is_empty()
        })
        .map(String::from)
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outside_eu_requires_responsible_person_and_textile_composition() {
        let v = json!({"compliance":{"sector":"textiles","nonEuManufacturer":true,"fibres":{"en-GB":"100% cotton"}}});
        let gaps = product_gaps(&v, &Config::default(), "de-DE", "en-GB");
        assert!(gaps.contains(&"responsibleContact".into()));
        assert!(!gaps.contains(&"fibres".into()));
    }
}
