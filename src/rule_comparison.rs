//! Behavioral port of Shopware 6.7.14.2 RuleComparison::numeric and FloatComparator's exact epsilon boundaries.
pub fn numeric(item: Option<f64>, rule: Option<f64>, operator: &str) -> Result<bool, String> {
    let negative = operator == "empty" || operator == "!=";
    let Some(a) = item else { return Ok(negative) };
    if operator == "empty" {
        return Ok(false);
    }
    let Some(b) = rule else { return Ok(negative) };
    let epsilon = 0.00000001;
    Ok(match operator {
        "=" => (a - b).abs() < epsilon,
        "!=" => (a - b).abs() >= epsilon,
        ">" => b - a < -epsilon,
        ">=" => b - a < epsilon,
        "<" => a - b < -epsilon,
        "<=" => a - b < epsilon,
        _ => return Err("unsupported".into()),
    })
}
/// Original RuleComparison::string: ASCII-insensitive equality and PHP's ASCII trim set.
pub fn string(item: Option<&str>, rule: &str, operator: &str) -> Result<bool, String> {
    let item = item.unwrap_or("");
    boolean(
        item.eq_ignore_ascii_case(rule),
        item.trim_matches([' ', '\t', '\n', '\r', '\0', '\u{000b}'])
            .is_empty(),
        operator,
    )
}
/// Original stringArray lowers the item only; configured rule values are preserved.
pub fn string_array(item: Option<&str>, rules: &[String], operator: &str) -> Result<bool, String> {
    let Some(item) = item else { return Ok(false) };
    let found = rules.contains(&item.to_lowercase());
    if !["=", "!="].contains(&operator) {
        return Err("unsupported".into());
    }
    boolean(found, false, operator)
}
/// Original UUID set semantics: intersection, disjointness and empty actual list.
pub fn uuids(
    item: Option<&[Option<String>]>,
    rule: Option<&[Option<String>]>,
    operator: &str,
) -> Result<bool, String> {
    let item = item.unwrap_or(&[]);
    let rule = rule.unwrap_or(&[]);
    let found = item.iter().any(|a| {
        rule.iter()
            .any(|b| a.as_deref().unwrap_or("") == b.as_deref().unwrap_or(""))
    });
    boolean(found, item.is_empty(), operator)
}

fn boolean(equal: bool, empty: bool, op: &str) -> Result<bool, String> {
    if !["=", "!=", "empty"].contains(&op) {
        return Err("unsupported".into());
    }
    Ok(crate::verified_kernel::rule_boolean_comparison(
        equal,
        empty,
        op == "=",
        op == "!=",
        op == "empty",
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_epsilon_and_null_semantics() {
        assert_eq!(numeric(Some(0.), Some(1e-8), "<"), Ok(false));
        assert_eq!(numeric(None, Some(1.), "empty"), Ok(true));
        assert_eq!(numeric(Some(1.), None, "empty"), Ok(false));
        assert_eq!(numeric(Some(1.), Some(1.), "="), Ok(true));
        assert!(numeric(Some(1.), Some(1.), "exec").is_err());
    }
}
