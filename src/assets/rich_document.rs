//! Allow-listed editor JSON with bounded depth and content; HTML/handlers/styles cannot enter the renderer.
use super::*;
pub(crate) fn safe_url(url: &str) -> bool {
    if url.len() > 2000 || url.contains(['\\', '\n', '\r']) {
        return false;
    }
    url.starts_with("/store-api/assets/")
        || reqwest::Url::parse(url).is_ok_and(|u| {
            u.scheme() == "https" && u.username().is_empty() && u.password().is_none()
        })
}
pub(super) fn validate(node: &Value, depth: usize, count: &mut usize) -> Result<()> {
    *count += 1;
    if depth > 10
        || *count > 400
        || !node.is_object()
        || node
            .as_object()
            .unwrap()
            .keys()
            .any(|k| !["type", "text", "attrs", "content", "marks"].contains(&k.as_str()))
    {
        return Err(bad("Invalid rich document structure"));
    }
    let typ = node["type"]
        .as_str()
        .ok_or(bad("Document node type required"))?;
    if ![
        "doc",
        "paragraph",
        "text",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "blockquote",
        "hardBreak",
        "horizontalRule",
        "image",
        "video",
        "codeBlock",
    ]
    .contains(&typ)
    {
        return Err(bad("Unsupported document node"));
    }
    if typ == "text" && node["text"].as_str().is_none_or(|s| s.len() > 4000) {
        return Err(bad("Invalid document text"));
    }
    if let Some(attrs) = node.get("attrs") {
        let attrs = attrs
            .as_object()
            .ok_or(bad("Invalid document attributes"))?;
        if attrs.keys().any(|k| {
            ![
                "level", "start", "src", "alt", "title", "width", "height", "language",
            ]
            .contains(&k.as_str())
        }) {
            return Err(bad("Unsupported document attributes"));
        }
        if typ == "heading"
            && !node["attrs"]["level"]
                .as_u64()
                .is_some_and(|n| (2..=3).contains(&n))
        {
            return Err(bad("Invalid heading level"));
        }
        if attrs
            .values()
            .any(|v| v.as_str().is_some_and(|s| s.len() > 2000))
        {
            return Err(bad("Document attribute too long"));
        }
    }
    if ["image", "video"].contains(&typ) && !node["attrs"]["src"].as_str().is_some_and(safe_url) {
        return Err(bad("Unsafe document media URL"));
    }
    if let Some(marks) = node.get("marks") {
        for mark in marks
            .as_array()
            .filter(|a| a.len() <= 8)
            .ok_or(bad("Invalid document marks"))?
        {
            let typ = mark["type"].as_str().unwrap_or("");
            if !["bold", "italic", "underline", "strike", "code", "link"].contains(&typ)
                || mark
                    .as_object()
                    .is_none_or(|o| o.keys().any(|k| !["type", "attrs"].contains(&k.as_str())))
            {
                return Err(bad("Unsupported document mark"));
            }
            if let Some(attrs) = mark.get("attrs")
                && attrs.as_object().is_none_or(|o| {
                    o.keys()
                        .any(|k| !["href", "target", "rel", "class"].contains(&k.as_str()))
                })
            {
                return Err(bad("Invalid link attributes"));
            }
            if typ == "link" && !mark["attrs"]["href"].as_str().is_some_and(safe_url) {
                return Err(bad("Unsafe document link"));
            }
        }
    }
    if let Some(content) = node.get("content") {
        for child in content
            .as_array()
            .ok_or(bad("Document children required"))?
        {
            validate(child, depth + 1, count)?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_formatting_and_rejects_scripts() {
        let v = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello","marks":[{"type":"bold"}]}]}]});
        assert!(validate(&v, 0, &mut 0).is_ok());
        for v in [
            json!({"type":"script"}),
            json!({"type":"image","attrs":{"src":"javascript:alert(1)"}}),
            json!({"type":"paragraph","attrs":{"onclick":"bad"}}),
        ] {
            assert!(validate(&v, 0, &mut 0).is_err());
        }
    }
}
