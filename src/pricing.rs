//! Behavioral port of Shopware 6.7.14.2 quantity calculators.
//! Original: Copyright (c) 2019 shopware AG, MIT; see THIRD_PARTY.md.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PriceInput {
    pub price: f64,
    pub quantity: u32,
    pub tax_rate: f64,
    #[serde(default = "yes")]
    pub gross: bool,
    #[serde(default = "yes")]
    pub calculated: bool,
    #[serde(default = "decimals")]
    pub decimals: i32,
    #[serde(default = "interval")]
    pub interval: f64,
    #[serde(default)]
    pub round_for_net: bool,
    #[serde(default)]
    pub tax_rules: Option<Vec<TaxRule>>,
    #[serde(default)]
    pub list_price: Option<f64>,
    #[serde(default)]
    pub regulation_price: Option<f64>,
    #[serde(default)]
    pub reference: Option<ReferenceDefinition>,
}
impl Default for PriceInput {
    fn default() -> Self {
        Self {
            price: 0.,
            quantity: 1,
            tax_rate: 19.,
            gross: true,
            calculated: true,
            decimals: 2,
            interval: 0.01,
            round_for_net: false,
            tax_rules: None,
            list_price: None,
            regulation_price: None,
            reference: None,
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TaxRule {
    pub tax_rate: f64,
    pub percentage: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ReferenceDefinition {
    pub purchase_unit: f64,
    pub reference_unit: f64,
    pub unit_name: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct CalculatedTax {
    pub tax: f64,
    pub tax_rate: f64,
    pub price: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ListPrice {
    pub price: f64,
    pub discount: f64,
    pub percentage: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ReferencePrice {
    pub price: f64,
    pub purchase_unit: f64,
    pub reference_unit: f64,
    pub unit_name: String,
}
fn cast(x: f64) -> f64 {
    format!("{x:.13e}").parse().unwrap()
}
fn sum(values: impl Iterator<Item = f64>) -> f64 {
    let total = cast(values.sum());
    if total.abs() < 1e-8 { 0. } else { total }
}
fn yes() -> bool {
    true
}
fn decimals() -> i32 {
    2
}
fn interval() -> f64 {
    0.01
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Price {
    pub unit_price: f64,
    pub total_price: f64,
    pub tax: f64,
    pub quantity: u32,
    pub calculated_taxes: Vec<CalculatedTax>,
    pub list_price: Option<ListPrice>,
    pub regulation_price: Option<f64>,
    pub reference_price: Option<ReferencePrice>,
}

// Compare the original value to a decimal midpoint, rather than rounding a
// scaled binary value or applying an epsilon. This preserves PHP 8.4+ behavior
// for the bounded commerce precision (0..=6 decimal places) used here.
pub fn math_round(value: f64, decimals: i32) -> f64 {
    let scale = 10f64.powi(decimals);
    let mut whole = (value.abs() * scale).floor();
    if (whole + 1.0) / scale == value.abs() {
        whole += 1.0;
    }
    if value.abs() >= (whole + 0.5) / scale {
        whole += 1.0;
    }
    (whole / scale).copysign(value)
}
pub fn cash_round(value: f64, decimals: i32, interval: f64) -> f64 {
    let rounded = math_round(value, decimals);
    if decimals > 2 {
        return rounded;
    }
    let multiplier = 100.0 / (interval * 100.0);
    math_round(rounded * multiplier, 0) / multiplier
}
pub fn calculate(i: &PriceInput) -> Price {
    // The original collections replace duplicate rates in their original slot.
    let mut rules: Vec<TaxRule> = vec![];
    let input_rules = i.tax_rules.clone().unwrap_or_else(|| {
        vec![TaxRule {
            tax_rate: i.tax_rate,
            percentage: 100.,
        }]
    });
    for r in input_rules {
        let r = TaxRule {
            tax_rate: cast(r.tax_rate),
            percentage: cast(r.percentage),
        };
        if let Some(old) = rules.iter_mut().find(|old| old.tax_rate == r.tax_rate) {
            *old = r;
        } else {
            rules.push(r);
        }
    }
    let round = |x| {
        if i.gross || i.round_for_net {
            cash_round(x, i.decimals, i.interval)
        } else {
            math_round(x, i.decimals)
        }
    };
    let net_tax =
        |price: f64, r: &TaxRule| cast((price / 100. * r.percentage) * (r.tax_rate / 100.));
    let gross = |price: f64| price + sum(rules.iter().map(|r| net_tax(price, r)));
    let input = cast(i.price);
    let unit = round(if i.gross && !i.calculated {
        gross(input)
    } else {
        input
    });
    let calculated_taxes = rules
        .iter()
        .map(|r| {
            let allocated = unit / 100. * r.percentage;
            let tax = cast(if i.gross {
                allocated / ((100. + r.tax_rate) / 100.) * (r.tax_rate / 100.)
            } else {
                allocated * (r.tax_rate / 100.)
            });
            CalculatedTax {
                tax: cast(math_round(tax * i.quantity as f64, i.decimals)),
                tax_rate: r.tax_rate,
                price: cast(math_round(cast(allocated) * i.quantity as f64, i.decimals)),
            }
        })
        .collect::<Vec<_>>();
    let list_price = i
        .list_price
        .filter(|p| *p != 0.)
        .map(cast)
        .map(|p| {
            round(if i.gross && !i.calculated {
                gross(p)
            } else {
                p
            })
        })
        .filter(|p| *p > 0.)
        .map(|p| ListPrice {
            price: cast(p),
            discount: cast(-(p - unit)),
            percentage: cast(math_round(100. - unit / p * 100., 2)),
        });
    let regulation_price = i.regulation_price.filter(|p| *p != 0.).map(cast).map(|p| {
        cast(round(if i.gross && !i.calculated {
            gross(p)
        } else {
            p
        }))
    });
    let reference_price = i
        .reference
        .as_ref()
        .filter(|r| r.purchase_unit > 0. && r.reference_unit > 0.)
        .map(|r| ReferencePrice {
            price: cast(math_round(
                unit / cast(r.purchase_unit) * cast(r.reference_unit),
                i.decimals,
            )),
            purchase_unit: cast(r.purchase_unit),
            reference_unit: cast(r.reference_unit),
            unit_name: r.unit_name.clone(),
        });
    Price {
        unit_price: cast(unit),
        total_price: cast(round(unit * i.quantity as f64)),
        tax: sum(calculated_taxes.iter().map(|t| t.tax)),
        quantity: i.quantity,
        calculated_taxes,
        list_price,
        regulation_price,
        reference_price,
    }
}
/// Port of PercentageTaxRuleBuilder::buildCollectionRules (6.7.14.2).
/// The collection is already merged by tax rate, as in CalculatedTaxCollection.
pub fn proportional_tax_rules(taxes: &[CalculatedTax], total: f64) -> Vec<TaxRule> {
    if taxes.is_empty() {
        return vec![];
    }
    taxes
        .iter()
        .map(|tax| TaxRule {
            tax_rate: tax.tax_rate,
            percentage: if total == 0. {
                100. / taxes.len() as f64
            } else {
                tax.price / total * 100.
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decimal_ties() {
        assert_eq!(math_round(1.005, 2), 1.01);
        assert_eq!(math_round(-1.005, 2), -1.01);
        assert_eq!(math_round(1.004999, 2), 1.0);
    }
    #[test]
    fn shopware_negative_tax_cast_regression() {
        for (price, quantity, tax) in [(-853.999, 93, -13236.985), (-725.879, 69, -8347.608)] {
            let p = calculate(&PriceInput {
                price,
                quantity,
                tax_rate: 20.,
                gross: true,
                calculated: true,
                decimals: 3,
                interval: 0.01,
                round_for_net: false,
                ..PriceInput::default()
            });
            assert_eq!(p.tax, tax);
        }
    }
    #[test]
    fn gross_unit_before_total() {
        let p = calculate(&PriceInput {
            price: 19.995,
            quantity: 3,
            tax_rate: 19.,
            gross: true,
            calculated: true,
            decimals: 2,
            interval: 0.01,
            round_for_net: false,
            ..PriceInput::default()
        });
        assert_eq!(p.total_price, 60.);
        assert_eq!(p.tax, 9.58);
    }
}
