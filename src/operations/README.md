# src/operations

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`addresses.rs](addresses.rs): Merchant/MCP address operations use identical customer ownership and revision checks to the Store API.
- [`customers.rs](customers.rs): Tenant-scoped paged CRM and revision-checked merchant changes; credentials never leave storage.
- [`mod.rs](mod.rs): Merchant CRM and fulfillment APIs, shared verbatim with MCP operations capabilities.
- [`orders.rs](orders.rs): Bounded order search, token-redacted detail and append-only operational notes.
- [`receipt_pdf.rs](receipt_pdf.rs): Minimal paginated PDF serializer with WinAnsi Helvetica; snapshot retains complete Unicode originals.
- [`receipt_text.rs](receipt_text.rs): Four-language document labels and authoritative snapshot-to-print projection.
- [`receipts.rs](receipts.rs): Idempotent immutable invoices/delivery notes with transactional per-shop number ranges.
- [`workflow.rs](workflow.rs): Revision-bound workflow configuration used by installed apps and selective sandbox releases.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
