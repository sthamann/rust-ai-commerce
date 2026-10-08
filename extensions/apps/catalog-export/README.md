# Catalog export

Independent Python app demonstrating the language-neutral contract. The core and
bundled workers remain Rust. This app reads selected products, creates a CSV and
uploads it through the existing private assets owner; a leased durable app job
exposes progress, cancellation and the completed file in Studio.

Install `manifest.json` through package review. Issue a tenant/app-bound callback
key with only the declared core scopes, and configure `APP_TENANT`,
`APP_CALLBACK_KEY`, `APP_TOKEN`, `COMMERCE_URL` and a private `APP_PORT` for
`server.py`. Pin the package's Rust-canonical digest in `APP_SERVICES.catalog_export`.
The operator configures the private service origin explicitly; no secret enters UI.

Submit `export_catalog` with owned `ids` and `productId`. The outbox delivers its
job event, the service claims a bounded lease, reports progress, checks cancellation
and uploads the private result before succeeding. Stale/foreign leases and repeated
claims fail. A replay cannot repeat a completed export; expired/uncertain work
requires explicit review. SKU cells with spreadsheet formula prefixes are escaped.

`python3 scripts/verify_integration.py --only app_export` exercises this complete
path against a disposable PostgreSQL shop and local independent worker. See
[the job/asset contract](../../../docs/app-platform.md) for limits.
