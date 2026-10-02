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
