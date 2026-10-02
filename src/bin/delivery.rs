//! Batch proportional-tax fixture transport for the original-PHP comparator.
use rust_ai_commerce::pricing::{CalculatedTax, proportional_tax_rules};
use serde::Deserialize;
use std::io::{self, Read};
#[derive(Deserialize)]
struct Case {
    taxes: Vec<CalculatedTax>,
    total: f64,
}
fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let cases: Vec<Case> = serde_json::from_str(&input).unwrap();
    let out: Vec<_> = cases
        .iter()
        .map(|c| proportional_tax_rules(&c.taxes, c.total))
        .collect();
    println!("{}", serde_json::to_string(&out).unwrap());
}
