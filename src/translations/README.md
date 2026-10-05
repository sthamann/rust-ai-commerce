# Durable catalogue translation jobs

`routes.rs` owns authorized creation, paginated reads and resume/cancel. `worker.rs`
leases and translates one product per step. `fields.rs` extracts/validates only
human text without changing links or structure. `apply.rs` checks product revisions
and commits at most 50 drafts under configuration/job/product locks. `mod.rs` wires
HTTP routes and worker exports. All state is tenant-scoped PostgreSQL data from
migration 028. HTTP and MCP delegate to the same native handlers.

See [international commerce](../../docs/international-commerce.md) for provider
setup, language inheritance, endpoints, tested failure cases and precise limits.
`translations.py` tests all three provider wire adapters using a loopback fixture,
restart, conflict, idempotency and cross-tenant/permission rejection; no paid calls.
