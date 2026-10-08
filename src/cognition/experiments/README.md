# Native controlled experiments

`mod.rs` owns authorized lifecycle transitions and the actual native consent-bound
layout assignment. `model.rs` validates immutable preregistrations and conservative
bounded-outcome intervals. `report.rs` and `report.sql` read the canonical live
payment/refund ledger, save one mature report and project it into existing
knowledge relations/outbox events. No separate analytics or payment store exists.

See [the contract and assumptions](../../../docs/cognitive-commerce.md). Rust unit
tests, the registered `cognitive_experiments` HTTP/PostgreSQL suite and the native
experiment-result Lean predicate cover distinct boundaries. Synthetic receipt
fixtures do not establish a real causal commerce effect.
