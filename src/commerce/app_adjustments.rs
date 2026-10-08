//! Apply admitted integer app adjustments through native pricing/tax calculation; extensions cannot replace quote JSON.
use super::*;
pub(crate) fn apply(q: &mut Value, kind: &str, minor: i64) -> Result<()> {
    let scale = q["price"]["currencyScale"]
        .as_u64()
        .ok_or(bad("Quote scale missing"))? as i32;
    let factor = 10_f64.powi(scale);
    if kind == "validation" {
        if minor != 0 {
            return Err(bad("Validation hook cannot change money"));
        }
        return Ok(());
    }
    if kind == "shipping" {
        let previous = q["appShippingAdjustmentMinor"].as_i64().unwrap_or(0);
        let combined = previous
            .checked_add(minor)
            .filter(|n| n.unsigned_abs() <= 100_000_000)
            .ok_or(bad("Shipping hook adjustment overflow"))?;
        if q["shippingCosts"]["totalPrice"].as_f64().unwrap_or(0.) + minor as f64 / factor < 0. {
            return Err(bad("Shipping hook cannot make delivery cost negative"));
        }
        q["appShippingAdjustmentMinor"] = json!(combined);
    } else {
        if minor < 0 {
            return Err(bad(
                "Price/discount hooks return a nonnegative adjustment; the hook determines its direction",
            ));
        }
        let lines = q["lineItems"]
            .as_array()
            .ok_or(bad("Quote items missing"))?;
        let totals: Vec<i64> = lines
            .iter()
            .map(|l| {
                currencies::amount(
                    l["price"]["totalPrice"].as_f64().unwrap_or(0.),
                    q["price"]["currency"].as_str().unwrap_or(""),
                    scale as u8,
                )
                .map(|m| m.minor())
            })
            .collect::<Result<_>>()?;
        let sum = totals
            .iter()
            .try_fold(0i64, |sum, n| sum.checked_add(*n))
            .ok_or(bad("Hook total overflow"))?;
        if minor > sum {
            return Err(bad("App adjustment exceeds current goods value"));
        }
        // The existing allocator distributes exact minor units without creating a second rounding implementation.
        let after = vendune::discount::allocate(&totals, minor);
        let b2b = q["price"]["taxStatus"] == "net";
        for (i, line) in q["lineItems"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .enumerate()
        {
            let target = if kind == "price" {
                totals[i] + (totals[i] - after[i])
            } else {
                after[i]
            };
            let rules = line["price"]["calculatedTaxes"]
                .as_array()
                .ok_or(bad("Quote taxes missing"))?;
            let taxes: Vec<vendune::pricing::CalculatedTax> = rules
                .iter()
                .map(|r| vendune::pricing::CalculatedTax {
                    tax_rate: r["taxRate"].as_f64().unwrap_or(0.),
                    price: r["price"].as_f64().unwrap_or(0.),
                    tax: r["tax"].as_f64().unwrap_or(0.),
                })
                .collect();
            let tax_rules = proportional_tax_rules(&taxes, totals[i] as f64 / factor);
            let calc = calculate(&PriceInput {
                price: target as f64 / factor,
                quantity: 1,
                decimals: scale,
                interval: 1. / factor,
                tax_rules: Some(tax_rules),
                gross: !b2b,
                ..PriceInput::default()
            });
            let qty = line["quantity"].as_u64().unwrap_or(1).max(1) as f64;
            line["price"]["totalPrice"] = json!(calc.total_price);
            line["price"]["unitPrice"] = json!(math_round(calc.total_price / qty, scale));
            line["price"]["calculatedTaxes"] = json!(
                calc.calculated_taxes
                    .iter()
                    .map(|t| json!({"tax":t.tax,"taxRate":t.tax_rate,"price":t.price}))
                    .collect::<Vec<_>>()
            );
        }
        if kind == "discount" {
            q["discountTotal"] = json!(math_round(
                q["discountTotal"].as_f64().unwrap_or(0.) + minor as f64 / factor,
                scale
            ));
        }
    }
    // Strip the previous delivery components; the shared delivery owner recalculates them exactly once next.
    let lines = q["lineItems"].as_array().unwrap();
    let positions = math_round(
        lines
            .iter()
            .map(|l| l["price"]["totalPrice"].as_f64().unwrap())
            .sum(),
        scale,
    );
    let tax = math_round(
        lines
            .iter()
            .flat_map(|l| l["price"]["calculatedTaxes"].as_array().unwrap())
            .map(|t| t["tax"].as_f64().unwrap())
            .sum(),
        scale,
    );
    let b2b = q["price"]["taxStatus"] == "net";
    q["price"]["positionPrice"] = json!(positions);
    q["price"]["tax"] = json!(tax);
    q["price"]["netPrice"] = json!(if b2b {
        positions
    } else {
        math_round(positions - tax, scale)
    });
    q["price"]["totalPrice"] = json!(if b2b {
        math_round(positions + tax, scale)
    } else {
        positions
    });
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn quote() -> Value {
        json!({"price":{"currency":"EUR","currencyScale":2,"taxStatus":"gross","positionPrice":119.,"totalPrice":123.9,"tax":19.78,"netPrice":104.12},"lineItems":[{"quantity":1,"price":{"totalPrice":119.,"unitPrice":119.,"calculatedTaxes":[{"taxRate":19.,"tax":19.,"price":119.}]}}],"shippingCosts":{"totalPrice":4.9}})
    }
    #[test]
    fn mixed_tax_allocation_is_preserved_by_native_recalculation() {
        let mut q = quote();
        q["lineItems"][0]["price"] = json!({"totalPrice":119.,"unitPrice":119.,"calculatedTaxes":[{"taxRate":19.,"tax":9.5,"price":59.5},{"taxRate":7.,"tax":3.89,"price":59.5}]});
        apply(&mut q, "discount", 1190).unwrap();
        let taxes = q["lineItems"][0]["price"]["calculatedTaxes"]
            .as_array()
            .unwrap();
        assert_eq!(taxes.len(), 2);
        assert_eq!(taxes[0]["price"], 53.55);
        assert_eq!(taxes[1]["price"], 53.55);
        assert_eq!(taxes[0]["tax"], 8.55);
        assert_eq!(taxes[1]["tax"], 3.5);
    }
    #[test]
    fn native_app_adjustments_conserve_units_tax_and_goods_bounds() {
        let mut q = quote();
        apply(&mut q, "discount", 1190).unwrap();
        assert_eq!(q["price"]["totalPrice"], 107.1);
        assert_eq!(q["price"]["tax"], 17.1);
        assert_eq!(q["price"]["netPrice"], 90.);
        apply(&mut q, "price", 1071).unwrap();
        assert_eq!(q["price"]["totalPrice"], 117.81);
        assert!(apply(&mut q, "price", 20000).is_err());
        assert!(apply(&mut q, "discount", -1).is_err());
        assert!(apply(&mut q, "shipping", -491).is_err());
        assert!(apply(&mut q, "validation", 1).is_err());
    }
}
