//! Validate enabled-language source content and rebuild hash-bound chunks without inherited fabricated translations.
use super::*;
pub(super) async fn validate(a: &App, t: &str, v: &Value) -> Result<Value> {
    if v.as_object().is_none_or(|o| {
        o.keys().any(|k| {
            ![
                "title",
                "content",
                "productId",
                "kind",
                "locale",
                "translations",
                "revision",
            ]
            .contains(&k.as_str())
        })
    }) {
        return Err(bad("Unsupported source field"));
    }
    let (settings, _) = commerce::config(a, t).await?;
    let locale = v["locale"].as_str().unwrap_or(&settings.main_locale);
    if !settings.locales.iter().any(|l| l == locale) {
        return Err(bad("Source language must be enabled"));
    }
    let title = v["title"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 200)
        .ok_or(bad("Title required, maximum 200 bytes"))?;
    let text = v["content"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 100_000)
        .ok_or(bad("Document text must be 1..100000 UTF-8 bytes"))?;
    let kind = v["kind"].as_str().unwrap_or("document");
    if ![
        "document",
        "datasheet",
        "manual",
        "care",
        "faq",
        "shipping",
        "returns",
        "warranty",
        "brand",
    ]
    .contains(&kind)
    {
        return Err(bad("Unknown knowledge kind"));
    }
    let translations = v.get("translations").cloned().unwrap_or(json!({}));
    let map = translations
        .as_object()
        .ok_or(bad("Translations must be an object"))?;
    for (l, fields) in map {
        if l == locale || !settings.locales.contains(l) {
            return Err(bad(
                "Translation language must be enabled and different from source",
            ));
        }
        let fields = fields.as_object().ok_or(bad("Invalid translation"))?;
        for (key, value) in fields {
            let limit = match key.as_str() {
                "title" => 200,
                "content" => 100_000,
                _ => return Err(bad("Unknown translated field")),
            };
            if !value.is_null()
                && value
                    .as_str()
                    .is_none_or(|s| s.len() > limit || (key == "title" && s.trim().is_empty()))
            {
                return Err(bad("Invalid translated source value"));
            }
        }
    }
    if translations.to_string().len() + text.len() > 200_000 {
        return Err(bad("Combined source content exceeds 200000 bytes"));
    }
    if !v["productId"].is_null() && v["productId"].as_str().is_none() {
        return Err(bad("Invalid product reference"));
    }
    let digest = if map.is_empty() {
        hash(text)
    } else {
        hash(&format!("{locale}:{text}:{translations}"))
    };
    Ok(
        json!({"title":title,"content":text,"productId":v["productId"].as_str().filter(|s|!s.is_empty()),"kind":kind,"locale":locale,"translations":translations,"digest":digest}),
    )
}
pub(super) async fn chunks(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    t: &str,
    id: &str,
    v: &Value,
) -> Result<usize> {
    sqlx::query("DELETE FROM knowledge_chunks WHERE tenant=$1 AND document_id=$2")
        .bind(t)
        .bind(id)
        .execute(&mut **tx)
        .await?;
    let mut sources = vec![(
        v["locale"].as_str().unwrap(),
        v["content"].as_str().unwrap(),
    )];
    for (locale, fields) in v["translations"].as_object().unwrap() {
        if let Some(text) = fields["content"].as_str() {
            sources.push((locale, text));
        }
    }
    let mut position = 0;
    for (locale, text) in sources {
        for chunk in text.chars().collect::<Vec<_>>().chunks(1200) {
            sqlx::query("INSERT INTO knowledge_chunks(tenant,document_id,position,text,locale) VALUES($1,$2,$3,$4,$5)").bind(t).bind(id).bind(position as i32).bind(chunk.iter().collect::<String>()).bind(locale).execute(&mut **tx).await?;
            position += 1;
        }
    }
    Ok(position)
}
