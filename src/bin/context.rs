//! Bounded ports of original language-chain, rule priority and quantity selection.
use serde_json::{Value, json};
use std::io::{self, Read};
use vendune::context::{Language, Tier, fix_quantity, language_chain, select_tier};
fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let cases: Vec<Value> = serde_json::from_str(&input).unwrap();
    let out=cases.iter().map(|c|match c["kind"].as_str().unwrap(){
  "language"=>{let available:Vec<String>=serde_json::from_value(c["available"].clone()).unwrap();let languages:Vec<Language>=serde_json::from_value(c["languages"].clone()).unwrap();match language_chain(c["current"].as_str().unwrap(),&available,&languages){Ok(v)=>json!({"chain":v}),Err(e)=>json!({"error":e})}},
  "tier"=>{let tiers:Vec<Tier>=serde_json::from_value(c["tiers"].clone()).unwrap();let rules:Vec<String>=serde_json::from_value(c["rules"].clone()).unwrap();json!({"discount":select_tier(&tiers,&rules,c["quantity"].as_u64().unwrap() as u32).map(|t|t.discount)})},
  "quantity"=>json!({"quantity":fix_quantity(c["min"].as_i64().unwrap(),c["current"].as_i64().unwrap(),c["steps"].as_i64().unwrap())}),
  _=>panic!("unknown case")}).collect::<Vec<_>>();
    println!("{}", json!(out));
}
