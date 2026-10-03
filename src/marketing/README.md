# src/marketing

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`app_flows.rs](app_flows.rs): App flow dispatch uses the same permission/schema gateway as HTTP/MCP, with a stable job key.
- [`catalog.rs](catalog.rs): Native condition metadata, app action/event discovery and source-compatible condition import.
- [`channels.rs](channels.rs): Sales channels share a merchant tenant but bind independent catalog visibility, locale and cart identity.
- [`flows.rs](flows.rs): Durable order-event flows: conditions, shop notes and AI proposals; no unapproved model mutations.
- [`mod.rs](mod.rs): Native rule conditions, coupons, durable flows and headless/storefront sales-channel boundaries.
- [`promotions.rs](promotions.rs): Server-authoritative coupons and automatic campaigns, with deterministic discounts and atomic usage limits.
- [`routes.rs](routes.rs): Typed configuration CRUD, rule preview and revision-bound coupon edits.
- [`rule_fields.rs](rule_fields.rs): Typed rule fields share the original comparison operators and server-derived checkout/event facts.
- [`rule_match.rs](rule_match.rs): Evaluate typed rule trees against server-owned cart, customer and event facts.
- [`rule_tests.rs](rule_tests.rs): Regression cases for native rule facts and original container boundaries.
- [`rules.rs](rules.rs): Bounded Shopware-style boolean/numeric rule AST. Unknown operators/conditions fail closed.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
