//! Batch transport for comparing the actual legacy-to-integer checkout boundary against original Shopware totals.
use std::io::{self, Read};
use vendune::money::Money;
fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let values: Vec<f64> = serde_json::from_str(&input).unwrap();
    let output = values
        .into_iter()
        .map(|v| Money::from_legacy_eur(v).unwrap())
        .collect::<Vec<_>>();
    println!("{}", serde_json::to_string(&output).unwrap());
}
