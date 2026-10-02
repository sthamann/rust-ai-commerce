# Reproduce the local commerce benchmark

The [published comparison](https://sthamann.github.io/rust-ai-commerce/benchmarks.html)
contains all workloads and links to raw baseline and optimized JSON. These are
local synthetic HTTP/PostgreSQL measurements, not production capacity or an LLM
speed claim. The browser clips are separate feature demonstrations.

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
target/release/rust-ai-commerce
```

Keep that server running. In another terminal, in the same checkout:

```sh
python3 scripts/benchmark.py --prepare rust-commerce-performance-postgres-1
python3 scripts/benchmark.py --requests 128 --rounds 3 --output .run/benchmark.json
```

The fixture file contains credentials and stays in ignored `.run/`, mode 0600.
The report contains no credentials. Keep fixtures identical for a before/after
comparison; do not run `--prepare` again between builds. Stop the old server before
starting the next binary at the same address. Do not build, record video or run
other load tests during the accepted comparison runs.

To record a binary built from uncommitted source, capture its source diff before
building, then pass the same file and binary to the measurement:

```sh
git diff -- src > .run/measured-source.diff
cargo build --release --locked
# Start this binary as above, then measure it:
python3 scripts/benchmark.py --requests 128 --rounds 3 \
  --binary target/release/rust-ai-commerce \
  --source-diff .run/measured-source.diff --output .run/benchmark.json
```

## What is timed and checked

- 6-product and 1,000-product translated catalogs, at 1, 16 and 64 concurrent clients.
- A 20-line cart drawn from the 1,000-product catalog, at 1 and 16 clients.
- Fresh durable checkouts at 16 clients; each cart and idempotency key is unique.
- One validated warm-up request per client per round; warm-up is excluded from timing.
- Catalog length, language, price, cart line count/total, order identity and simulated payment are validated.
- Every measured order, including checkout warm-up, is checked directly in PostgreSQL.
  The merchant list's latest-100 cap is not mistaken for missing persistence.
- Timing includes connection creation, the entire response, JSON decoding and assertions.
  Closed-loop Python threads run on the server's host, so client limits and shared-host
  contention are included. This is not an open-loop saturation/capacity test.
- Percentiles use nearest rank. The published summaries use the median of the three
  per-round percentiles/throughputs; raw per-request latencies remain available.
- Errors are recorded with their duration and reason, rather than counted as successes.
  A failed warm-up aborts the run; an aborted run is not a clean published result.

The accepted comparison uses body-free catalog POST requests in both builds.
Separate JSON-body diagnostics exposed an unread-request-body response truncation;
the HTTP handler now consumes the body. See the published diagnostic record for
the original failures and follow-up probe. Other timed endpoints send their actual
JSON bodies.

Hardware, operating system, Rust version, warm-up policy, source revision/diff,
benchmark-script hash and binary SHA-256 are embedded in every accepted report.
Synthetic fixtures have ample stock; payment is simulated. No local model or
external payment provider is invoked by the timed requests.

## Limits and cleanup

The current report covers one powerful Apple M3 Ultra workstation, PostgreSQL 17
in Docker, warm caches and these bounded fixtures. It does not measure production
operations, WAN latency, cold starts, million-product catalogs, real-money payments,
LLM generation or comparative Shopware performance. Repeat it on your deployment
hardware and realistic workloads before making a capacity promise.

Stop only the benchmark server you started, then stop the isolated database:

```sh
docker compose -p rust-commerce-performance down
```

The volume is retained for inspection. Remove it only when its synthetic data is
no longer needed.
