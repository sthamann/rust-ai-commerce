//! Source line wrappers, quantified goods and all-line containers retain one selected line scope.
use super::*;
pub(super) fn evaluate_special(name: &str, config: &Value, facts: &Value) -> Result<bool, String> {
    let all = facts["lines"].as_array().ok_or("Missing line item scope")?;
    let lines = if let Some(line) = facts.get("line") {
        vec![line]
    } else {
        all.iter().collect()
    };
    let op = config["operator"].as_str().unwrap_or("=");
    match name {
        "cartLineItem" => {
            let ids = &config["identifiers"];
            for line in lines {
                let own = comparison::compare(&line["referencedId"], ids, op, "set")?;
                let parent = if line["parentId"].is_string() {
                    comparison::compare(&line["parentId"], ids, op, "set")?
                } else {
                    false
                };
                if own || parent {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        "cartLineItemWithQuantity" => {
            for line in lines {
                if (line["referencedId"] == config["id"] || line["parentId"] == config["id"])
                    && comparison::compare(&line["quantity"], &config["quantity"], op, "number")?
                {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        "cartLineItemGoodsTotal" | "cartGoodsCount" | "cartGoodsPrice" => {
            let mut quantity = 0.;
            for line in lines {
                if line["good"] != true {
                    continue;
                }
                if let Some(filter) = config.get("filter").filter(|v| !v.is_null()) {
                    let mut scope = facts.clone();
                    scope["line"] = line.clone();
                    if !evaluate(
                        filter["type"].as_str().ok_or("Filter type required")?,
                        &filter["config"],
                        &scope,
                    )? {
                        continue;
                    }
                }
                quantity += if name == "cartGoodsCount" {
                    1.
                } else if name == "cartGoodsPrice" {
                    line["totalPrice"].as_f64().ok_or("Line price required")?
                } else {
                    line["quantity"].as_f64().ok_or("Line quantity required")?
                };
            }
            comparison::compare(
                &json!(quantity),
                &config[if name == "cartGoodsPrice" {
                    "amount"
                } else {
                    "count"
                }],
                op,
                "number",
            )
        }
        "cartLineItemWrapper" => {
            let container = &config["container"];
            for line in lines {
                let mut scope = facts.clone();
                scope["line"] = line.clone();
                if evaluate(
                    container["type"]
                        .as_str()
                        .ok_or("Wrapper container required")?,
                    &container["config"],
                    &scope,
                )? {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        "allLineItemsContainer" => {
            if lines.is_empty() {
                return Ok(false);
            }
            let types = config["types"].as_array();
            let selected = lines
                .into_iter()
                .filter(|line| types.is_none_or(|t| t.is_empty() || t.contains(&line["type"])))
                .collect::<Vec<_>>();
            if selected.is_empty() {
                return Ok(types.is_some_and(|t| !t.is_empty()));
            }
            for child in config["children"]
                .as_array()
                .ok_or("All-line children required")?
            {
                let mut hits = 0;
                for line in &selected {
                    let mut scope = facts.clone();
                    scope["line"] = (*line).clone();
                    if evaluate(
                        child["type"].as_str().ok_or("Child type required")?,
                        &child["config"],
                        &scope,
                    )? {
                        hits += 1
                    }
                }
                let minimum = config["minimumShouldMatch"]
                    .as_u64()
                    .filter(|v| *v > 0)
                    .map(|v| v as usize)
                    .unwrap_or(selected.len());
                if hits < minimum {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Err(format!("Missing source evaluator: {name}")),
    }
}
