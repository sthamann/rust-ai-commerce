# SaaS scalability: bounded work, independent cells, measured economics

This is a proposed implementation roadmap, based on repository commit
`0de4c3bb24ecbbb8181a745fa6d2ab9d14fd0258`. It does not claim that million-product
catalogs, thousands of tenants or the load targets below have been demonstrated.
The [current benchmark](benchmarks.md) measures a local prototype, not production
capacity or superiority to another platform.

The three workloads need different solutions:

| Workload | Main pressure | First architectural response |
| --- | --- | --- |
| Thousands of small shops | Fairness, provisioning, shared resources | Pool shops in independently operated cells with per-tenant quotas |
| One shop with millions of products/variants | Unbounded reads, import and index size | Bounded queries, incremental projections and dedicated capacity where necessary |
| Huge traffic or a flash sale | Cache misses, write contention, hot inventory | Edge caching, bounded admission and short correct purchase transactions |

Adding HTTP replicas alone does not remove a shared database bottleneck or
parallelize writes to the same inventory record.

## 1. Remove work proportional to the whole shop

The current [catalog endpoint](../src/catalog_routes.rs) loads and serializes all
root products. [Product detail](../src/commerce/detail.rs) calls `sku_products`,
which loads the complete SKU catalog before selecting one product family.
[Merchant overview](../src/studio.rs) includes all root products and computes order
aggregates on demand. The cart path already loads only relevant SKUs and parents;
preserve that improvement.

Implement server-side filtering and cursor pagination with a hard maximum page
size. Product detail must fetch only the selected SKU, parent and a bounded page
of variants, translations and applicable pricing rules. Index the actual filter
and sort combinations; use query plans to decide additional indexes. Avoid an
exact full-catalog count on every page. Publish incremental dashboard aggregates
instead of scanning historical orders per dashboard request.

Acceptance: a page or product-detail request does not materialize the entire
catalog; returned rows and application memory remain bounded as the catalog grows
from 1,000 to 1,000,000 products. Prices and variant selection still pass the
existing correctness checks.

## 2. Make HTTP capacity independent of background work

[Bootstrap](../src/bootstrap.rs) runs migrations and synchronizes every tenant's
root products into the knowledge graph. It also loads and compiles tenant
policies. A new HTTP replica therefore performs work proportional to stored data.
Use a dedicated migration job and resumable incremental projection jobs; HTTP
readiness must not require scanning every shop. Load tenant configuration lazily
through bounded, versioned caches.

Process roles already exist in [workers](../src/workers.rs), but the `http` role
also runs the memory/outbox loop. Separate serving, projection, payment, app and
inference resources explicitly. Bound queue admission and concurrency by both
tenant and cell. Budget database connections across the deployment: 100 replicas
with 20 connections each can request 2,000 connections to the same database.
Validate connection-pooler compatibility with AGE setup, prepared statements and
transaction-scoped tenant context before introducing one.

[Channel tracking](../src/studio.rs) currently starts a task that updates one
shared tenant/channel counter row for every request. Batch best-effort diagnostic
metrics outside the transactional commerce database. Never apply that lossy
policy to orders, payment records or billable business events.

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

[Reindex](../src/agent.rs) currently loads the catalog, rejects more than 100 root
products and embeds products sequentially. Replace this with streaming batches,
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

1. Bound catalog/detail/dashboard work, remove per-read database counters, and
   isolate HTTP startup/resources. Validate one million products in one cell.
2. Add correct cache invalidation, short inventory transactions, tenant quotas
   and incremental import/search pipelines. Measure cell capacity and economics.
3. Operate two to four cells, test tenant movement, failures and restoration.
   Only then scale the documented fleet toward the many-shop and surge targets.

The potential advantage is efficient, predictable execution of complex commerce
and isolated extensibility. Establish it with cost, correctness and tail-latency
measurements before claiming to outperform Shopify or another production system.
