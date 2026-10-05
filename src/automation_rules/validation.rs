//! Bounded source payload validation against exported field/operator metadata and nested condition scopes.
use super::*;
pub fn validate(name: &str, config: &Value, depth: usize) -> Result<(), String> {
    if depth > 8 || config.to_string().len() > 16000 {
        return Err("Rule bounds exceeded".into());
    }
    let row = definition(name).ok_or_else(|| format!("Unknown Shopware rule: {name}"))?;
    if row["supported"] != true {
        return Err(format!("Shopware rule needs a missing runtime: {name}"));
    }
    let object = config.as_object().ok_or("Rule config object required")?;
    if let Some(children) = config.get("children") {
        let children = children
            .as_array()
            .filter(|c| c.len() <= 20)
            .ok_or("Maximum 20 rule children")?;
        for c in children {
            validate(
                c["type"].as_str().ok_or("Child type required")?,
                &c["config"],
                depth + 1,
            )?;
        }
    }
    for key in ["container", "filter"] {
        if let Some(child) = config.get(key).filter(|v| !v.is_null()) {
            validate(
                child["type"].as_str().ok_or("Nested type required")?,
                &child["config"],
                depth + 1,
            )?;
        }
    }
    if matches!(
        name,
        "andContainer" | "orContainer" | "xorContainer" | "notContainer" | "allLineItemsContainer"
    ) && !config["children"].is_array()
    {
        return Err("Container children required".into());
    }
    if name == "allLineItemsContainer" {
        if config
            .get("minimumShouldMatch")
            .is_some_and(|v| !v.is_u64() || v.as_u64().unwrap() > 10000)
        {
            return Err("Invalid minimum line matches".into());
        }
        if config.get("types").is_some_and(|v| {
            v.as_array().is_none_or(|a| {
                a.len() > 20
                    || a.iter()
                        .any(|v| v.as_str().is_none_or(|s| s.is_empty() || s.len() > 100))
            })
        }) {
            return Err("Invalid line item types".into());
        }
    }
    if name == "notContainer" && config["children"].as_array().is_none_or(|v| v.len() != 1) {
        return Err("NOT requires exactly one child".into());
    }
    if name == "cartLineItemWrapper" && !config["container"].is_object() {
        return Err("Wrapper container required".into());
    }
    if name == "cartLineItemWithQuantity"
        && (!config["id"].is_string() || !config["quantity"].is_u64())
    {
        return Err("Product and integer quantity required".into());
    }
    if name == "cartLineItem" && !config["identifiers"].is_array() {
        return Err("Product identifiers required".into());
    }
    if name == "cartLineItemGoodsTotal" && !config["count"].is_u64() {
        return Err("Goods count required".into());
    }
    if matches!(name, "dateRange" | "timeRange" | "dayOfWeek") {
        return super::time::validate(name, config);
    }
    if name == "alwaysValid" {
        return Ok(());
    }
    if matches!(
        name,
        "cartLineItemCustomField"
            | "customerCustomField"
            | "orderCustomField"
            | "cartLineItemPurchasePrice"
            | "cartTotalPurchasePrice"
    ) {
        return super::fields::validate(name, config);
    }
    if let Some(spec) = row.get("native").filter(|s| !s.is_null()) {
        let kind = spec["kind"].as_str().unwrap();
        let field = spec["field"].as_str().unwrap();
        let op = config["operator"].as_str().unwrap_or("=");
        let valid_ops = row["config"]["operatorSet"]["operators"].as_array();
        if kind != "bool" && !valid_ops.map_or(op == "=", |a| a.iter().any(|v| v == op)) {
            return Err("Invalid original rule operator".into());
        }
        let value = &config[field];
        if op != "empty"
            && match kind {
                "number" => !value.is_number(),
                "bool" => !value.is_boolean(),
                "set" | "zip" | "string_array" | "string_array_lower" => {
                    !value.is_array() && !value.is_string()
                }
                "date" | "datetime" => !(value.is_string() || op == "between" && value.is_object()),
                _ => !value.is_string(),
            }
        {
            return Err(format!("Invalid rule field: {field}"));
        }
        if let Some(a) = value.as_array()
            && (a.len() > 100
                || a.iter()
                    .any(|v| v.as_str().is_none_or(|s| s.is_empty() || s.len() > 254)))
        {
            return Err("Invalid rule selections".into());
        }
        for key in object.keys() {
            if key != field
                && key != "operator"
                && !(key == "filter" && matches!(name, "cartGoodsCount" | "cartGoodsPrice"))
            {
                return Err(format!("Unknown original rule field: {key}"));
            }
        }
    }
    Ok(())
}
