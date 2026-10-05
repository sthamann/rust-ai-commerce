//! JSON batch transport for comparisons with original Shopware rule classes; not a production authority endpoint.
use serde_json::{Value, json};
use std::io::{self, Read};
fn main() {
    let mut s = String::new();
    io::stdin().read_to_string(&mut s).unwrap();
    let cases: Vec<Value> = serde_json::from_str(&s).unwrap();
    println!(
        "{}",
        json!(
            cases
                .iter()
                .map(|c| {
                    match vendune::automation_rules::evaluate(
                        c["name"].as_str().unwrap(),
                        &c["config"],
                        &c["facts"],
                    ) {
                        Ok(v) => json!(v),
                        Err(e) => json!({"error":e}),
                    }
                })
                .collect::<Vec<_>>()
        )
    );
}
