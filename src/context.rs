//! Bounded behavioral ports of Shopware 6.7.14.2 context and product-cart selection.
use serde::{Deserialize, Serialize};

pub const SYSTEM_LANGUAGE: &str = "2fbb5fe2e29a4d70aa5854ce7ce3e20b";
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Language {
    pub id: String,
    pub parent_id: Option<String>,
}
pub fn language_chain(
    current: &str,
    available: &[String],
    languages: &[Language],
) -> Result<Vec<String>, &'static str> {
    if current.len() != 32
        || !current
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err("invalid-language-id");
    }
    if !available.iter().any(|id| id == current) {
        return Err("language-unavailable");
    }
    if current == SYSTEM_LANGUAGE {
        return Ok(vec![SYSTEM_LANGUAGE.into()]);
    }
    let language = languages
        .iter()
        .find(|l| l.id == current)
        .ok_or("language-not-found")?;
    // Original ContextFactory includes one parent and the system language,
    // preserves duplicates, and removes empty entries; this is not a recursive traversal.
    Ok([
        Some(current.to_string()),
        language.parent_id.clone(),
        Some(SYSTEM_LANGUAGE.into()),
    ]
    .into_iter()
    .flatten()
    .filter(|id| !id.is_empty())
    .collect())
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tier {
    pub rule_id: String,
    pub quantity_start: u32,
    pub quantity_end: Option<u32>,
    pub discount: f64,
}
pub fn select_tier<'a>(tiers: &'a [Tier], rule_ids: &[String], quantity: u32) -> Option<&'a Tier> {
    // ProductPriceCalculator::filterRulePrices picks the FIRST available rule
    // in context priority, then calculateAdvancePrices sorts by quantityStart.
    let rule = rule_ids
        .iter()
        .find(|rule| tiers.iter().any(|t| &t.rule_id == *rule))?;
    let mut prices = tiers
        .iter()
        .filter(|t| &t.rule_id == rule)
        .collect::<Vec<_>>();
    prices.sort_by_key(|t| t.quantity_start);
    // ProductCartProcessor::getPriceDefinition: first calculated quantity >=
    // requested quantity, otherwise the last price, including an open final tier.
    prices
        .iter()
        .find(|t| quantity <= t.quantity_end.unwrap_or(t.quantity_start))
        .copied()
        .or_else(|| prices.last().copied())
}
pub fn fix_quantity(min: i64, current: i64, steps: i64) -> i64 {
    // ProductCartProcessor::fixQuantity uses floor, including below-min inputs.
    (current - min).div_euclid(steps) * steps + min
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn priority_beats_cheapest_and_quantity_boundary() {
        let tiers = vec![
            Tier {
                rule_id: "vip".into(),
                quantity_start: 1,
                quantity_end: None,
                discount: 0.5,
            },
            Tier {
                rule_id: "business".into(),
                quantity_start: 5,
                quantity_end: None,
                discount: 0.15,
            },
            Tier {
                rule_id: "business".into(),
                quantity_start: 1,
                quantity_end: Some(4),
                discount: 0.1,
            },
        ];
        assert_eq!(
            select_tier(&tiers, &["business".into(), "vip".into()], 4)
                .unwrap()
                .discount,
            0.1
        );
        assert_eq!(
            select_tier(&tiers, &["business".into(), "vip".into()], 5)
                .unwrap()
                .discount,
            0.15
        );
        assert!(select_tier(&tiers, &[], 5).is_none());
    }
    #[test]
    fn one_parent_and_duplicate_system_match_original() {
        let id = "11111111111111111111111111111111";
        assert_eq!(
            language_chain(
                id,
                &[id.into()],
                &[Language {
                    id: id.into(),
                    parent_id: Some(SYSTEM_LANGUAGE.into())
                }]
            )
            .unwrap(),
            vec![id, SYSTEM_LANGUAGE, SYSTEM_LANGUAGE]
        );
        assert_eq!(fix_quantity(3, 2, 2), 1);
        assert_eq!(
            language_chain(
                &SYSTEM_LANGUAGE.to_uppercase(),
                &[SYSTEM_LANGUAGE.to_uppercase()],
                &[]
            ),
            Err("invalid-language-id")
        );
    }
}
