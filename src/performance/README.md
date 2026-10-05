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
