//! Batch original-PHP numeric-rule comparison transport.
use serde_json::{Value, json};
use std::io::{self, Read};
fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let cases: Vec<Value> = serde_json::from_str(&input).unwrap();
    let out = cases
        .iter()
        .map(|v| {
            match rust_ai_commerce::rule_comparison::numeric(
                v["item"].as_f64(),
                v["rule"].as_f64(),
                v["operator"].as_str().unwrap(),
            ) {
                Ok(b) => json!(b),
                Err(_) => json!({"error":true}),
            }
        })
        .collect::<Vec<_>>();
    println!("{}", json!(out));
}
