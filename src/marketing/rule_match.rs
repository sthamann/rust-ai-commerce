//! Evaluate typed rule trees against server-owned cart, customer and event facts.
use super::rules::Condition;
use super::*;
impl Condition {
    pub(crate) fn checked_matches(&self, c: &StoredCart, q: &Value) -> Result<bool> {
        self.checked_at(c, q, 0)
    }
    fn checked_at(&self, c: &StoredCart, q: &Value, depth: usize) -> Result<bool> {
        if depth > 8 {
            return Err(bad("Rule references contain a cycle or exceed depth 8"));
        }
        match self {
            Self::Reference { rule_id } => {
                let row = &q["ruleFacts"]["rules"][rule_id];
                if !row["active"].is_boolean() {
                    return Err(bad("Referenced rule unavailable in this tenant"));
                }
                if row["active"] == false {
                    return Err(bad("Referenced rule disabled"));
                }
                let rule: Condition = serde_json::from_value(row["condition"].clone())
                    .map_err(|_| bad("Invalid referenced rule"))?;
                rule.validate(0)?;
                rule.checked_at(c, q, depth + 1)
            }
            Self::Source { name, config } => {
                rust_ai_commerce::automation_rules::evaluate(name, config, &q["ruleFacts"])
                    .map_err(bad)
            }
            Self::And { children } | Self::Or { children } => {
                let values = children
                    .iter()
                    .map(|v| v.checked_at(c, q, depth + 1))
                    .collect::<Result<Vec<_>>>()?;
                Ok(if matches!(self, Self::And { .. }) {
                    values.iter().all(|x| *x)
                } else {
                    values.contains(&true)
                })
            }
            Self::Not { child } => Ok(!child.checked_at(c, q, depth + 1)?),
            _ => Ok(self.matches(c, q)),
        }
    }
    pub(crate) fn matches(&self, c: &StoredCart, q: &Value) -> bool {
        match self {
            Self::Reference { .. } | Self::Source { .. } => {
                self.checked_matches(c, q).unwrap_or(false)
            }
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
            Self::Group { values, operator } => {
                set_matches(std::slice::from_ref(&c.data.group), values, operator)
            }
            Self::Country { values, operator } => {
                set_matches(&[commerce::selection(&c.data).country], values, operator)
            }
            Self::Channel { values, operator } => set_matches(
                std::slice::from_ref(&c.data.sales_channel),
                values,
                operator,
            ),
            Self::Product { values, operator } => set_matches(
                &c.data
                    .items
                    .iter()
                    .map(|i| i.id.clone())
                    .collect::<Vec<_>>(),
                values,
                operator,
            ),
            Self::OriginalProduct { values, operator } => {
                q["lineItems"].as_array().is_some_and(|items| {
                    items.iter().any(|item| {
                        let Some(id) = item["referencedId"].as_str() else {
                            return false;
                        };
                        item["parentId"]
                            .as_str()
                            .is_some_and(|parent| set_matches(&[parent.into()], values, operator))
                            || set_matches(&[id.into()], values, operator)
                    })
                })
            }
            Self::OrderState { values, operator } => set_matches(
                &q["orderState"]
                    .as_str()
                    .map(String::from)
                    .into_iter()
                    .collect::<Vec<_>>(),
                values,
                operator,
            ),
            Self::PaymentState { values, operator } => set_matches(
                &q["paymentState"]
                    .as_str()
                    .map(String::from)
                    .into_iter()
                    .collect::<Vec<_>>(),
                values,
                operator,
            ),
            Self::DeliveryState { values, operator } => set_matches(
                &q["deliveryStates"]
                    .as_array()
                    .map(|v| {
                        v.iter()
                            .filter_map(|s| s.as_str().map(String::from))
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default(),
                values,
                operator,
            ),
            Self::ShippingMethod { values, operator } => set_matches(
                &[commerce::selection(&c.data).shipping_method_id],
                values,
                operator,
            ),
            Self::PaymentMethod { values, operator } => set_matches(
                &[commerce::selection(&c.data).payment_method_id],
                values,
                operator,
            ),
            Self::BillingCountry { values, operator } => {
                let ids = if c.data.customer_id.is_some() {
                    commerce::selection(&c.data)
                        .billing_address
                        .map(|a| a.country)
                        .into_iter()
                        .collect::<Vec<_>>()
                } else {
                    vec![]
                };
                set_matches(&ids, values, operator)
            }
            Self::CustomerShippingCountry { values, operator } => {
                let country = commerce::selection(&c.data).country;
                let ids = if country.is_empty() {
                    vec![]
                } else {
                    vec![country]
                };
                set_matches(&ids, values, operator)
            }
            Self::Email { email, operator } => {
                if c.data.customer_id.is_none() {
                    return operator == "!=";
                }
                let matched = wildcard(c.data.email.as_deref().unwrap_or(""), email);
                rust_ai_commerce::verified_kernel::rule_boolean_comparison(
                    matched,
                    false,
                    operator == "=",
                    operator == "!=",
                    false,
                )
            }
            Self::LoggedIn { is_logged_in } => {
                rust_ai_commerce::verified_kernel::rule_authenticated(
                    c.data.customer_id.is_some(),
                    *is_logged_in,
                )
            }
            Self::Field {
                field,
                operator,
                value,
            } => rule_fields::matches(c, q, field, operator, value),
            Self::EventField {
                path,
                operator,
                value,
            } => {
                let mut item = &q["event"];
                for key in path.split('.') {
                    item = &item[key];
                }
                rule_fields::compare(item, operator, value)
            }
        }
    }
}
fn numeric(a: f64, b: f64, op: &str) -> bool {
    rust_ai_commerce::rule_comparison::numeric(Some(a), Some(b), op).unwrap_or(false)
}
fn set_matches(actual: &[String], rule: &[String], operator: &str) -> bool {
    rust_ai_commerce::rule_comparison::uuids(
        Some(&actual.iter().cloned().map(Some).collect::<Vec<_>>()),
        Some(&rule.iter().cloned().map(Some).collect::<Vec<_>>()),
        operator,
    )
    .unwrap_or(false)
}

fn wildcard(value: &str, pattern: &str) -> bool {
    let value = value.to_ascii_lowercase();
    let pattern = pattern.to_ascii_lowercase();
    let (v, p) = (value.as_bytes(), pattern.as_bytes());
    let (mut i, mut j, mut star, mut at) = (0, 0, None, 0);
    while i < v.len() {
        if j < p.len() && p[j] == v[i] {
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
