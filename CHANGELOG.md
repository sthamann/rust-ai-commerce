# Changelog

## Hosted public frontend API routing — 9 October 2026

- Delegate the reserved `/api/v1/...` public frontend namespace only on an operator-mounted shop hostname. Original hosted Storyfront commerce/session APIs previously returned an unregistered-Core-API 403 before reaching their renderer.
- Preserve central tenant/channel, paused-shop, private-preview and resource admission; registered Core routes and merchant credentials remain isolated. Real HTTP/PostgreSQL regressions exercise GET/POST bodies, query strings, forged scope, unmounted hosts, paused shops and read-only private previews.

## Native Storyfront release packaging — 9 October 2026

- Fix the production image build: historical app manifests used by the canonical upgrade/approval contract are now copied into the Rust build stage. They are existing reference inputs, not a restored Python runtime or a second app registry.
- Add a CI dependency-closure check for literal Rust compile-time includes, with a negative control reproducing the eight missing manifests from the failed public build.
- The older publicly deployed Core lacked the confirmed-claim intake/compile endpoints required by the private original Storyfront adapter. Update the tested Core through the existing backup/migration/release workflow before claiming native public integration.

## Connected intelligence, app ontology and acceptance — 9 October 2026

- Automatic tenant-bound embedding intake/model rebuilds, pooled Qdrant, lexical/dense fusion, optional reranking and self-hosted OpenAI-compatible serving. Forced-RLS lexeme projections narrow current candidates without bypassing source admission.
- Authorized agent read rounds, native SSE progress, shared AI admission, source-bound reviewed claims, signed public facts and saved fact-based categories. Product answers recheck all supplied sources; buyer advice rechecks channel-visible native facts and explicit preference consent after inference.
- Price guardrails/daily autonomy budgets, fixed-horizon layout experiments and opt-in document-event extraction reuse existing approval, Flow, outbox and knowledge owners. Broader autonomous writes, token streaming and continuous extraction remain open.
- Optional app-owned ontology maps share one visual/coding-agent manifest and current API/MCP/planner grants. Added the multilingual ontology-care example. No parallel app knowledge database.
- Private Experience pins this merged Core and consumes confirmed public claims through the original Storyfront compiler; original native worker/provider and free-prose binding gaps remain separate.
- Refresh README, release/testing/formal guides and public site; publish exact formal/coverage evidence and a detailed acceptance record. Correct stale core-RLS and module/suite-count descriptions.
- Fix merchant-registration slug validation for modern browsers; add valid/invalid slug regression coverage. Repeat the full original Storyfront suite and actual product history/app publish journeys.
- Fix the real mail/Flow regression fixture to honor the existing native PostgreSQL selector instead of hard-coding Docker; the same fixture retains Docker CI support.

[Detailed changes, tests and limitations](docs/release-acceptance-2026-10-09.md). Historical recordings and performance measurements keep their original source/date.

## Request hotpath and delivery — 8 October 2026

- Reuse one fresh server-owned domain/tenant/staging/status/channel snapshot per request, with current personal credentials and immutable hosted mount binding. No status or permission TTL cache.
- Remove native public-asset identity SQL; ship deterministic gzip/Brotli build variants and secret-free API compression with correct negotiation, ranges and stream exclusions. Hosted/private assets retain admission.
- Borrow decoded settings through immutable Arc handles; batch inventory deduction/allocation/release using persisted quantities and sorted locks.
- Consolidate dashboard facts and bound parallel reads to three branches. Historical currency separation and cancellation idempotence retain their contracts.
- Publish a matched 9,000-request local comparison with zero errors, raw samples and unchanged business fingerprints; no universal speedup or production-capacity claim. See [the measurement and scope](docs/read-performance.md).
- Add two Lean properties for native-asset admission and explicit review locks for embedded SQL/build inputs. SQL, providers and browser behavior remain unproved.

## Rust standard services — 7 October 2026

- Ported bundled Email Delivery, GA4, Gmail, Slack and OAuth/export state to an independent Rust service; existing app, Flow Builder and MCP contracts are preserved.
- Replaced local SQLite with encrypted tenant/app-bound PostgreSQL records, forced RLS, distributed lease-fenced claims and per-tenant/app quotas. Ambiguous external delivery is never automatically resent.
- Added compiler-typed mail configuration, verified SMTP STARTTLS/TLS and Resend/SendGrid delivery, atomic offline migration, actual multi-process/provider regressions and the extracted Lean retry predicate.
- Archived the previous Python implementation as a migration comparison oracle. Python remains in development tools and independent app examples, outside the first-party central runtime. See [the architecture and language audit](docs/rust-services.md).

## Vendune identity — October 2026

- Renamed the public repository, Rust crate/binary, frontend package, Docker images, MCP identity and documentation to Vendune.
- Added the original Vendune V/dune vector mark, light/dark wordmarks, shared Studio/operator branding and favicons.
- Preserve existing shop identities, browser sessions and database volumes; fresh installations use Vendune names.
- Recaptured current English README views and added a public-brand consistency check.

## Unified content translation editors

- One shared content-language picker and one field per value across product/SEO,
  attachment, category, tax, method, rule/campaign/channel and graphical flow editing.
- Main-language inheritance for simple and graphical flow instructions and file
  titles, dynamic enabled content locales and localized storefront file labels.
- CI rejects new stacked language fields; regression checks cover preservation,
  explicit blanks, Spanish inheritance, Italian and regional variants.
## 0.5.0 — prototype release

This release packages the current experimental commerce slice. It is not a
production-readiness or complete Shopware-compatibility claim.

- Modular Rust commerce core and multilingual storefront/Vendune Studio.
- Personal users, independent workspaces, invitations and merchant roles.
- SKU variants, quantity prices, review moderation and configurable demo checkout.
- Durable PostgreSQL storage with Apache AGE and pgvector.
- Merchant-approved proposals, local inference and optional cloud adapters.
- Partial MCP/UCP bindings and bounded Wasm B2B purchase policies.
- Original Shopware pricing/context/tax comparisons and first-start policy fix.
- Versioned app examples, shop intelligence, separate worker roles and a PayPal Sandbox adapter.
- Sandbox verification uses local contract fixtures; live Sandbox traffic is unverified.
- Clear commerce-first quickstart, searchable guides and contributor information.

Payments are simulated, manual or Sandbox; no real money is charged. See [the feature matrix](docs/shopware-parity.md),
[verification record](docs/verification.json) and current CI for exact scope.
