# src/assets

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`download.rs](download.rs): Public attachments honor sales-channel visibility; downloads require a paid, owned order snapshot.
- [`mod.rs](mod.rs): Product attachments and paid digital downloads: bounded binary persistence and tenant/account ACL.
- [`rich.rs](rich.rs): Safe structured rich content, never executable HTML. Same schema for merchant API and frontend.
- [`upload.rs](upload.rs): File admission, immutable bytes and explicit publishing; binary content never enters merchant list responses.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
