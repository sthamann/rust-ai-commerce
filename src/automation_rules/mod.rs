//! Source-named rule registry and checked evaluation; absent required facts are errors, including under NOT.
use serde_json::{Value, json};
mod comparison;
mod containers;
mod evaluation;
mod fields;
mod time;
mod validation;
pub use evaluation::evaluate;
pub use validation::validate;
pub fn catalog() -> &'static Value {
    static CATALOG: std::sync::OnceLock<Value> = std::sync::OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../reference/automation-registry.json"))
            .expect("checked source registry")
    })
}
pub fn definition(name: &str) -> Option<&'static Value> {
    catalog()["conditions"]
        .as_array()?
        .iter()
        .find(|r| r["type"] == name)
}
fn fact<'a>(facts: &'a Value, path: &str) -> Result<&'a Value, String> {
    path.split('.').try_fold(facts, |v, key| {
        v.get(key)
            .ok_or_else(|| format!("Missing server fact: {path}"))
    })
}

#[cfg(test)]
mod tests;
