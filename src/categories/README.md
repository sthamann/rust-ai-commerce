# src/categories

Tenant-bound category administration and public category navigation. `admin.rs` owns translated schemas, revisions, parent validation and cycle-safe writes. `navigation.rs` owns active channel-root admission and visible ancestry. `listing.sql` filters category/subcategory memberships before product pagination. `mod.rs` exposes HTTP/MCP handlers, product assignment validation and independent shop provisioning.

Migration 026 defines composite tenant FKs; staging clones and publishes category units through `staging/categories.rs`. [Behavior/source map and exact limits](../../docs/product-management.md). Actual regression: `python3 scripts/catalog_management.py`; Rust validation tests: `cargo test`. These adapters are explicitly unproved in the formal manifest.
