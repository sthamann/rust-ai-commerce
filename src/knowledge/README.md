# src/knowledge

Tenant-scoped PostgreSQL knowledge relations and a rebuildable private Qdrant search index.

- `relations.rs`: Canonical SQL joins and transactional relationship provenance.
- `search.rs`: Vector candidates hydrated from current authoritative commerce rows.
- `vectors.rs`: Model-isolated Qdrant collections and durable index synchronization.

The [source inventory](../../docs/module-inventory.md) is checked in CI.
