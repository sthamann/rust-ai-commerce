# src/staging

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`assets.rs`](assets.rs): Binary assets are immutable, staged independently through metadata/digest units; paid entitlements never clone.
- [`categories.rs`](categories.rs): Category release units and dependency-ordered tree publication; stock is never part of a catalog release.
- [`clone.rs`](clone.rs): Clone only catalog/configuration into a private tenant; customer/order/payment state is excluded.
- [`company.rs`](company.rs): Selective company identity release copies only linked immutable logo bytes and validates the final company aggregate.
- [`documents.rs`](documents.rs): Knowledge documents/chunks clone and publish with their source provenance; publication visibility is a reviewed unit.
- [`mod.rs`](mod.rs): Private cloned shops, scope admission and selective atomic release of reviewed changes.
- [`release.rs`](release.rs): Selected units publish in one transaction with staged digests and live baseline conflict checks.
- [`snapshot.rs`](snapshot.rs): Fixed publishable units: product content/translations, settings, experience and app packages.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.

`company.rs` adds independent `company` / `company-channel:{id}` release units with linked logo copying, digest deduplication, validation and a canonical live baseline.
