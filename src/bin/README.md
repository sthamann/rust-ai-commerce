# src/bin

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`automation_rules.rs`](automation_rules.rs): JSON batch transport for comparisons with original Shopware rule classes; not a production authority endpoint.
- [`context.rs`](context.rs): Bounded ports of original language-chain, rule priority and quantity selection.
- [`delivery.rs`](delivery.rs): Batch proportional-tax fixture transport for the original-PHP comparator.
- [`price.rs`](price.rs): Batch price fixture transport for the original-PHP differential comparator.
- [`rules.rs`](rules.rs): Batch original-PHP numeric-rule comparison transport.
- [`verified_kernel.rs`](verified_kernel.rs): Generated conformance driver; invokes the same production policy functions as the commerce server.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
