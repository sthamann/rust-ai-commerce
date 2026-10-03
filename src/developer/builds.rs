//! Immutable development versions are validated before storage; installation targets only private environments.
use super::*;
pub(super) fn validate(m: &apps::Manifest) -> Result<()> {
    apps::validate(m)?;
    if [
        "engraving",
        "paypal",
        "shopware_payments",
        "storyfront",
        "google_analytics",
        "gmail",
        "slack",
        "email",
    ]
    .contains(&m.id.as_str())
        || m.configuration.is_some()
        || m.slots
            .iter()
            .any(|s| !matches!(s.component.as_str(), "entity-list" | "entity-form"))
    {
        return Err(bad(
            "Reserved apps and Wasm configuration require a separate reviewed package; service code remains operator deployed",
        ));
    }
    for lang in ["en", "de", "fr", "es"] {
        if m.name
            .get(lang)
            .is_none_or(|s| s.trim().is_empty() || s.len() > 100)
            || m.slots
                .iter()
                .any(|s| s.label.get(lang).is_none_or(|v| v.trim().is_empty()))
        {
            return Err(bad("All four interface translations are required"));
        }
    }
    for e in &m.entities {
        for lang in ["en", "de", "fr", "es"] {
            if e.label.get(lang).is_none_or(|s| s.trim().is_empty())
                || e.fields
                    .iter()
                    .any(|f| f.label.get(lang).is_none_or(|s| s.trim().is_empty()))
            {
                return Err(bad("All entity and field labels need four translations"));
            }
        }
    }
    Ok(())
}
pub(super) async fn save(
    a: &App,
    t: &str,
    v: &Value,
    provider: &str,
    model: Option<&str>,
) -> Result<Value> {
    let stage = v["environment"]
        .as_str()
        .ok_or(bad("Private environment required"))?;
    staging::owned(a, t, stage).await?;
    let mut value = v["manifest"].clone();
    routes::actions(&mut value)?;
    let m: apps::Manifest = serde_json::from_value(value).map_err(|e| bad(e.to_string()))?;
    validate(&m)?;
    let prompt = v["prompt"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 8000)
        .ok_or(bad("Prompt required, maximum 8000 bytes"))?;
    if ["en", "de", "fr", "es"].iter().any(|l| {
        v["summary"][l]
            .as_str()
            .is_none_or(|s| s.trim().is_empty() || s.len() > 1000)
    }) {
        return Err(bad("Summary needs all four translations"));
    }
    let manifest = json!(m);
    let digest = hash(&manifest.to_string());
    let id = uid();
    let n=sqlx::query("INSERT INTO developer_builds(id,tenant,environment,app,version,digest,manifest,prompt,provider,model,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(tenant,app,version) DO NOTHING").bind(&id).bind(t).bind(stage).bind(&m.id).bind(&m.version).bind(&digest).bind(&manifest).bind(prompt).bind(provider).bind(model).bind(&v["summary"]).execute(&a.db).await?.rows_affected();
    if n != 1 {
        return Err(conflict(
            "Development version already exists; use a new version",
        ));
    }
    Ok(
        json!({"id":id,"app":m.id,"version":m.version,"digest":digest,"manifest":manifest,"summary":v["summary"],"state":"draft","environment":stage}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn developer_rejects_reserved_apps() {
        let m: apps::Manifest = serde_json::from_str(include_str!(
            "../../extensions/apps/storyfront/manifest.json"
        ))
        .unwrap();
        assert!(validate(&m).is_err());
    }
}
