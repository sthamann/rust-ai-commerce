# Fast commerce reads and a scalable database boundary

Rust removes PHP runtime overhead; it cannot remove a network round trip, an
unbounded query or a contended database row. Vendune's fast path therefore reuses
immutable decoded context, reduces SQL statements, bounds work and preserves
authoritative purchase decisions. This document separates delivered changes
from the next architecture stages.

## Delivered

| Layer | Behavior | Correctness boundary |
|---|---|---|
| Request context | One settings/language read per scope in an explicit read request; up to eight tenant/channel contexts | No request memoization around write routes or checkout completion; explicit MCP read tools share the same implementation |
| Rust decoded cache | Settings by tenant + sales channel; global language registry; LRU eviction, 256 settings entries, 32 MiB serialized-size-based weight budget | Every new request probes the authoritative primary version; no time-based stale allowance |
| Atomic version check | One SQL statement checks base/override versions and channel existence; unchanged JSON is not returned | UUID identity changes within the write transaction, including direct SQL, restore and delete/recreate |
| Pure read settings | No `BEGIN`, `FOR SHARE`, `COMMIT` around a public configuration preview | Locked transactional settings resolution remains in order placement and mutation paths |
| Browser transport | Identical simultaneous core reads share one request in Studio and storefront | Full tenant, channel, locale, cart, customer and merchant identity in the key; no completed-response cache; mutation admission barriers |
| Static frontend | Fingerprinted JS/CSS gets immutable one-year browser caching; shell revalidates | Dynamic API responses default to `no-store`; existing explicit image/app policies remain intact |
| SQL pool | Validated max/min connection count and queue deadline per process; overload returns HTTP 503 | A deployment must budget all HTTP replicas and workers together |

The cache's byte budget is an estimate based on serialized payload size, not a
proof of exact allocator/RSS usage. Cold concurrent misses can duplicate decoding;
there is no distributed single-flight mechanism. Actual query execution, not
cache membership, determines channel existence on every new request.

Migration [037](../migrations/037-read-context-cache.sql) stamps basis/override rows
before every insert/update. The global language registry changes version on actual
inserts, updates, deletes and truncation. Conflict-only registration does not
invalidate the fleet or lock the global version row. Cache state is local to one
process and discarded on restart; replicas need no invalidation subscription to
observe a committed change. The SQL statement uses PostgreSQL's
[MVCC snapshot](https://www.postgresql.org/docs/current/mvcc-intro.html).

Within an admitted read request the first loaded context is reused. A concurrent
change is observed by the next request; this is not a whole-request transactional
snapshot of products, carts and every other table. Stock, prices and orders are
not response-cached. Checkout validates current canonical data under its existing
transaction and locks. Authentication, membership, revocation and app action
permissions continue to use their current checks.

## Local matched result, 5 October 2026

Median of each workload's three round-level p95 values; SQL counts include
transaction statements and exclude the asynchronous diagnostic counter write.
The before/after JSON responses are identical. All 7,200 timed requests completed
and validated without an error.

| Workload | SQL statements before / after | p95 before / after | p95 reduction |
|---|---:|---:|---:|
| storefront-list | 10 / 5 | 57.47 / 28.61 ms | 50.2% |
| storefront-detail | 23 / 13 | 112.76 / 63.20 ms | 44.0% |
| admin-catalog | 13 / 8 | 72.57 / 41.99 ms | 42.1% |
| mcp-catalog | 10 / 5 | 53.91 / 33.20 ms | 38.4% |

[Raw samples, hashes and scope](assets/read-performance-2026-10-05.json).
The after build was measured from the recorded working tree; its source-tree
digest is retained. SQL tracing was enabled for separate statement counts and
disabled during timing. These figures measure the shared backend path, not
browser rendering, AI latency or relative Shopware performance.

## Configuration and reproduction

```dotenv
DB_POOL_MAX=20
DB_POOL_MIN=0
DB_POOL_WAIT_MS=5000
READ_CONTEXT_CACHE=true
```

Set `READ_CONTEXT_CACHE=false` to disable decoded caches and request memoization.
The SQL read optimization still works without a cache. The pool deadline bounds
waiting for a connection; it does not cancel every executing SQL statement or
provide tenant fairness. A pool maximum of one can serve serial reads but is
inappropriate for paths holding a transaction while acquiring another connection.

`/api/runtime` exposes aggregate cache/pool diagnostics only to the existing
instance bootstrap credential when bootstrap authentication is enabled. Personal
merchant sessions receive `performance: null`, preserving fleet activity privacy.
Public production hosting disables that credential; operator metrics integration
is a separate remaining task.

Run the real two-replica regression against a disposable database:

```sh
python3 scripts/verify_integration.py --container vendune-postgres-1 --only read_performance
```

It checks committed writes, overrides and deletion, settings delete/recreate
without a revision bump, transaction rollback, language registration, unchanged
conflict inserts, tenancy, immediate membership revocation, cache-disabled mode,
cold process restart, HTTP cache policies and overload/recovery with a one-slot
pool. It contacts no model or payment provider and sends no external messages.

Optional baseline measurement: retain an original binary and its exact source
commit before building the change, then run the same script with:

```sh
PERFORMANCE_BASELINE_BIN=/absolute/path/to/before-binary \
PERFORMANCE_BASELINE_REF=original-source-commit \
python3 scripts/verify_integration.py --container vendune-postgres-1 --only read_performance
```

The baseline must support the same business contract and be built with the same
profile. Reports include binary/source hashes, all raw samples, SQL statement
counts measured separately from latency, and equal-response fingerprints.
Local probes use six synthetic root products, three rounds of 300 requests per
workload, 16 clients, debug binaries and a shared local PostgreSQL instance.
They are a closed-loop comparison, not a saturation or production capacity test.
The [million-product benchmark](benchmarks.md) is a separate prior measurement;
do not transfer the small-fixture percentage improvement to that dataset.

## Next architecture stages

1. **Incremental read models.** Publish per-tenant/day/channel order and support
   aggregates through the durable outbox instead of scanning the full order
   history whenever a dashboard opens. Keep idempotent event IDs, replay/rebuild,
   an exposed update watermark and a canonical drill-down path. The knowledge
   workspace uses bounded evidence retrieval; graph/vector projections do not
   replace transactional product or payment authority.
2. **Versioned public content projections.** Separate descriptions/media/category
   content from live stock and customer-specific pricing. An edge cache key must
   include tenant/domain, channel, effective locale, currency and relevant
   content/app/configuration revisions. Never place personalized B2B responses,
   cart tokens or private knowledge in a public cache. Content invalidation comes
   from committed events; cache failure falls back to the origin. No such public
   response cache or distributed invalidation layer is delivered by this change.
3. **One fleet connection budget.** Keep PostgreSQL as the transactional primary;
   avoid multiplying connections indefinitely with Rust replicas. For example,
   four HTTP replicas with 12 connections and three workers with four connections
   reserve 60 application connections, before operator/setup/failover headroom.
   A shared pooler is a deployment option, not an automatic speed improvement.
   Validate prepared statements, session `SET` values and advisory locks against
   the [PgBouncer mode compatibility table](https://www.pgbouncer.org/features.html).
   Existing setup uses a dedicated session; do not route migration/session-lock
   work through an untested transaction pooler.
4. **Fair admission and independent cells.** Bound per-tenant in-flight work and
   queue length at the gateway; preserve separate checkout and AI/background
   budgets. Distribute shops into independently operated PostgreSQL/Rust/search
   cells; grant very large shops dedicated capacity. Partition event/order history
   by measured access/retention needs. PostgreSQL
   [partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
   does not itself distribute writes across machines. Tenant movement requires
   copy/catch-up, single-writer fencing and tested cutover/restore.
5. **Optional shared cache when measured useful.** A self-hosted Valkey cache can
   share public projections and burst protection across replicas. Keep durable
   authority in PostgreSQL and define miss/failure behavior. The
   [Valkey cluster design](https://valkey.io/topics/cluster-spec/) documents
   asynchronous replication and possible acknowledged-write loss: do not use it
   as the sole order, inventory or payment ledger. It is proposed, not installed.
6. **Measure the full buyer/admin path.** Track DB wait vs execution, per-route
   p95/p99, payload/serialization costs, cache hit/miss, outbox lag, browser
   navigation-to-content and retained component requests. Run release builds at
   fixed arrivals against realistic million-product/many-tenant data, then
   import/slow-app/AI interference and failure cases. The current frontend already
   splits workspaces; its rich editor and shared language bundles still need
   bundle-specific profiling. No browser navigation latency improvement was timed
   in the API probe.

See [the broader scalability plan](scalability.md) for the fault-isolation, inventory,
backup and cost contract. Async cache/SQL correctness is tested here; the existing
Lean policy extraction does not prove database, browser or distributed behavior.
