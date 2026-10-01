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
    // Shopware FloatComparator::cast uses PHP's default precision=14.
    let cast = |x: f64| format!("{x:.13e}").parse::<f64>().unwrap();
    let input = cast(i.price);
    let rate = cast(i.tax_rate);
    let round = |x| {
        if i.gross || i.round_for_net {
            cash_round(x, i.decimals, i.interval)
        } else {
            math_round(x, i.decimals)
        }
    };
    let raw = if i.gross && !i.calculated {
        input + cast((input / 100.0 * 100.0) * (rate / 100.0))
    } else {
        input
    };
    let unit = round(raw);
    let allocated = unit / 100.0 * 100.0;
    let unit_tax = cast(if i.gross {
        allocated / ((100.0 + rate) / 100.0) * (rate / 100.0)
    } else {
        allocated * (rate / 100.0)
    });
    Price {
        unit_price: unit,
        total_price: round(unit * i.quantity as f64),
        tax: math_round(unit_tax * i.quantity as f64, i.decimals),
        quantity: i.quantity,
    }
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
        });
        assert_eq!(p.total_price, 60.);
        assert_eq!(p.tax, 9.58);
    }
}
