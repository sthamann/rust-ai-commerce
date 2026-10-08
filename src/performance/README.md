# Shared read performance

`mod.rs` owns per-process decoded caches, diagnostic counters and a task-local
context for explicit read requests. No cached response, cart, inventory or identity
is stored. Authorization remains in the existing middleware before read admission.

- `settings.rs` / `settings.sql`: tenant/channel key; one PostgreSQL statement checks
  base and override UUIDs in one MVCC snapshot. Warm reads return only version metadata.
  Read-only requests reuse a decoded snapshot; mutations do not enter that scope.
- `languages.rs`: versioned global language registry shared within a read request.
- `cache.rs`: weighted LRU, bounded entry count and serialized-size-based estimate.
  Eviction never invalidates an already borrowed immutable `Arc`; I/O is outside locks.
- `pool.rs`: validated per-process connection maximum, minimum and queue deadline.
- Migration 037 changes identities on every write. UUIDs survive no cache across
  deletion/recreation. Language triggers also cover registry deletion/truncation.

`commerce::scoped_locked` remains the authoritative locked checkout/mutation read.
`READ_CONTEXT_CACHE=false` disables both decoded caches and request memoization.
Only the instance bootstrap credential sees aggregate counters under `/api/runtime`;
personal merchant accounts cannot inspect other shops' cache activity.

Verification: Rust LRU tests and `scripts/read_performance.py` exercise two actual
Rust/SQL replicas, committed edits, channel overrides, direct SQL, rollback,
language registry changes, tenant isolation, revocation and cold process restart.
These SQL/async behaviors are tested, not covered by the extracted Lean policies.

## Request admission and delivery

- `access_snapshot.rs` / `access_snapshot.sql`: one fresh, server-owned MVCC read
  of domain binding, tenant existence, staging parent, live status and selected
  channel. Middleware reuses it only for the same request and tenant/channel.
  Personal credentials/grants remain a current SQL lookup; their selected channel
  joins that lookup. No domain/status/permission TTL cache is introduced.
- The hosted proxy uses the original admitted mount; a second lookup cannot
  retarget an already admitted request. A subsequent request observes a committed
  pause, deletion, private-channel change or membership revocation.
- `delivery.rs`: only the native public shell and assets skip identity queries.
  Hosted shop assets, scoped uploads, product HTML and previews still pass admission.
  Domain resolution runs before compression classification. Gzip/Brotli opt in
  known secret-free read models; auth, customer, cart/order, payment, MCP/UCP and
  arbitrary hosted HTML stay uncompressed. Streams/ranges/already encoded bodies
  retain their delivery contract; all native variants vary by `Accept-Encoding`.
- `frontend/scripts/precompress.mjs` emits deterministic `.br`/`.gz` sidecars
  during the existing frontend build; URLs, original files and MIME types remain
  unchanged. Precompression requires no running Node or Python service.
- Settings hits return `Arc<Settings>` instead of deep-copying the object.
  Consumers clone only when they actually need a mutable method-filtered copy;
  checkout continues to use the locked authoritative configuration.

The same owner contains decoded caches, delivery and admission; no second read
engine or request-held SQL connection was added. `src/studio/overview.sql`
consolidates facts while `studio.rs` admits at most three concurrent read branches.
Inventory statements live in `commerce/inventory.rs` / `inventory_release.sql`.
SQL/build inputs are review-hash locked but are **unproved adapters**. The
`native_asset_bypass` Boolean policy is extracted to Lean; it does not prove URL
classification, middleware ordering, PostgreSQL or HTTP behavior.

Real regressions: `read_performance`, `channel_management`, `identity_broker`,
`tenant_isolation`, `production_foundations` and `transaction_pooler`; the frontend
precompression test checks round trips, deterministic bytes and stale sidecars.
[Measured scope and reproduction](../../docs/read-performance.md).

`admission::reserve_ai_attempt` is the shared atomic UTC-day attempt owner for
interactive chat/SSE, document extraction (HTTP/MCP/Flow) and background Flow
proposals. Staging uses the live tenant budget. A failed provider attempt is not
refunded; this counts attempts, not tokens or spend. Do not add a process-local
quota counter or a second table to a new AI entry point.
