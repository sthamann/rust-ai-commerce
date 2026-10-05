//! Bundled MIT country catalogue, tenant-owned overrides and typed region admission.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Country {
    pub code: String,
    pub alpha3: String,
    pub numeric: String,
    #[serde(default)]
    pub iso_assigned: bool,
    pub continent: String,
    pub name: HashMap<String, String>,
    #[serde(default)]
    pub states: Vec<Subdivision>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Subdivision {
    pub code: String,
    pub name: HashMap<String, String>,
}
pub(crate) fn catalogue(s: &Settings) -> Vec<Country> {
    static WORLD: std::sync::OnceLock<Vec<Country>> = std::sync::OnceLock::new();
    let mut rows = WORLD
        .get_or_init(|| {
            serde_json::from_str(include_str!("../../fixtures/geography.json"))
                .expect("bundled geography")
        })
        .clone();
    for item in &s.country_definitions {
        if let Some(old) = rows.iter_mut().find(|c| c.code == item.code) {
            *old = item.clone();
        } else {
            rows.push(item.clone());
        }
    }
    rows.sort_by(|a, b| a.code.cmp(&b.code));
    rows
}
pub(crate) async fn country_catalogue(State(a): State<App>, h: HeaderMap) -> Result<Json<Value>> {
    let (s, revision) = config(&a, &tenant(&h)?).await?;
    Ok(Json(
        json!({"countries":catalogue(&s),"enabled":s.countries,"mainLocale":s.main_locale,"locales":s.locales,"revision":revision}),
    ))
}
pub(crate) fn validate_geography(s: &Settings) -> Result<()> {
    let rows = catalogue(s);
    let mut seen = std::collections::HashSet::new();
    if s.country_definitions.len() > 300 {
        return Err(bad("Too many country definitions"));
    }
    let builtins: Vec<Country> =
        serde_json::from_str(include_str!("../../fixtures/geography.json")).expect("geography");
    for c in &s.country_definitions {
        if c.iso_assigned
            && !builtins.iter().any(|b| {
                b.iso_assigned && b.code == c.code && b.alpha3 == c.alpha3 && b.numeric == c.numeric
            })
        {
            return Err(bad("Custom countries cannot claim ISO assignment"));
        }
        if !seen.insert(&c.code)
            || c.code.len() != 2
            || !c.code.bytes().all(|x| x.is_ascii_uppercase())
            || (!c.alpha3.is_empty() && c.alpha3.len() != 3)
            || !c.alpha3.bytes().all(|x| x.is_ascii_uppercase())
            || (!c.numeric.is_empty() && c.numeric.len() != 3)
            || !c.numeric.bytes().all(|x| x.is_ascii_digit())
            || !["AF", "AN", "AS", "EU", "NA", "OC", "SA"].contains(&c.continent.as_str())
            || c.name.is_empty()
            || c.name.values().any(|n| n.is_empty() || n.len() > 160)
            || c.states.len() > 500
        {
            return Err(bad("Invalid country definition"));
        }
        let mut states = std::collections::HashSet::new();
        if c.states.iter().any(|st| {
            !states.insert(&st.code)
                || !st.code.starts_with(&format!("{}-", c.code))
                || st.code.len() > 12
                || st.name.is_empty()
                || st.name.values().any(|n| n.is_empty() || n.len() > 160)
        }) {
            return Err(bad("Invalid country subdivision"));
        }
    }
    if s.countries
        .iter()
        .any(|c| !rows.iter().any(|r| r.code == *c))
    {
        return Err(bad("Country missing from catalogue"));
    }
    Ok(())
}

/// All address entry points share tenant-defined country/subdivision validation.
pub(crate) fn validate_address_geography(address: &Address, settings: &Settings) -> Result<()> {
    let country = catalogue(settings)
        .into_iter()
        .find(|c| c.code == address.country)
        .ok_or(bad("Address country unavailable"))?;
    if !country.states.is_empty() && address.country_state_id.is_empty() {
        return Err(bad("Address region required"));
    }
    if !address.country_state_id.is_empty()
        && !country
            .states
            .iter()
            .any(|s| s.code == address.country_state_id)
    {
        return Err(bad("Address region is unavailable for this country"));
    }
    Ok(())
}
