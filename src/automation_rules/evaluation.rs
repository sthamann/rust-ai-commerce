//! Evaluate native rule scopes from authoritative JSON facts with precise line/container selection.
use super::*;
pub fn evaluate(name: &str, config: &Value, facts: &Value) -> Result<bool, String> {
    validate(name, config, 0)?;
    if matches!(
        name,
        "cartLineItemCustomField"
            | "customerCustomField"
            | "orderCustomField"
            | "cartLineItemPurchasePrice"
            | "cartTotalPurchasePrice"
    ) {
        return super::fields::evaluate(name, config, facts);
    }
    if matches!(name, "cartGoodsCount" | "cartGoodsPrice") {
        return containers::evaluate_special(name, config, facts);
    }
    let row = definition(name).ok_or("Unknown rule")?;
    if let Some(spec) = row.get("native").filter(|s| !s.is_null()) {
        let path = spec["path"].as_str().unwrap();
        if let Some(guest) = spec["withoutCustomer"].as_str()
            && facts["customer"]["loggedIn"] == false
        {
            return Ok(guest == "negative"
                && matches!(config["operator"].as_str(), Some("!=") | Some("empty")));
        }
        let field = spec["field"].as_str().unwrap();
        let kind = spec["kind"].as_str().unwrap();
        if let Some(path) = path.strip_prefix("line.") {
            if let Some(line) = facts.get("line") {
                return comparison::compare(
                    fact(line, path)?,
                    &config[field],
                    config["operator"].as_str().unwrap_or("="),
                    kind,
                );
            }
            let items = facts["lines"].as_array().ok_or("Missing line item scope")?;
            let matches = items
                .iter()
                .map(|line| {
                    comparison::compare(
                        fact(line, path)?,
                        &config[field],
                        config["operator"].as_str().unwrap_or("="),
                        kind,
                    )
                })
                .collect::<Result<Vec<_>, _>>()?;
            return Ok(matches.contains(&true));
        }
        return comparison::compare(
            fact(facts, path)?,
            &config[field],
            config["operator"].as_str().unwrap_or("="),
            kind,
        );
    }
    if matches!(name, "dateRange" | "timeRange" | "dayOfWeek") {
        return super::time::evaluate(name, config, facts);
    }
    if name == "alwaysValid" {
        return Ok(true);
    }
    if !matches!(
        name,
        "andContainer" | "orContainer" | "xorContainer" | "notContainer"
    ) {
        return containers::evaluate_special(name, config, facts);
    }
    let children = config["children"]
        .as_array()
        .ok_or("Container children required")?;
    if matches!(
        name,
        "andContainer" | "orContainer" | "xorContainer" | "notContainer"
    ) {
        let result = children
            .iter()
            .map(|c| {
                evaluate(
                    c["type"].as_str().ok_or("Child type required")?,
                    &c["config"],
                    facts,
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        return match name {
            "andContainer" => Ok(result.iter().all(|x| *x)),
            "orContainer" => Ok(result.contains(&true)),
            "xorContainer" => Ok(crate::verified_kernel::rule_xor_count(
                result.iter().filter(|x| **x).count() as u64,
            )),
            "notContainer" if result.len() == 1 => Ok(!result[0]),
            _ => Err("NOT requires one child".into()),
        };
    }
    Err(format!("Unimplemented evaluator: {name}"))
}
