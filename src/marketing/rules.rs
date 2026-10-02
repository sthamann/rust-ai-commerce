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
    #[serde(rename = "alwaysValid")]
    Always,
    #[serde(rename = "cartCartAmount")]
    Amount { operator: String, amount: f64 },
    #[serde(rename = "cartLineItemCount")]
    Count { operator: String, count: f64 },
    #[serde(rename = "customerGroup")]
    Group { values: Vec<String> },
    #[serde(rename = "shippingCountry")]
    Country { values: Vec<String> },
    #[serde(rename = "salesChannel")]
    Channel { values: Vec<String> },
    #[serde(rename = "lineItemId")]
    Product { values: Vec<String> },
    #[serde(rename = "customerLoggedIn")]
    LoggedIn,
}
impl Condition {
    pub(crate) fn validate(&self, depth: usize) -> Result<()> {
        if depth > 8 {
            return Err(bad("Maximum rule depth 8"));
        }
        match self {
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
            Self::Group { values }
            | Self::Country { values }
            | Self::Channel { values }
            | Self::Product { values }
                if (values.len() > 50 || values.iter().any(|v| v.is_empty() || v.len() > 100)) =>
            {
                return Err(bad("Invalid rule values"));
            }
            _ => {}
        }
        Ok(())
    }
    pub(crate) fn matches(&self, c: &StoredCart, q: &Value) -> bool {
        match self {
            Self::And { children } => children.iter().all(|v| v.matches(c, q)),
            Self::Or { children } => children.iter().any(|v| v.matches(c, q)),
            Self::Not { child } => !child.matches(c, q),
            Self::Always => true,
            Self::Amount { operator, amount } => numeric(
                q["price"]["totalPrice"].as_f64().unwrap_or(0.),
                *amount,
                operator,
            ),
            Self::Count { operator, count } => numeric(c.data.items.len() as f64, *count, operator),
            Self::Group { values } => values.contains(&c.data.group),
            Self::Country { values } => values.contains(&commerce::selection(&c.data).country),
            Self::Channel { values } => values.contains(&c.data.sales_channel),
            Self::Product { values } => c.data.items.iter().any(|i| values.contains(&i.id)),
            Self::LoggedIn => c.data.email.is_some(),
        }
    }
}
fn numeric(a: f64, b: f64, op: &str) -> bool {
    rust_ai_commerce::rule_comparison::numeric(Some(a), Some(b), op).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unknown_and_unbounded_conditions() {
        assert!(serde_json::from_value::<Condition>(json!({"type":"runShell"})).is_err());
        assert!(
            Condition::Amount {
                operator: "exec".into(),
                amount: 1.
            }
            .validate(0)
            .is_err()
        );
        assert!(
            Condition::And {
                children: vec![Condition::Always; 21]
            }
            .validate(0)
            .is_err()
        );
    }
    #[test]
    fn operators_match_boundaries() {
        assert!(numeric(100., 100., "="));
        assert!(!numeric(99., 100., ">="));
        assert!(numeric(100., 100., ">="));
        assert!(!numeric(100., 100., "<"));
    }
}
