# src/cognition

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`context.rs`](context.rs): Bounded localized catalog retrieval before inference; full catalog size never expands the prompt.
- [`mod.rs`](mod.rs): Evidence-based shop memory: event receipts, observed pairs, reviewable hypotheses and bounded context.
- [`projection.rs`](projection.rs): Exactly-once local observation projection; associations retain order/event evidence and simulation labels.
- [`recommendations.rs`](recommendations.rs): Merchant-approved associations are consumed by the public shop without exposing order counts or identities.
- [`routes.rs`](routes.rs): Merchant memory endpoints and revision-bound experiment/dismissal decisions.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
