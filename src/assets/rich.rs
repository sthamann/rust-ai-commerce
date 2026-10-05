//! Safe structured rich content, never executable HTML. Same schema for merchant API and frontend.
use super::*;
pub(crate) fn validate_rich(value: &Value) -> Result<()> {
    let Some(languages) = value.as_object() else {
        return Err(bad("Rich descriptions require a language map"));
    };
    if languages.len() > 100 {
        return Err(bad("Too many rich description languages"));
    }
    for (lang, blocks) in languages {
        if !commerce::valid_locale_key(lang) {
            return Err(bad("Unsupported rich description locale"));
        }
        let blocks = blocks
            .as_array()
            .filter(|v| v.len() <= 40)
            .ok_or(bad("Maximum 40 rich description blocks"))?;
        for b in blocks {
            let typ = b["type"].as_str().ok_or(bad("Rich block type required"))?;
            if typ == "document" {
                if b["doc"]["type"] != "doc" {
                    return Err(bad("Root document required"));
                }
                rich_document::validate(&b["doc"], 0, &mut 0)?;
                continue;
            }
            if !["paragraph", "heading", "list", "image", "video"].contains(&typ)
                || b["text"].as_str().is_some_and(|s| s.len() > 4000)
            {
                return Err(bad("Invalid rich block"));
            }
            if ["image", "video"].contains(&typ) {
                let url = b["url"].as_str().ok_or(bad("Media URL required"))?;
                if url.len() > 2000 {
                    return Err(bad("Media URL too long"));
                }
                let parsed = reqwest::Url::parse(url)
                    .map_err(|_| bad("Absolute HTTPS media URL required"))?;
                if parsed.scheme() != "https"
                    || !parsed.username().is_empty()
                    || parsed.password().is_some()
                {
                    return Err(bad("HTTPS media required"));
                }
            } else if b["text"].as_str().is_none() {
                return Err(bad("Rich block text required"));
            }
        }
    }
    if value.to_string().len() > 512000 {
        return Err(bad("Rich content too large"));
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn executable_content_rejected() {
        assert!(
            validate_rich(&json!({"en":[{"type":"image","url":"javascript:alert(1)"}]})).is_err()
        );
        assert!(validate_rich(&json!({"de":[{"type":"paragraph","text":"**Hallo**"}]})).is_ok());
    }
}
