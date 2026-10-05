//! Bounded Shopware-style boolean/numeric rule AST. Unknown operators/conditions fail closed.
use super::*;
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub(crate) enum Condition {
    #[serde(rename = "andContainer")]
    And { children: Vec<Condition> },
    #[serde(rename = "orContainer")]
    Or { children: Vec<Condition> },
    #[serde(rename = "notContainer")]
    Not { child: Box<Condition> },
    #[serde(rename = "shopwareCondition")]
    Source { name: String, config: Value },
    #[serde(rename = "ruleReference")]
    Reference {
        #[serde(rename = "ruleId")]
        rule_id: String,
    },
    #[serde(rename = "alwaysValid")]
    Always,
    #[serde(rename = "cartCartAmount")]
    Amount { operator: String, amount: f64 },
    #[serde(rename = "cartLineItemCount", alias = "cartLineItemsInCartCount")]
    Count { operator: String, count: f64 },
    #[serde(rename = "customerGroup", alias = "customerCustomerGroup")]
    Group {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "shippingCountry")]
    Country {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "salesChannel")]
    Channel {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "lineItemId")]
    Product {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "cartLineItem")]
    OriginalProduct {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "orderState")]
    OrderState {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "paymentState")]
    PaymentState {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "deliveryState")]
    DeliveryState {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "shippingMethod")]
    ShippingMethod {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "paymentMethod")]
    PaymentMethod {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "customerBillingCountry")]
    BillingCountry {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "customerShippingCountry")]
    CustomerShippingCountry {
        #[serde(default)]
        values: Vec<String>,
        #[serde(default = "equal")]
        operator: String,
    },
    #[serde(rename = "customerEmail")]
    Email { email: String, operator: String },
    #[serde(rename = "customerLoggedIn")]
    LoggedIn {
        #[serde(default = "yes", rename = "isLoggedIn")]
        is_logged_in: bool,
    },
    #[serde(rename = "contextField")]
    Field {
        field: String,
        operator: String,
        value: Value,
    },
    #[serde(rename = "eventField")]
    EventField {
        path: String,
        operator: String,
        value: Value,
    },
}
impl Condition {
    pub(crate) fn validate(&self, depth: usize) -> Result<()> {
        if depth > 8 {
            return Err(bad("Maximum rule depth 8"));
        }
        match self {
            Self::Reference { rule_id } if !apps::identifier(rule_id) => {
                return Err(bad("Invalid referenced rule ID"));
            }
            Self::Source { name, config } => {
                vendune::automation_rules::validate(name, config, depth).map_err(bad)?
            }
            Self::And { children } | Self::Or { children } => {
                if children.len() > 20 {
                    return Err(bad("Maximum 20 children"));
                }
                for c in children {
                    c.validate(depth + 1)?;
                }
            }
            Self::Not { child } => child.validate(depth + 1)?,
            Self::Amount { operator, amount }
            | Self::Count {
                operator,
                count: amount,
            } => {
                if !amount.is_finite()
                    || *amount < 0.
                    || !["=", "!=", ">", ">=", "<", "<="].contains(&operator.as_str())
                {
                    return Err(bad("Invalid numeric rule"));
                }
            }
            Self::Email { email, operator }
                if email.len() > 254 || !["=", "!="].contains(&operator.as_str()) =>
            {
                return Err(bad("Invalid email rule"));
            }
            Self::OriginalProduct { values, operator }
            | Self::ShippingMethod { values, operator }
            | Self::PaymentMethod { values, operator }
            | Self::BillingCountry { values, operator }
            | Self::CustomerShippingCountry { values, operator }
            | Self::OrderState { values, operator }
            | Self::PaymentState { values, operator }
            | Self::DeliveryState { values, operator }
            | Self::Group { values, operator }
            | Self::Country { values, operator }
            | Self::Channel { values, operator }
            | Self::Product { values, operator }
                if (values.len() > 50
                    || values.iter().any(|v| v.is_empty() || v.len() > 100)
                    || !["=", "!=", "empty"].contains(&operator.as_str())) =>
            {
                return Err(bad("Invalid rule values"));
            }
            Self::Field {
                field,
                operator,
                value,
            } => rule_fields::validate(field, operator, value)?,
            Self::EventField {
                path,
                operator,
                value,
            } => {
                if path.split('.').count() > 6
                    || path.len() > 120
                    || !path.split('.').all(|p| {
                        !p.is_empty() && p.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
                    })
                {
                    return Err(bad("Invalid event field path"));
                }
                rule_fields::validate_value(operator, value)?;
            }
            _ => {}
        }
        Ok(())
    }
}

fn yes() -> bool {
    true
}
fn equal() -> String {
    "=".into()
}
#[cfg(test)]
#[path = "rule_tests.rs"]
mod tests;
