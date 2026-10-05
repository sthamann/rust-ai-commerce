//! Typed rule fields share the original comparison operators and server-derived checkout/event facts.
use super::*;
pub(crate) const FIELDS: &[&str] = &[
    "customer.email",
    "customer.company",
    "customer.group",
    "customer.loggedIn",
    "cart.quantity",
    "cart.shippingMethod",
    "cart.paymentMethod",
    "cart.billingCountry",
    "cart.shippingCountry",
    "cart.salesChannel",
    "order.state",
    "payment.state",
    "event.kind",
    "event.title",
    "event.sourceKind",
];
pub(crate) fn validate(field: &str, operator: &str, value: &Value) -> Result<()> {
    if !FIELDS.contains(&field) {
        return Err(bad("Unsupported rule field"));
    }
    validate_value(operator, value)
}
pub(crate) fn validate_value(operator: &str, value: &Value) -> Result<()> {
    if !["=", "!=", ">", ">=", "<", "<=", "empty", "contains"].contains(&operator)
        || !value.is_string() && !value.is_boolean() && !value.is_number()
    {
        return Err(bad("Invalid field comparison"));
    }
    if value.is_boolean() && !["=", "!="].contains(&operator)
        || value.is_string() && !["=", "!=", "empty", "contains"].contains(&operator)
    {
        return Err(bad("Operator incompatible with field value"));
    }
    if value.to_string().len() > 500 {
        return Err(bad("Rule value exceeds limit"));
    }
    Ok(())
}
pub(crate) fn matches(
    c: &StoredCart,
    q: &Value,
    field: &str,
    operator: &str,
    value: &Value,
) -> bool {
    let selection = commerce::selection(&c.data);
    let actual = match field {
        "customer.email" => json!(c.data.email),
        "customer.company" => json!(c.data.company),
        "customer.group" => json!(c.data.group),
        "customer.loggedIn" => json!(c.data.customer_id.is_some()),
        "cart.quantity" => json!(
            c.data
                .items
                .iter()
                .map(|i| u64::from(i.quantity))
                .sum::<u64>()
        ),
        "cart.shippingMethod" => json!(selection.shipping_method_id),
        "cart.paymentMethod" => json!(selection.payment_method_id),
        "cart.billingCountry" => json!(selection.billing_address.map(|a| a.country)),
        "cart.shippingCountry" => json!(selection.country),
        "cart.salesChannel" => json!(c.data.sales_channel),
        "order.state" => q["orderState"].clone(),
        "payment.state" => q["paymentState"].clone(),
        "event.kind" => q["eventKind"].clone(),
        "event.title" => q["event"]["title"].clone(),
        "event.sourceKind" => q["event"]["sourceKind"].clone(),
        _ => return false,
    };
    compare(&actual, operator, value)
}
pub(crate) fn compare(item: &Value, operator: &str, rule: &Value) -> bool {
    if rule.is_number() {
        return vendune::rule_comparison::numeric(item.as_f64(), rule.as_f64(), operator)
            .unwrap_or(false);
    }
    if rule.is_boolean() {
        return match operator {
            "=" => item.as_bool() == rule.as_bool(),
            "!=" => item.as_bool().is_some() && item.as_bool() != rule.as_bool(),
            _ => false,
        };
    }
    if operator == "contains" {
        return item
            .as_str()
            .zip(rule.as_str())
            .is_some_and(|(a, b)| a.to_lowercase().contains(&b.to_lowercase()));
    }
    vendune::rule_comparison::string(item.as_str(), rule.as_str().unwrap_or(""), operator)
        .unwrap_or(false)
}
