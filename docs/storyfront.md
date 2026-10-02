# Storyfront connector

Storyfront (Ambient-C) can use Rust AI Commerce as its catalog and checkout backend.
The connector is an independently deployed app, not storefront-specific business
logic inside the Rust core. It creates a valid merchant manifest, copies product
images, and connects the cinematic bag to the same cart and order operations used
by the native storefront and agents.

```mermaid
flowchart LR
  A[Merchant: Generate / refresh] --> B[Storyfront app service]
  B --> C[Rust tenant catalog + variants]
  B --> D[Storyfront manifest + merchant media]
  D --> E[Storyfront experience + existing AI composer]
  E --> F[Product IDs + quantities]
  F --> G[Rust authoritative cart]
  G --> H[Single-use checkout handoff]
  H --> I[Review shipping, tax, address and payment]
  I --> J[Persisted order + stock + existing event outbox]
```

## Responsibilities and contracts

| Component | Owned behavior |
|---|---|
| `extensions/apps/storyfront/manifest.json` | Versioned merchant capabilities, iframe slot, `generate` and `status` actions |
| `extensions/apps/storyfront/ui.html` | English, German, French and Spanish merchant interface using the generic guest SDK |
| Ambient-C `packages/manifest/src/rust-commerce.ts` | Catalog-to-manifest mapping, SKU identity mapping, variant relationships, image references and supplied product facts |
| Ambient-C `scripts/connect-rust-commerce.ts` | Tenant catalog/variant reads, bounded image copying and manifest compilation |
| Ambient-C `scripts/rust-commerce-app.ts` | Independent authenticated service, tenant-scoped durable job status and serialized import execution |
| Ambient-C `packages/runtime-api/src/rust-commerce-publication.ts` | Existing hostname registry admission and catalog publication; respects closed/restricted merchant status |
| Ambient-C `apps/storefront/src/pages/api/v1/commerce.json.ts` | Same-origin intent admission, own-manifest product check, mapping to authoritative commerce SKU |
| Ambient-C `packages/runtime-api/src/rust-commerce.ts` | Operator-controlled destinations, bounded HTTP requests and checkout transfer |
| Rust `src/checkout_handoff.rs` | Generic single-use cart transfer, expiry, tenant scope and token rotation |
| Rust `frontend/src/Storefront.tsx` | Consume transfer and open the existing checkout review dialog |

The shopper sends only `{ "items": [{ "id": "mug-terracotta-500", "quantity": 1 }] }`
to the Storyfront endpoint. The merchant scope and destination come from server
configuration. Prices, URLs, tokens, arbitrary tenant IDs and customer identity are
not accepted in that intent. Source SKUs incompatible with Storyfront identifiers
get stable hashed manifest IDs; `commerce-sku` preserves the exact purchase identity.

The local bag remains purchase intent until checkout. The connector creates a fresh
Rust cart and writes the requested items, using its revision and context token.
It refuses silent quantity normalization. Rust calculates the actual totals and
returns a checkout transfer ticket. This ticket expires after ten minutes, is stored
only as a digest, and can be consumed exactly once. Consumption rotates the cart's
context token. A ticket is carried in the URL fragment and is removed on arrival.
The browser receives no merchant credential or original cart token from Storyfront.

## Run a connected shop

Use the companion Ambient-C branch containing the connector. Configure server-side
variables in its own ignored environment file, never in browser build variables:

```dotenv
AMBIENT_DATA_ROOT=/absolute/isolated/storyfront-data
AMBIENT_MERCHANT_STORE=fs:/absolute/isolated/storyfront-store
AMBIENT_POSTGRES_URL=postgres://USER:PASSWORD@HOST:5432/ISOLATED_STORYFRONT_DB
AMBIENT_TENANCY=hostname
AMBIENT_COMPOSER=llm
AMBIENT_RUST_COMMERCE_CONNECTIONS={"my-storyfront":{"origin":"https://commerce.example","tenant":"my-shop","locale":"en-GB"}}
AMBIENT_RUST_STOREFRONT_ORIGINS={"my-storyfront":"https://storyfront.example"}
AMBIENT_RUST_STOREFRONT_NAMES={"my-storyfront":"My Shop"}
AMBIENT_RUST_APP_TOKEN=GENERATE_A_RANDOM_SECRET_AT_LEAST_24_CHARACTERS
AMBIENT_RUST_APP_PACKAGE=/absolute/rust-ai-commerce/extensions/apps/storyfront
AMBIENT_RUST_APP_DB=/absolute/isolated/storyfront-jobs.sqlite
AMBIENT_RUST_APP_PORT=8796
```

Migrate that Storyfront database using its normal migration script. Start the app
service with `bun scripts/rust-commerce-app.ts` and its storefront with the normal
hostname build/runtime. Put an HTTPS reverse proxy in front of each service for
remote access. Local development permits loopback HTTP. Configure the existing
Storyfront OpenRouter provider separately for AI composition; catalog generation
itself makes no model, media-generation, embedding or warm-job requests.

Configure the Rust operator's server environment:

```dotenv
APP_SERVICES={"storyfront":{"url":"https://storyfront-app.example","uiUrl":"https://storyfront-app.example/","token":"THE_SAME_PRIVATE_SERVICE_SECRET"}}
```

Preserve other configured app services when adding this entry. Install **Storyfront**
from **Apps & payments**, then choose **Generate / refresh shop**. Polling shows the
actual job status and the generated product/image counts. **Open shop** leads to the
operator-configured storefront. The same capabilities are available through the
existing authenticated HTTP/MCP app gateway. A viewer cannot schedule generation.
The operator admits each tenant-to-Storyfront pair in configuration; shoppers and
model output cannot register destinations. This initial app supports one Storyfront
per configured Rust tenant. It is not a public unauthenticated provisioning service.

An operator can also import with:

```sh
bun scripts/connect-rust-commerce.ts my-storyfront 'My Shop'
```

## What is real, and what remains a prototype

A connected checkout persists an actual order in the Rust database, updates stock,
and uses the existing idempotency and event paths. This is more than the old local
Storyfront bag. Payment behavior still depends on the configured Rust payment
adapter. The default demo payment is simulated. The PayPal adapter is Sandbox only;
no live payment was charged in this verification. This connector does not turn a
simulated payment into a real settlement.

Catalog publication generates the catalog-based Storyfront, not a reviewed AI story
release. Storyfront's existing LLM composer can answer questions from the imported
facts. Paid composition uses its existing provider and approval rules. Refresh is a
new catalog snapshot; price, tax, shipping, payment eligibility and stock are checked
again at checkout. It does not yet implement continuous inventory/webhook sync,
curated story-release preservation or automatic reconciliation of removed items in
old browser bags.

The current importer caps the snapshot at 250 SKUs and refuses incomplete catalogs.
It maps EUR prices from this prototype's retail context. Sold-out variants are omitted
from refreshed recommendation snapshots; checkout checks current stock again. Bundles and app-specific
product configuration are refused by this checkout intent contract rather than
inventing prices or dropping customization. Guest checkout uses the existing Rust
checkout form; cross-origin customer account SSO and return-to-Storyfront order
status callbacks are not yet implemented. This is not full Shopware/Storyfront
feature equivalence or a production SaaS scaling claim.

## Verification

`python3 scripts/checkout_handoff.py` uses real PostgreSQL and verifies empty/stale
cart rejection, tenant separation, revocation on reissue, expiry, one winner under
concurrent consume, old-token revocation, actual merchant-visible ordering and
idempotent replay. CI runs it with the other database suites.

The companion connector tests compile an imported manifest, retain variant facts
and SKU mappings, reject foreign media/duplicates, and exercise destination
validation, bounded responses and authoritative cart transfers. Browser verification
covers Storyfront bag to the existing Rust checkout. See
[checkout-handoff-verification.json](checkout-handoff-verification.json) for the
sanitized local database checks.

## Local end-to-end evidence

The isolated Atelier import published 10 available SKUs and copied 33 images.
The merchant app generated the snapshot through its authenticated action gateway.
A browser added `mug-terracotta-500`, transferred it to the native Rust checkout
and placed order `RAC-a36105f8` for EUR 29.90. The database contains the exact
variant and explicitly records `realMoneyCharged: false`.

![Storyfront order saved by the Rust checkout](storyfront-order.png)

Seven live HTTP checks covered authoritative pricing, unavailable variants, injected
tenants/prices, foreign origins, unknown hosts and oversized requests. Eleven companion
connector tests cover catalog compilation, identity mapping, bounded transfers,
service authentication, job coalescing and status persistence across restart.

The single approved AI question made real OpenRouter calls: two composer calls
with `openai/gpt-oss-120b` and one answer-agent call with `minimax/minimax-m2.7`.
Recorded cost was about USD 0.005206. The model produced product chapters and a
price, but the leading answer was incomplete, remained English and recommended
a sold-out variant. The stock filter is now applied during refresh, without an
additional paid question. This verifies provider wiring and catalog access; it
does not establish satisfactory answer quality or a verified AI story release.
No image generation, warm-up or external indexing was triggered.

## Four-language and complete-page refresh

The connector now follows root and variant cursor pages and fails at its explicit
250-SKU prototype cap instead of silently truncating catalogs. A local refresh
published ten available SKUs and 33 images with authoritative English, German,
French and Spanish title/description maps. Native product translations are
imported, not generated. Existing AI scenes are not automatically translated.
The companion workspace check passed 135 steps with zero failures/skips; no
additional paid inference was used for this refresh.
