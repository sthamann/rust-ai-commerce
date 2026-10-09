# src/categories

Tenant-bound category administration and public category navigation. `admin.rs` owns translated schemas, revisions, parent validation and cycle-safe writes. `graph_query.rs` validates closed, enabled-language saved fact predicates. `navigation.rs` owns active channel-root admission and visible ancestry. `listing.sql` unites manual assignments with current confirmed public document-backed claims before channel/product pagination. `mod.rs` exposes HTTP/MCP handlers, product assignment validation and independent shop provisioning.

Migration 077 indexes reviewed type/confidence and literal phrase candidates. Query definitions remain category data and use the same history and staging owner. Source withdrawal is checked during each listing, not delayed behind a second projection. The predicate is one hop, not an arbitrary graph program or model call. Native regression includes `scripts/testing/intent_navigation.py` through `catalog_management`.

Migration 026 defines composite tenant FKs; staging clones and publishes category units through `staging/categories.rs`. [Behavior/source map and exact limits](../../docs/product-management.md). Actual regression: `python3 scripts/catalog_management.py`; Rust validation tests: `cargo test`. These adapters are explicitly unproved in the formal manifest.
