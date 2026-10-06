# src/payments

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`mod.rs`](mod.rs): Provider-independent payment ledger and durable workers; the PayPal adapter supports explicit Sandbox/Live environments.
- [`operations.rs`](operations.rs): Durable idempotent payment commands, customer context binding and serial refund admission.
- [`paypal.rs`](paypal.rs): Native PayPal Orders v2 sandbox wire adapter; credentials never enter prompts or browser responses.
- [`provider.rs`](provider.rs): Payment provider identity, tenant account configuration and immutable wire context.
- [`receipt_guard.rs`](receipt_guard.rs): Bind integer provider receipt amounts and status to the formally checked exact-match predicate.
- [`return_urls.rs`](return_urls.rs): Provider return/cancel URLs preserve the tenant and sales channel; navigation is never payment evidence.
- [`routes.rs`](routes.rs): Customer payment status/capture and merchant refund operations share the durable command API.
- [`storage.rs`](storage.rs): Transactional provider receipts and order state updates; external responses cannot invent amounts or tenants.
- [`webhooks.rs`](webhooks.rs): PayPal verifies webhook signatures before inbox insertion; provider reconciliation confirms monetary state.
- [`worker.rs`](worker.rs): Leased payment jobs; network runs after claim commit, fenced receipts prevent duplicate local effects.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
