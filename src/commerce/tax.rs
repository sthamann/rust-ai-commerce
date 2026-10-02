//! Destination tax-class resolution and net-preserving price conversion.
use super::*;

pub(crate) fn tax_products(
    ps: &[Product],
    c: &CheckoutSelection,
    s: &Settings,
) -> Result<Vec<Product>> {
    if !s.countries.contains(&c.country) {
        return Err(bad("Country is not supported"));
    }
    ps.iter()
        .map(|p| {
            let mut p = p.clone();
            let tax = s
                .taxes
                .iter()
                .find(|t| {
                    t.id == if p.tax_rate == 7. {
                        "reduced"
                    } else {
                        "standard"
                    }
                })
                .ok_or(bad("Tax class missing"))?;
            let rate = *tax
                .rates
                .get(&c.country)
                .ok_or(bad("Country tax rate missing"))?;
            let factor = (1. + rate / 100.) / (1. + p.tax_rate / 100.);
            p.price *= factor;
            p.list_price = p.list_price.map(|v| v * factor);
            p.regulation_price = p.regulation_price.map(|v| v * factor);
            p.tax_rate = rate;
            Ok(p)
        })
        .collect()
}
// Parents remain the six listing entries; actual child SKUs carry their own prices/stock.
