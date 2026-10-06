# src/platform

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`auth.rs`](auth.rs): Independent platform authorization: live personal sessions, current grants, no integration/bootstrap escalation.
- [`bootstrap.rs`](bootstrap.rs): Offline first-operator setup: migration-only process, supplied strong credentials, password proof for existing accounts.
- [`metrics.rs`](metrics.rs): Aggregate-only control-plane reads: real tenants, bounded pages, explicit currencies and simulated/confirmed amounts.
- [`mod.rs`](mod.rs): Global SaaS control plane: operator-only aggregate statistics and audited shop provisioning.
- [`provision.rs`](provision.rs): Operator shop creation commits ownership, settings and audit atomically; never issues another user's credentials.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
