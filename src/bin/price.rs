//! Batch price fixture transport for the original-PHP differential comparator.
use rust_ai_commerce::pricing::{PriceInput, calculate};
use std::io::{self, Read};
fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let cases: Vec<PriceInput> = serde_json::from_str(&input).unwrap();
    println!(
        "{}",
        serde_json::to_string(&cases.iter().map(calculate).collect::<Vec<_>>()).unwrap()
    );
}
