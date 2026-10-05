# SaaS scalability: bounded work, independent cells, measured economics

The first delivery stage is implemented: bounded catalog/detail/overview reads,
server-side localized filtering, cart-sized edit/preview reads, batched diagnostic
counters, versioned setup and a pure HTTP process role. A real local database with
**1,000,000 synthetic root products and 1,000,000 German translations** is used for
[the reproducible measurement](benchmarks.md). This demonstrates the measured
requests on one local database; thousands of tenants, production capacity and the
fleet load targets below remain proposed work.

The following sections distinguish delivered work from the remaining roadmap.

**Read-context update:** [version-checked settings/language caches](read-performance.md)
now reduce repeated SQL in HTTP, MCP and Studio, preserve cross-replica freshness,
and expose configurable connection budgets. Browser in-flight request sharing and
fingerprinted asset caching are also delivered. Public catalog response caches,
fleet poolers, per-tenant admission and historical dashboard projections remain
the following stages, with separate capacity measurements required.

The three workloads need different solutions:

| Workload | Main pressure | First architectural response |
| --- | --- | --- |
| Thousands of small shops | Fairness, provisioning, shared resources | Pool shops in independently operated cells with per-tenant quotas |
| One shop with millions of products/variants | Unbounded reads, import and index size | Bounded queries, incremental projections and dedicated capacity where necessary |
| Huge traffic or a flash sale | Cache misses, write contention, hot inventory | Edge caching, bounded admission and short correct purchase transactions |

Adding HTTP replicas alone does not remove a shared database bottleneck or
parallelize writes to the same inventory record.

## 1. Remove work proportional to the whole shop

The [catalog endpoint](../src/catalog_routes.rs) now returns a default page of 50
root products, with an enforced maximum of 100 and a product-ID cursor. Search
and category filters run on the server before pagination, including field-level
language fallback. Search candidates use trigram indexes; common and rare search
terms receive custom query plans and application connections disable PostgreSQL
JIT compilation for this short OLTP workload.

[Product detail](../src/commerce/detail.rs) reads the selected SKU, parent and a
bounded variant page; deep-linked variants and family-wide reviews are retained.
Cart edits, cart reads and individual price previews fetch their referenced SKUs.
[Merchant overview](../src/studio.rs) limits product rows and explicitly identifies
page-scoped stock indicators. Storefront paging and variant loading use the same
server contract. The response `total` is null when an exact whole-catalog count
would require extra work; clients use `hasMore` and `nextCursor`.

**Remaining:** order/review aggregates can still scan history; publish incremental
read models. Cursor traversal is live, not a snapshot under concurrent imports.
Very short substring searches or rare unmatched fallback phrases can still scan
many candidates in PostgreSQL even though returned rows and application memory
are bounded. Measure these separately before promising arbitrary-search SLOs.

Acceptance: a page or product-detail request does not materialize the entire
catalog; returned rows and application memory remain bounded as the catalog grows
from 1,000 to 1,000,000 products. Prices and variant selection still pass the
existing correctness checks.

## 2. Make HTTP capacity independent of background work

[Bootstrap](../src/bootstrap.rs) now separates `BOOTSTRAP_MODE=migrate` (setup and
exit) from `serve` (check readiness and serve, without DDL or seed scans). `auto`
preserves simple local development. A checksum ledger and serialized setup job
apply schema changes once; the demo graph seed covers only the 12 fixed demo roots.
Only the two demo policies are compiled eagerly. The existing policy path loads
other tenants lazily and checks persisted policy changes.

[Process roles](../src/workers.rs) now keep `http` separate from the memory/outbox,
payment and app workers. Run the memory worker explicitly for projections and
app-event production. The default `all` remains useful locally. Diagnostic
channel counters use one bounded buffer (1,024 tenant/channel keys), one bulk
write per second and a one-second write timeout. They can be dropped on failure
or buffer overflow; orders and payment events remain durable. Counters still
use PostgreSQL, so export them to a dedicated metrics system for production.

**Remaining:** per-tenant admission, connection budgets across replicas, bounded
versioned tenant-policy caches, resumable catalog/AI projection jobs and resource
isolation under competing workloads. `DB_POOL_MAX` is now configurable per process;
its default 20 connections are still not a fleet-wide budget. Validate pooler
compatibility with AGE and prepared statements.
The initial 014 migration builds indexes transactionally; plan its upgrade window
for an existing large database. It is not an online index build.

The [app runtime cache](../src/apps/runtime.rs) clears all entries when its size
reaches 64 and compiles while holding its cache mutex. Replace this with bounded
weighted eviction and one compilation per module digest outside the global
lock. Reuse compiled modules where engine configuration permits, and compile
approved versions before activation. Fuel and memory limits remain necessary.

Acceptance: cold HTTP startup does not traverse catalog data; a bulk import or
slow app cannot consume all serving connections, CPU or inference slots.

## 3. Serve reads cheaply; keep purchase decisions authoritative

Cache public storefront pages and product projections at the edge. Cache identity
must cover tenant/domain, locale, currency, public price context and relevant
content/configuration/app versions. Keep personalized carts and private B2B
prices in authorized private paths. Invalidation is driven by committed events,
with a measured freshness bound and a fallback on cache failure.

Separate product content, prices and inventory revisions so every stock decrement
does not invalidate otherwise unchanged descriptions and media. Public stock
indications may be bounded-stale; checkout always validates current price,
eligibility and available inventory against the authoritative writer.

Use an object store and CDN for media rather than pushing large assets through
the commerce process. Measure hit and miss paths separately, including a cold
cache and invalidation bursts.

## 4. Scale shops through independent cells

Keep a modular Rust commerce core inside each cell, with its own transactional
PostgreSQL capacity, caches, search projections and bounded workers. A small
control plane owns tenant placement, domains, plans, quotas and provisioning.
Routing uses cached, versioned tenant placement rather than a control-plane
database lookup for every request.

Small tenants share cells. Large catalogs and high-traffic shops can receive
dedicated cells. Each cell has measured capacity limits and operational headroom;
add cells when those limits are approached. A cell failure must not consume the
resources of unrelated cells. Tenant moves need a tested copy/catch-up protocol,
single-writer fencing, a routing-version cutover and rollback behavior.

This follows the fault-isolation principle described in
[AWS's cell architecture guidance](https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/reducing-scope-of-impact-with-cell-based-architecture.html).
Shopify has also described assigning subsets of shops to independent database
pods and moving shops between them in its
[shard-balancing article](https://shopify.engineering/mysql-database-shard-balancing-terabyte-scale).
These sources support the architecture pattern, not a claim of equal capacity.

## 5. Protect checkout correctness while removing contention

[Checkout](../src/order_checkout.rs) already has cart/product locks, scoped
idempotency and a durable outbox. [Payment workers](../src/payments/worker.rs)
already use leases, generation checks and external calls outside their claim
transaction. Preserve these foundations.

Move reward/statistical counter updates from the purchase transaction into
idempotent projections. Keep app compilation and slow external work outside
inventory locks. Separate inventory storage from catalog content and keep the
stock-changing transaction short. Extend explicit reservation and release rules
for production payment outcomes and expiration.

A flash sale for one SKU remains a single-inventory contention problem, even
after shops are distributed across cells. First measure contention with short
transactions and bounded admission. If necessary, allocate bounded inventory
reservations to multiple buckets/workers using a durable allocation ledger and
fenced ownership. Do not introduce that complexity before demonstrating the
bottleneck. Global browsing can use local caches; each inventory partition needs
an authoritative write region and tested failover without two active writers.

Acceptance: zero overselling, duplicate accepted orders or duplicate payment
effects under retries, worker crashes, reservation expiration and failover.

## 6. Make large imports and AI incremental

[Reindex](../src/agent.rs) reads at most 101 root products, rejects more than
100 and embeds products sequentially. The bounded guard avoids materializing a
million-product catalog, but does not implement million-product AI indexing. Replace this with streaming batches,
resumable jobs and per-tenant budgets. Bulk imports need staging, validation,
bounded database batches and a versioned publication step. Rebuild only changed
documents and model versions; avoid redundant embeddings for identical variant
descriptions within their authorized scope.

[Semantic retrieval](../src/knowledge.rs) uses exact tenant-filtered vector
ranking. At scale, evaluate tenant-aware ANN indexes or search partitions before
introducing a separate search service. A shared ANN index can change another
tenant's recall and latency; measure both relevance and isolation. The
[pgvector documentation](https://github.com/pgvector/pgvector#multitenancy)
describes this interaction and the speed/recall tradeoff. Validate retrieved
products and current commercial data against the tenant's authoritative records.

One million 1,024-component float32 embeddings alone contain about 4.096 GB of
numeric payload, before row, index and replica overhead. Compression is an
experiment with a relevance acceptance criterion, not a free capacity claim.
AI conversations and recommendations need bounded retrieval contexts and durable
cancellable jobs; model calls must not monopolize serving database connections.

Keep the existing outbox with `SKIP LOCKED` initially. Add fair scheduling, retry
backoff, poison-event quarantine and replay support. Change queue technology only
when measured requirements exceed this design.

## 7. Add the SaaS operating contract

Derive a trusted tenant context from verified membership or domain routing.
Enforce it in queries, caches, search, jobs and storage. Add core-table RLS with
a least-privileged database role as defense in depth; test transaction-scoped
context for leakage under pooling. Existing tenant checks and managed-app RLS
do not yet provide core-wide RLS.

Implement idempotent provisioning, domain lifecycle, secret management, plan
limits, durable usage accounting, audit/export/offboarding and per-tenant restore.
Operate with tested backups/PITR, online schema changes, multi-zone recovery and
explicit RPO/RTO targets. Include these costs in efficiency comparisons. Define
separate serving, background-job and search freshness SLOs; track queue age,
tail latency, lock time, correctness and resource consumption per tenant.

## 8. Prove capacity and economics

The following are proposed test populations and goals, not measured capability:

| Test | Population/load | Decisive observation |
| --- | --- | --- |
| Large catalog | One shop, 1M products/SKUs, realistic variants, prices and languages | Bounded detail/listing memory, search recall, import/index throughput |
| Many shops | 10,000 shops with a documented skewed size distribution | Provisioning, quota fairness, placement and cost per active shop |
| Read surge | Step toward 100,000 public reads/s across a stated cell fleet | Edge hit/miss latency, origin capacity and total cost |
| Purchase surge | Step toward 1,000 accepted orders/s across that fleet, plus a separate hot-SKU case | Durable throughput and p99; no overselling or duplicate effects |
| Interference/failure | Bulk import, slow app, cold cache, worker crash and cell/database failure | Other tenants' SLOs, backlog recovery, RPO/RTO |

Start with fixed-cost, fully specified hardware and a separate load generator.
Use fixed arrival rates so a slowing server does not silently reduce offered
traffic. Record achieved throughput, errors, p50/p95/p99, payloads, cache ratios,
connection reuse, stock distributions and all correctness failures. Run sustained
load, bursts and a soak; report warm and cold paths separately.

Candidate initial service goals are regional product-page API p95 below 50 ms
and p99 below 100 ms for at most 50 returned items, and internal durable order
placement p95 below 150 ms. These need validation under a specified price/app
workload and offered load. They exclude buyer network time and external payment
authorization; report full buyer-visible checkout separately.

Compare total cost per million correct requests and per accepted durable order,
including databases, replicas, CDN/egress, workers, search and AI. Compare equal
business behavior and recovery requirements. Shopify Admin API quotas are not
storefront capacity; the
[official limits documentation](https://shopify.dev/docs/api/usage/limits)
distinguishes them. Shopify's
[BFCM readiness report](https://shopify.engineering/bfcm-readiness-2025)
also describes broad load and resilience testing. Any direct platform comparison
must use an authorized test setup and disclose what cannot be measured externally.

## Recommended delivery sequence

1. Delivered: bound catalog/detail and overview product rows, batch per-read
   counters, isolate HTTP startup, and measure a synthetic million-product catalog.
   Still needed in this stage: historical dashboard read models and interference tests.
2. Delivered for decoded settings/languages: authoritative version invalidation;
   next add public projection caches, short inventory transactions, tenant quotas
   and incremental import/search pipelines. Measure cell capacity and economics.
3. Operate two to four cells, test tenant movement, failures and restoration.
   Only then scale the documented fleet toward the many-shop and surge targets.

The potential advantage is efficient, predictable execution of complex commerce
and isolated extensibility. Establish it with cost, correctness and tail-latency
measurements before claiming to outperform Shopify or another production system.
