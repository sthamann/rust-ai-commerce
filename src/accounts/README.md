# src/accounts

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`address_store.rs](address_store.rs): Tenant-owned address persistence, optimistic revisions and atomic default assignment.
- [`addresses.rs](addresses.rs): Store API address book uses independent customer sessions, never merchant credentials.
- [`contacts.rs](contacts.rs): Customer-editable contact fields; identity, price group and privileges remain server-owned.
- [`demo.rs](demo.rs): Public synthetic customer fixture for newly provisioned demo shops; never fills real customer addresses.
- [`metadata.rs](metadata.rs): Standard customer read fields and indexed order metrics are derived from authoritative records.
- [`mod.rs](mod.rs): Independent customer sessions, profile/password management and owning-account order history.
- [`order_snapshot.rs](order_snapshot.rs): Checkout-owned immutable customer and address records; future account edits cannot rewrite an order.
- [`profile.rs](profile.rs): Typed customer-owned profile updates; price groups, email and merchant roles cannot be self-assigned.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.

`address_restore.rs` rebuilds the owning customer address book through current geography/ownership checks. Account history excludes credentials. See [entity history](../../docs/entity-history.md).
