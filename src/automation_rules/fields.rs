//! Source custom fields retain typed equality and selection intersection; purchase prices use private server facts.
use super::*;
pub(super) fn validate(name: &str, c: &Value) -> Result<(), String> {
    if name.ends_with("CustomField") {
        let key = c["renderedField"]["name"]
            .as_str()
            .ok_or("Custom field name required")?;
        let kind = c["renderedField"]["type"]
            .as_str()
            .ok_or("Custom field type required")?;
        if key.is_empty()
            || key.len() > 100
            || !matches!(
                kind,
                "bool"
                    | "switch"
                    | "checkbox"
                    | "text"
                    | "int"
                    | "float"
                    | "select"
                    | "date"
                    | "datetime"
            )
        {
            return Err("Unsupported custom field type/name".into());
        }
        if !matches!(
            c["operator"].as_str(),
            Some("=")
                | Some("!=")
                | Some(">")
                | Some(">=")
                | Some("<")
                | Some("<=")
                | Some("between")
        ) {
            return Err("Invalid custom field operator".into());
        }
        if c.get("renderedFieldValue").is_none() {
            return Err("Custom field comparison required".into());
        }
        if c["operator"] == "between" && !matches!(kind, "date" | "datetime") {
            return Err("Between requires a date field".into());
        }
    } else {
        if !matches!(c["type"].as_str(), Some("gross") | Some("net")) || !c["amount"].is_number() {
            return Err("Purchase price gross/net and amount required".into());
        }
        if !matches!(
            c["operator"].as_str(),
            Some("=")
                | Some("!=")
                | Some(">")
                | Some(">=")
                | Some("<")
                | Some("<=")
                | Some("empty")
        ) {
            return Err("Invalid purchase price operator".into());
        }
    }
    Ok(())
}
pub(super) fn evaluate(name: &str, c: &Value, f: &Value) -> Result<bool, String> {
    if name == "customerCustomField" {
        if fact(f, "customer.loggedIn")? == false {
            return Ok(false);
        }
        return custom(c, fact(f, "customer.customFields")?);
    }
    if name == "orderCustomField" {
        return custom(c, fact(f, "order.customFields")?);
    }
    let lines = if let Some(line) = f.get("line") {
        vec![line]
    } else {
        f["lines"]
            .as_array()
            .ok_or("Line scope required")?
            .iter()
            .collect()
    };
    let mut total = 0.;
    for line in lines {
        if line["good"] != true {
            continue;
        }
        if name == "cartLineItemCustomField" {
            if line["type"] == "product" && custom(c, fact(line, "customFields")?)? {
                return Ok(true);
            }
        } else {
            let prices = fact(line, "purchasePrices")?;
            let price = prices.get(c["type"].as_str().unwrap());
            if name == "cartTotalPurchasePrice" {
                total += price.and_then(Value::as_f64).unwrap_or(0.)
                    * line["quantity"].as_f64().ok_or("Quantity required")?;
            } else if line["type"] == "product" {
                let actual = price
                    .or_else(|| prices.get("gross"))
                    .unwrap_or(&Value::Null);
                if comparison::compare(
                    actual,
                    &c["amount"],
                    c["operator"].as_str().unwrap(),
                    "number",
                )? {
                    return Ok(true);
                }
            }
        }
    }
    if name == "cartTotalPurchasePrice" {
        return comparison::compare(
            &json!(total),
            &c["amount"],
            c["operator"].as_str().unwrap(),
            "number",
        );
    }
    Ok(false)
}
fn custom(c: &Value, fields: &Value) -> Result<bool, String> {
    let kind = c["renderedField"]["type"].as_str().unwrap();
    let key = c["renderedField"]["name"].as_str().unwrap();
    let op = c["operator"].as_str().unwrap();
    let boolean = matches!(kind, "bool" | "switch" | "checkbox");
    let actual =
        fields
            .get(key)
            .cloned()
            .unwrap_or(if boolean { json!(false) } else { Value::Null });
    let mut expected = c["renderedFieldValue"].clone();
    if boolean {
        if let Some(s) = expected.as_str() {
            expected = json!(["1", "true", "on", "yes"].contains(&s.to_lowercase().as_str()));
        }
        if expected.is_null() {
            expected = json!(false)
        }
    }
    if actual.is_null() {
        return Ok(op == "!=" && !expected.is_null());
    }
    if kind == "float" {
        return comparison::compare(&actual, &expected, op, "number");
    }
    if kind == "select"
        && matches!(
            c["renderedField"]["config"]["componentName"].as_str(),
            Some("sw-multi-select") | Some("sw-entity-multi-select")
        )
    {
        return comparison::compare(&actual, &expected, op, "set");
    }
    if matches!(kind, "date" | "datetime") {
        return super::time::date(&actual, &expected, op, kind == "date");
    }
    if matches!(op, "=" | "!=") {
        return Ok(if op == "=" {
            actual == expected
        } else {
            actual != expected
        });
    }
    if actual.is_number() && expected.is_number() {
        return comparison::compare(&actual, &expected, op, "number");
    }
    if actual.is_string() && expected.is_string() {
        return comparison::compare(&actual, &expected, op, "string");
    }
    Err("Incompatible custom field comparison types".into())
}
