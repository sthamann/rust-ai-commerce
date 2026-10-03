//! Original comparison primitives plus literal wildcard/zip operators; no regex or executable expressions.
use super::*;
pub(super) fn compare(actual: &Value, rule: &Value, op: &str, kind: &str) -> Result<bool, String> {
    match kind {
        "number" => crate::rule_comparison::numeric(actual.as_f64(), rule.as_f64(), op),
        "date" | "datetime" => super::time::date(actual, rule, op, kind == "date"),
        "membership" => crate::rule_comparison::string_array(
            rule.as_str(),
            &actual
                .as_array()
                .ok_or("Array fact required")?
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>(),
            op,
        ),
        "string_array_lower" => crate::rule_comparison::string_array(
            actual.as_str(),
            &rule
                .as_array()
                .ok_or("Expected array required")?
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_ascii_lowercase()))
                .collect::<Vec<_>>(),
            op,
        ),
        "string_array" => crate::rule_comparison::string_array(
            actual.as_str(),
            &rule
                .as_array()
                .ok_or("Expected array required")?
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>(),
            op,
        ),
        "bool" => actual
            .as_bool()
            .zip(rule.as_bool())
            .map(|(a, b)| a == b)
            .ok_or("Boolean fact required".into()),
        "set" => {
            let strings = |v: &Value| {
                if let Some(a) = v.as_array() {
                    Some(
                        a.iter()
                            .map(|x| x.as_str().map(String::from))
                            .collect::<Vec<_>>(),
                    )
                } else {
                    v.as_str().map(|s| vec![Some(s.into())])
                }
            };
            crate::rule_comparison::uuids(strings(actual).as_deref(), strings(rule).as_deref(), op)
        }
        "wildcard" | "zip" => {
            if actual.is_null() {
                return Ok(matches!(op, "!=" | "empty"));
            }
            let a = actual.as_str().ok_or("String fact required")?;
            if op == "empty" {
                return Ok(a.is_empty());
            }
            if kind == "zip" && !matches!(op, "=" | "!=") {
                let b = rule
                    .as_array()
                    .and_then(|a| a.first())
                    .and_then(Value::as_str)
                    .and_then(|s| s.parse().ok());
                return crate::rule_comparison::numeric(a.trim().parse().ok(), b, op);
            }
            let matches = if let Some(values) = rule.as_array() {
                values
                    .iter()
                    .any(|v| v.as_str().is_some_and(|p| wildcard(a.trim(), p)))
            } else {
                rule.as_str().is_some_and(|p| wildcard(a, p))
            };
            match op {
                "=" => Ok(matches),
                "!=" => Ok(!matches),
                _ => Err("Unsupported wildcard operator".into()),
            }
        }
        _ => crate::rule_comparison::string(actual.as_str(), rule.as_str().unwrap_or(""), op),
    }
}
fn wildcard(value: &str, pattern: &str) -> bool {
    let (v, p) = (value.to_lowercase(), pattern.to_lowercase());
    let (v, p) = (v.as_bytes(), p.as_bytes());
    let (mut i, mut j, mut star, mut at) = (0, 0, None, 0);
    while i < v.len() {
        if j < p.len() && v[i] == p[j] {
            i += 1;
            j += 1;
        } else if j < p.len() && p[j] == b'*' {
            star = Some(j);
            j += 1;
            at = i;
        } else if let Some(s) = star {
            at += 1;
            i = at;
            j = s + 1;
        } else {
            return false;
        }
    }
    while j < p.len() && p[j] == b'*' {
        j += 1;
    }
    j == p.len()
}
