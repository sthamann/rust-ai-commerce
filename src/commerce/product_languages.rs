//! Enabled content languages, NULL field inheritance and stable global language registration.
use super::product_edit::Translation;
use super::*;
pub(crate) fn valid_locale_key(v: &str) -> bool {
    let parts = v.split('-').collect::<Vec<_>>();
    (2..=3).contains(&parts[0].len())
        && parts[0].bytes().all(|c| c.is_ascii_lowercase())
        && parts.len() <= 3
        && parts
            .iter()
            .skip(1)
            .all(|p| (2..=8).contains(&p.len()) && p.bytes().all(|c| c.is_ascii_alphanumeric()))
}
pub(super) fn key(locale: &str, s: &Settings) -> String {
    let base = locale.split('-').next().unwrap();
    if s.locales
        .iter()
        .filter(|l| l.split('-').next() == Some(base))
        .count()
        == 1
    {
        base.into()
    } else {
        locale.into()
    }
}
pub(super) fn locale<'a>(key: &str, s: &'a Settings) -> Option<&'a str> {
    s.locales
        .iter()
        .find(|v| *v == key || self::key(v, s) == key)
        .map(String::as_str)
}
pub(super) fn allowed(key: &str, s: &Settings) -> bool {
    locale(key, s).is_some()
}
pub(super) fn validate(map: &HashMap<String, Translation>, s: &Settings) -> Result<()> {
    if map.len() > 100 || map.is_empty() {
        return Err(bad("Product translations exceed limits"));
    }
    for (lang, tr) in map {
        if !allowed(lang, s)
            || tr
                .name
                .as_ref()
                .is_some_and(|v| v.is_empty() || v.len() > 200)
            || tr.description.as_ref().is_some_and(|v| v.len() > 4000)
        {
            return Err(bad("Invalid translated product text"));
        }
    }
    Ok(())
}
pub(super) async fn register(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    s: &Settings,
) -> Result<()> {
    for locale in &s.locales {
        let id = hash(&format!("commerce-language:{locale}"))[..32].to_string();
        sqlx::query(
            "INSERT INTO languages(id,locale) VALUES($1,$2) ON CONFLICT(locale) DO NOTHING",
        )
        .bind(id)
        .bind(locale)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}
