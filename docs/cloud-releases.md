# Northflank releases and private performance tests

The `vendune-main-release` Northflank workflow listens to pushes to `main` only.
GitHub branch protection requires the complete `verify` check, an up-to-date
branch and pull requests; enforcement applies to administrators as well.
The workflow queues releases, builds the exact triggering SHA, waits for a
PostgreSQL native backup, deploys that exact image to `vendune-migrate`, waits
for its successful migration-only run, then deploys the same image to Core and
waits for readiness. Core's direct CD and the builder's direct CI stay disabled.
A failed backup, build or migration prevents the service deployment.

`vendune-migrate` runs `/app/vendune` with `BOOTSTRAP_MODE=migrate`, without
operator credentials or demo seeding. It inherits only the existing private
PostgreSQL URI from `vendune-runtime`. Migration ledger/checksums and the database
migration lock remain authoritative. Do not edit a released migration: add a new
one. Use expand/contract schema changes while the previous version is serving.
A database backup is not automatic rollback: restore is an operator decision,
and backward-incompatible changes require a staged rollout. Release backups are
additional to the daily seven-day retention schedule; manage their retention as
catalog size grows.

The manual `vendune-benchmark` job builds `deploy/Dockerfile.benchmark`. It has
no public port or schedule. Runtime-only database linkage must never be granted
to a build. Set `BENCHMARK_ENVIRONMENT=vendune-northflank-test` and
`BASE_URL=http://vendune-core:8787`. The bounded job creates fresh synthetic tenant
IDs and retains their fixtures for diagnosis. It never modifies another tenant.
No authentication secrets, customer sessions or connection strings are logged.

`scripts/cloud_benchmark.py` reuses the validated sampler from `benchmark.py`.
It tests 1 shop × 1,000 products, 1 × 100,000, 100 × 1,000 and 1,000 × 100.
Each case measures localized catalog pages, product details, selective and broad
keyword search, at concurrency 1/8/32, twice. A fixed-arrival catalog sample
includes client queue time. Cart reads and one simulated persisted checkout are
also validated. Output uses `RESULT_JSON`, `DATABASE_JSON`, `METADATA_JSON` and
`COMPLETE_JSON` lines for result extraction from Northflank job logs.

These are warm-cache private HTTP measurements on the actual small deployment.
They do not measure external TLS/CDN, storefront rendering, SaaS signup, vector
index capacity, paid embeddings/LLM calls or real payment traffic. Shared CPU and
short samples vary; report per-round values and errors, not an extrapolated shop
limit. The tenant fixtures exercise distribution in the current single island;
no automatic island allocator or shop relocation controller is implemented yet.
