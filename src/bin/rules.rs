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
            let op = v["operator"].as_str().unwrap();
            let strings = |value: &Value| {
                value.as_array().map(|a| {
                    a.iter()
                        .map(|x| x.as_str().map(String::from))
                        .collect::<Vec<_>>()
                })
            };
            let result = match v["kind"].as_str().unwrap_or("numeric") {
                "string" => rust_ai_commerce::rule_comparison::string(
                    v["item"].as_str(),
                    v["rule"].as_str().unwrap_or(""),
                    op,
                ),
                "stringArray" => rust_ai_commerce::rule_comparison::string_array(
                    v["item"].as_str(),
                    &v["rule"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|s| s.as_str().unwrap().into())
                        .collect::<Vec<_>>(),
                    op,
                ),
                "uuids" => rust_ai_commerce::rule_comparison::uuids(
                    strings(&v["item"]).as_deref(),
                    strings(&v["rule"]).as_deref(),
                    op,
                ),
                _ => rust_ai_commerce::rule_comparison::numeric(
                    v["item"].as_f64(),
                    v["rule"].as_f64(),
                    op,
                ),
            };
            match result {
                Ok(b) => json!(b),
                Err(_) => json!({"error":true}),
            }
        })
        .collect::<Vec<_>>();
    println!("{}", json!(out));
}
