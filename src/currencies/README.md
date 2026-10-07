# Currencies

This domain owns currency registry validation (`model.rs`), exact minor-unit FX
and fixed prices (`pricing.rs`), bounded ECB retrieval (`rates.rs`), native routes
(`routes.rs`), durable fixed-price generation (`jobs.rs`) and MCP dispatch
(`capabilities.rs`). `tests.rs` exercises adversarial rates, precision and source
currency preservation. Commerce consumers use the exported resolver; providers
persist the resolved currency and scale. See [the end-to-end guide](../../docs/currencies.md).
