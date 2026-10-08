//! Operator-owned editor navigation for hosted frontends; no private editor or identity implementation.
use crate::*;
/// Navigation only: the external editor still authenticates ownership. A mount is not publication evidence.
pub(crate) fn url(alias: &str, template: Option<&str>) -> Option<String> {
    validate_tenant(alias).ok()?;
    let template = template?;
    if template.matches("{alias}").count() != 1 {
        return None;
    }
    let url = reqwest::Url::parse(&template.replace("{alias}", alias)).ok()?;
    let origin = url.origin().ascii_serialization();
    if !super::frontends::valid_origin(&origin)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !template.split_once("://")?.1.contains("/{alias}")
    {
        return None;
    }
    Some(url.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editor_navigation_is_operator_owned_and_does_not_leak_secrets() {
        assert_eq!(
            url(
                "world-test",
                Some("https://experience.example.test/design/{alias}")
            ),
            Some("https://experience.example.test/design/world-test".into())
        );
        assert_eq!(
            url("world-test", Some("http://127.0.0.1:4420/design/{alias}")),
            Some("http://127.0.0.1:4420/design/world-test".into())
        );
        assert!(url("world-test", None).is_none());
        assert!(url("../foreign", Some("https://example.test/design/{alias}")).is_none());
        for template in [
            "javascript:alert('{alias}')",
            "https://key@example.test/design/{alias}",
            "http://169.254.169.254/design/{alias}",
            "https://{alias}.example.test/",
            "https://example.test/design/{alias}?token=secret",
            "https://example.test/design/{alias}#token",
            "https://example.test/design/fixed",
            "https://example.test/{alias}/{alias}",
        ] {
            assert!(url("world-test", Some(template)).is_none(), "{template}");
        }
    }
}
