//! Translate only human-readable text; preserve identifiers, URLs, rich structure and source specification keys.
use super::*;
pub(super) fn source(row: &sqlx::postgres::PgRow, locale: &str, main: &str) -> Value {
    let extra: Value = row.get("extra");
    let pick = |field: &str| {
        extra[field]
            .get(locale)
            .or_else(|| extra[field].get(main))
            .cloned()
            .unwrap_or(Value::Null)
    };
    json!({"name":row.get::<Option<String>,_>("translated_name").unwrap_or_else(|| row.get("name")),
        "description":row.get::<Option<String>,_>("translated_description").unwrap_or_else(|| row.get("description")),
        "seo":pick("seo"),"specifications":pick("specifications"),"richDescription":pick("richDescription")})
}
pub(super) fn texts(value: &Value) -> Vec<(String, String)> {
    fn visit(v: &Value, path: &str, out: &mut Vec<(String, String)>) {
        match v {
            Value::Object(m) => {
                for (k, v) in m {
                    let pointer = format!("{path}/{}", k.replace('~', "~0").replace('/', "~1"));
                    if v.is_string()
                        && (matches!(
                            k.as_str(),
                            "name" | "description" | "title" | "text" | "alt"
                        ) || path == "/specifications")
                    {
                        if !v.as_str().unwrap().is_empty() {
                            out.push((pointer, v.as_str().unwrap().into()));
                        }
                    } else {
                        visit(v, &pointer, out);
                    }
                }
            }
            Value::Array(a) => {
                for (i, v) in a.iter().enumerate() {
                    visit(v, &format!("{path}/{i}"), out);
                }
            }
            _ => {}
        }
    }
    let mut out = Vec::new();
    visit(value, "", &mut out);
    out
}
pub(super) fn translated(source: &Value, response: &Value) -> Result<Value> {
    let original = texts(source);
    let entries = response["translations"]
        .as_array()
        .ok_or(bad("Translation response missing"))?;
    if entries.len() != original.len() {
        return Err(bad("Incomplete translation response"));
    }
    let mut seen = std::collections::HashSet::new();
    let mut result = source.clone();
    for entry in entries {
        let path = entry["path"]
            .as_str()
            .ok_or(bad("Translation path missing"))?;
        let text = entry["text"]
            .as_str()
            .ok_or(bad("Translation text missing"))?;
        if !seen.insert(path)
            || !original.iter().any(|(p, _)| p == path)
            || text.trim().is_empty()
            || text.len() > 4000
        {
            return Err(bad("Invalid translated field"));
        }
        *result
            .pointer_mut(path)
            .ok_or(bad("Unknown translation field"))? = json!(text);
    }
    if result["name"]
        .as_str()
        .is_none_or(|n| n.is_empty() || n.len() > 200)
        || result["seo"]["title"]
            .as_str()
            .is_some_and(|s| s.len() > 200)
        || result["seo"]["description"]
            .as_str()
            .is_some_and(|s| s.len() > 500)
        || result["specifications"].as_object().is_some_and(|m| {
            m.values()
                .any(|v| v.as_str().is_some_and(|s| s.len() > 1000))
        })
    {
        return Err(bad("Translated metadata exceeds product limits"));
    }
    if !result["richDescription"].is_null() {
        assets::validate_rich(&json!({"en":result["richDescription"]}))?;
    }
    Ok(result)
}
pub(super) fn key(locale: &str, locales: &[String]) -> String {
    let base = locale.split('-').next().unwrap();
    if locales
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
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserve_links_and_refuse_model_structure_changes() {
        let s = json!({"name":"Desk","description":"Wood","richDescription":[{"type":"image","url":"https://example.com/a.png","alt":"Desk"},{"type":"document","doc":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello","marks":[{"type":"link","attrs":{"href":"https://example.com"}}]}]}]}}]});
        let entries = texts(&s)
            .iter()
            .map(|(p, t)| json!({"path":p,"text":format!("ES {t}")}))
            .collect::<Vec<_>>();
        let r = translated(&s, &json!({"translations":entries})).unwrap();
        assert_eq!(
            r["richDescription"][0]["url"],
            s["richDescription"][0]["url"]
        );
        assert!(translated(&s, &json!({"translations":[{"path":"/price","text":"0"}]})).is_err());
        assert!(translated(&s, &json!({"translations":[]})).is_err());
    }
}
