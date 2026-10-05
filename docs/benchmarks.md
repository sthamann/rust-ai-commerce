# Reproduce the million-product commerce measurement

The [published benchmark page](https://sthamann.github.io/vendune/benchmarks.html)
contains the current bounded million-product workloads and the earlier full-catalog
baseline comparison. Raw JSON includes every measured latency, errors, source and
binary metadata. These are local synthetic HTTP/PostgreSQL measurements, not
production capacity or an LLM speed claim. The browser clips are separate feature demonstrations.

## Isolate the database

Use a separate checkout and database. The fixture command deletes products and
translations **only in two newly registered synthetic benchmark shops**. It refuses
the default development container/port. Never point it at a production database.

Requirements: Rust stable 1.96+, Docker, Python 3.10+, Node 22+ for the storefront.
The benchmark itself uses only Python's standard library and Docker's PostgreSQL
client. No model download or payment-provider account is needed.

```sh
export DB_PASSWORD='choose-a-local-benchmark-password'
export MERCHANT_TOKEN='choose-a-local-benchmark-merchant-token'
DB_PORT=15490 docker compose -p rust-commerce-performance up -d --build --wait postgres
export DATABASE_URL="postgres://commerce:${DB_PASSWORD}@127.0.0.1:15490/commerce"
export BIND_ADDR=127.0.0.1:8791
cargo build --release --locked
BOOTSTRAP_MODE=migrate target/release/vendune
BOOTSTRAP_MODE=serve PROCESS_ROLE=http target/release/vendune
```

Keep that server running. In another terminal, in the same checkout:

```sh
python3 scripts/benchmark.py --prepare rust-commerce-performance-postgres-1 \
  --large-products 1000000
python3 scripts/benchmark.py --requests 2000 --rounds 1 --concurrency 16 \
  --arrival-rate 500 --output .run/benchmark.json
```

The fixture file contains credentials and stays in ignored `.run/`, mode 0600.
The report contains no credentials. Keep fixtures identical for a before/after
comparison; do not run `--prepare` again between builds. Stop the old server before
starting the next binary at the same address. Do not build, record video or run
other load tests during the accepted comparison runs.

Commit the source before building and measuring. The report records its revision,
binary hash and script hash. Do not use a partial diff to describe new/untracked
modules. Keep the same dataset and commercial behavior for a before/after test.

Start the independent outbox worker in another terminal with the same private
database environment before measuring:

```sh
BOOTSTRAP_MODE=serve PROCESS_ROLE=memory-worker target/release/vendune
```

The accepted million-product measurement uses these two independent processes.
The worker consumes real committed events during the checkout workload. Diagnostic
counter writes remain enabled. No response cache is added to bypass PostgreSQL.

## What is timed and checked

- Physical fixture: 6 and 1,000,000 root products in separate synthetic shops;
  each root has a German translation. This is not one million simulated URLs.
- Default 50-product cursor pages (the small shop returns 6); product detail;
  localized exact-SKU and common-term substring search; a validated 20-line cart;
  fresh durable order placement. Every endpoint includes actual HTTP and DB work.
- Fixed arrivals of 100 and 500 requests/second, 16 load-generator workers.
  The 100/s run uses 1,000 requests per read and 500 checkouts; the 500/s run uses
  2,000 per read and 1,000 checkouts. These offered rates are not maximum capacity.
  Latency starts at the scheduled arrival, including client queue time. Admission
  is capped at 64 pending client jobs; a client rejection is an error.
- One validated warm-up request per worker per workload, excluded from timing.
  At 100/s, each read lasts about 10 seconds and checkout 5 seconds; at 500/s,
  each read lasts about 4 seconds and checkout 2 seconds. These are bounded probes,
  not a soak or saturation test.
- Every response validates shape, translation, prices or cart totals. Checkouts
  use fresh carts and idempotency keys. Every returned order ID, including 16
  checkout warm-ups in each run, is verified directly in PostgreSQL.
- Timing includes new local HTTP connections, full response reads and JSON
  validation. Python threads share the host with the application and Docker.
- Raw samples retain successful per-request latencies and all failures. Percentiles
  use nearest rank. A failed warm-up aborts the run; errors are not successes.
- Release build, host hardware, Docker resources, PostgreSQL version/durability
  settings, source revision and hashes are recorded. No LLM or external payment
  provider is contacted. Payment is explicitly simulated.

The earlier 1,000-product comparison remains in `benchmark-before.json` and
`benchmark-after.json`. It measured full catalog responses, closed-loop traffic
and median results over three rounds. The current API returns bounded pages;
**do not treat its smaller response as a like-for-like full-catalog speedup**.
The old raw reports and failure diagnostics remain published rather than being
replaced by the new contract. That original test used body-free catalog POSTs;
the new test sends JSON criteria and validates the complete body handling.

The physical SQL-generated fixture does not measure a production bulk-import API,
variant-heavy catalogs, embeddings, AI retrieval or relevance on a real assortment.
A separate 120-variant fixture, multilingual searches and concurrent cart edits
are checked by `scripts/scalability.py` in CI against real PostgreSQL.

## Observed limits and fixes

The first 100/s million-product run exposed an OR/subquery that scanned the entire
shop for a 20-line cart. Client admission rejected 634 scheduled requests; successful
cart reads had p95 645.256 ms. The final direct indexed SKU/parent lookup reached
100/s with p95 14.693 ms and no errors on the same workload. Both raw runs are
published. Search also needed JIT disabled for application sessions and custom
plans for common/rare terms; repeated mixed queries were checked before measuring.

The final two runs contain 19,500 measured requests with no errors and 1,532 unique
persisted orders including 32 warm-ups. The higher offered rate achieved roughly
497–499 requests/s depending on workload; it is not a saturation finding.

## Limits and cleanup

The current report covers one powerful Apple M3 Ultra workstation, PostgreSQL 17
in Docker, warm caches and these bounded fixtures. It does not measure production
operations, WAN latency, cold database/machine starts, a many-shop fleet, real-money payments,
LLM generation or comparative Shopware performance. Repeat it on your deployment
hardware and realistic workloads before making a capacity promise.

Stop only the benchmark server you started, then stop the isolated database:

```sh
docker compose -p rust-commerce-performance down
```

The volume is retained for inspection. Remove it only when its synthetic data is
no longer needed.
