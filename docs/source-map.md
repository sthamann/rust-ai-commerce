# Source responsibilities and verification map

`main.rs` contains process setup and the module registry. It delegates migrations
and dependencies to `bootstrap.rs` and transports to `routes.rs`. HTTP, MCP and
UCP invoke shared operations, rather than independently reimplementing checkout.
Small modules use a crate-level shared type/import facade; SQL helpers remain
internal. `commerce/` and `auth/` group their types, validation and operations.
`structure.py` prevents Rust modules from exceeding 320 lines and keeps `main.rs`
under 120. Every Rust source starts with a responsibility comment.

The table lists **executable behavioral coverage**, not percentage line coverage.
Pure rules use Rust tests; API/domain/storage modules are exercised against real
PostgreSQL, AGE and (where enabled) the real local model. Tests include rejected
inputs and state effects. A module's presence does not count as a test.

## Every Rust source file

| File | Responsibility | Coverage |
|---|---|---|
| [`src/agent.rs`](../src/agent.rs) | Persistent grounded conversations and tenant-scoped semantic knowledge HTTP adapters. | `intelligence.py + providers.py + live studio.py + users.py + restart.py` |
| [`src/auth/credentials.rs`](../src/auth/credentials.rs) | Argon2 password operations run off the asynchronous request executor. | `users.py + Rust credential/role tests; restart.py + extensions.py for replicated policy` |
| [`src/auth/invitations.rs`](../src/auth/invitations.rs) | Single-use, expiring invitations. Acceptance verifies an existing account password. | `users.py + Rust credential/role tests; restart.py + extensions.py for replicated policy` |
| [`src/auth/members.rs`](../src/auth/members.rs) | Workspace member visibility and immediately effective role/revocation changes. | `users.py + Rust credential/role tests; restart.py + extensions.py for replicated policy` |
| [`src/auth/middleware.rs`](../src/auth/middleware.rs) | Resolve sessions from PostgreSQL on every request: role changes/revocation work across replicas. | `users.py + Rust credential/role tests; restart.py + extensions.py for replicated policy` |
| [`src/auth/mod.rs`](../src/auth/mod.rs) | Personal merchant accounts, tenant memberships, scoped sessions and role enforcement. | `users.py + Rust credential/role tests; restart.py + extensions.py for replicated policy` |
| [`src/auth/registration.rs`](../src/auth/registration.rs) | Create an isolated merchant workspace from synthetic template data. | `users.py + Rust credential/role tests; restart.py + extensions.py for replicated policy` |
| [`src/auth/sessions.rs`](../src/auth/sessions.rs) | Login/logout and personal workspace discovery. Only hashed opaque tokens persist. | `users.py + Rust credential/role tests; restart.py + extensions.py for replicated policy` |
| [`src/bin/context.rs`](../src/bin/context.rs) | Bounded ports of original language-chain, rule priority and quantity selection. | `context_differential.py + Rust selectors + studio.py` |
| [`src/bin/delivery.rs`](../src/bin/delivery.rs) | Batch proportional-tax fixture transport for the original-PHP comparator. | `original-PHP differential scripts` |
| [`src/bin/price.rs`](../src/bin/price.rs) | Batch price fixture transport for the original-PHP differential comparator. | `original-PHP differential scripts` |
| [`src/bootstrap.rs`](../src/bootstrap.rs) | Startup, additive migrations, persisted extensions and outbox worker. | `integration.py + users.py + extensions.py + restart.py` |
| [`src/capabilities.rs`](../src/capabilities.rs) | Shared HTTP/MCP capability dispatch and tool authorization. | `protocols.py + integration.py + commerce.py + users.py` |
| [`src/cart_model.rs`](../src/cart_model.rs) | Persisted cart, item and customer-context types. | `integration.py + commerce.py + protocols.py + users.py + restart.py` |
| [`src/cart_mutation.rs`](../src/cart_mutation.rs) | Optimistic cart mutations and quantity normalization. | `integration.py + commerce.py + protocols.py + users.py + restart.py` |
| [`src/cart_price.rs`](../src/cart_price.rs) | Authoritative quantity pricing and localized checkout quote assembly. | `integration.py + commerce.py + protocols.py + users.py + restart.py` |
| [`src/cart_routes.rs`](../src/cart_routes.rs) | Store API cart and order route adapters. | `integration.py + commerce.py + protocols.py + users.py + restart.py` |
| [`src/cart_storage.rs`](../src/cart_storage.rs) | Cart creation, loading and input validation. | `integration.py + commerce.py + protocols.py + users.py + restart.py` |
| [`src/catalog_model.rs`](../src/catalog_model.rs) | Tenant product model and database hydration. | `server startup/build + integration.py + structure.py` |
| [`src/catalog_routes.rs`](../src/catalog_routes.rs) | Health and localized catalogue HTTP routes. | `server startup/build + integration.py + structure.py` |
| [`src/commerce/catalog.rs`](../src/commerce/catalog.rs) | SKU loading with parent translation fallback. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/configuration.rs`](../src/commerce/configuration.rs) | Tenant checkout configuration loading. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/context_routes.rs`](../src/commerce/context_routes.rs) | Public method discovery and revision-checked checkout context changes. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/delivery.rs`](../src/commerce/delivery.rs) | Shipping costs, proportional taxes and calendar delivery windows. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/detail.rs`](../src/commerce/detail.rs) | Product family, context prices, gallery, properties and review aggregates. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/fulfillment.rs`](../src/commerce/fulfillment.rs) | Revision-checked payment and delivery state transitions. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/mod.rs`](../src/commerce/mod.rs) | Native catalogue and checkout domains; pricing ports remain in the library. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/review_moderation.rs`](../src/commerce/review_moderation.rs) | Merchant authorization and review publication. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/reviews.rs`](../src/commerce/reviews.rs) | Customer review submission with server-derived purchase verification. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/selection.rs`](../src/commerce/selection.rs) | Recover a quote after configuration changes without losing items or silently committing new choices. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/settings_mutation.rs`](../src/commerce/settings_mutation.rs) | Optimistic settings persistence and audit event. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/settings_routes.rs`](../src/commerce/settings_routes.rs) | Tenant configuration and operational read model. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/settings_validation.rs`](../src/commerce/settings_validation.rs) | Configuration validation and required availability invariants. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/tax.rs`](../src/commerce/tax.rs) | Destination tax-class resolution and net-preserving price conversion. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/commerce/types.rs`](../src/commerce/types.rs) | Checkout selection and configuration data contracts. | `commerce.py + Rust settings/recovery tests + delivery_differential.py` |
| [`src/concierge.rs`](../src/concierge.rs) | Read-only storefront shopping advisor. | `providers.py + live intelligence.py/studio.py + protocols.py` |
| [`src/context.rs`](../src/context.rs) | Bounded behavioral ports of Shopware 6.7.14.2 context and product-cart selection. | `context_differential.py + Rust selectors + studio.py` |
| [`src/customer.rs`](../src/customer.rs) | Customer credential verification and context rotation. | `server startup/build + integration.py + structure.py` |
| [`src/experience.rs`](../src/experience.rs) | Persisted storefront layout policy and observed synthetic rewards. | `integration.py + protocols.py + studio.py + restart.py` |
| [`src/extensions.rs`](../src/extensions.rs) | Merchant catalogue and Wasm extension activation/state. | `integration.py + users.py + extensions.py + restart.py` |
| [`src/foundation.rs`](../src/foundation.rs) | Application dependencies, error responses and request context helpers. | `protocols.py + integration.py + commerce.py + users.py` |
| [`src/inference.rs`](../src/inference.rs) | Provider adapters. Credentials stay on the server; domain validation is separate. | `Rust parsing/schema tests + providers.py + live intelligence.py/studio.py` |
| [`src/knowledge.rs`](../src/knowledge.rs) | Apache AGE graph plus pgvector retrieval. Queries are fixed, parameters are data. | `intelligence.py + studio.py + users.py + restart.py` |
| [`src/lib.rs`](../src/lib.rs) | Reusable pricing, context, sandbox, graph and inference modules. | `server startup/build + integration.py + structure.py` |
| [`src/localization.rs`](../src/localization.rs) | Shop locale resolution, translated catalog hydration and non-mutating merchant quote. | `studio.py + context_differential.py + commerce.py` |
| [`src/main.rs`](../src/main.rs) | Process lifetime only. See docs/source-map.md for domain responsibilities. | `server startup/build + integration.py + structure.py` |
| [`src/mcp.rs`](../src/mcp.rs) | Typed MCP schemas and JSON-RPC transport. | `protocols.py + integration.py + commerce.py + users.py` |
| [`src/order_checkout.rs`](../src/order_checkout.rs) | Atomic checkout, stock locks, extension policy and idempotency. | `integration.py + commerce.py + protocols.py + users.py + restart.py` |
| [`src/order_routes.rs`](../src/order_routes.rs) | Merchant order read adapter. | `integration.py + commerce.py + protocols.py + users.py + restart.py` |
| [`src/outbox.rs`](../src/outbox.rs) | Durable outbox and audit projection worker. | `integration.py + protocols.py + studio.py + restart.py` |
| [`src/planner.rs`](../src/planner.rs) | Grounded model planning, recorded inputs and proposed changes. | `providers.py + live intelligence.py/studio.py + protocols.py` |
| [`src/pricing.rs`](../src/pricing.rs) | Behavioral port of Shopware 6.7.14.2 quantity calculators. | `differential.py + delivery_differential.py + Rust numeric regressions + commerce.py` |
| [`src/proposal_apply.rs`](../src/proposal_apply.rs) | Transactional application of approved, revision-bound proposals. | `providers.py + live intelligence.py/studio.py + protocols.py` |
| [`src/proposal_model.rs`](../src/proposal_model.rs) | Typed proposals and validation before persistence or execution. | `providers.py + live intelligence.py/studio.py + protocols.py` |
| [`src/proposal_routes.rs`](../src/proposal_routes.rs) | HTTP proposal creation, approval and task listing. | `providers.py + live intelligence.py/studio.py + protocols.py` |
| [`src/routes.rs`](../src/routes.rs) | HTTP transport registry; domain behavior lives in dedicated modules. | `protocols.py + integration.py + commerce.py + users.py` |
| [`src/sandbox.rs`](../src/sandbox.rs) | Pure Wasmtime guest execution with bounded resources and no host imports. | `Rust guest boundary tests + protocols.py + extensions.py + restart.py` |
| [`src/seed.rs`](../src/seed.rs) | Idempotent synthetic template catalogue initialization. | `integration.py + users.py + extensions.py + restart.py` |
| [`src/studio.rs`](../src/studio.rs) | Verified merchant overview facts consumed by the chat and activity views. | `studio.py + users.py` |
| [`src/ucp.rs`](../src/ucp.rs) | Selected UCP checkout adapters sharing the native cart. | `protocols.py + integration.py + commerce.py + users.py` |

## New v0.5 modules

| File | Responsibility | Coverage |
|---|---|---|
| [`src/apps/cart_contributions.rs`](../src/apps/cart_contributions.rs) | Generic app-to-cart contribution contract, revision binding and order read model. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/apps/data.rs`](../src/apps/data.rs) | Managed app tables: typed writes, optimistic revisions, bounded reads and local RLS context. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/apps/events.rs`](../src/apps/events.rs) | Durable at-least-once app events, retry leases and stable event idempotency keys. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/apps/gateway.rs`](../src/apps/gateway.rs) | One permission-aware action gateway serves HTTP, UI and MCP; service egress is operator configured. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/apps/manifest.rs`](../src/apps/manifest.rs) | Strict package contract; identifiers and limits are checked before any schema DDL. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/apps/mod.rs`](../src/apps/mod.rs) | Versioned app packages: managed data, UI slots, agent tools and isolated service calls. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/apps/planning.rs`](../src/apps/planning.rs) | Registered managed app actions join the same preview/approve transaction as core changes. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/apps/registry.rs`](../src/apps/registry.rs) | Atomic installation and additive schema upgrades; immutable version digests preserve history. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/apps/routes.rs`](../src/apps/routes.rs) | Tenant-scoped package lifecycle, generated data endpoints and a shared action adapter. | `apps.py + services.py + providers.py + app_inference.py` |
| [`src/cognition/context.rs`](../src/cognition/context.rs) | Bounded localized catalog retrieval before inference; full catalog size never expands the prompt. | `apps.py + live intelligence.py/studio.py + restart.py` |
| [`src/cognition/mod.rs`](../src/cognition/mod.rs) | Evidence-based shop memory: event receipts, observed pairs, reviewable hypotheses and bounded context. | `apps.py + live intelligence.py/studio.py + restart.py` |
| [`src/cognition/projection.rs`](../src/cognition/projection.rs) | Exactly-once local observation projection; associations retain order/event evidence and simulation labels. | `apps.py + live intelligence.py/studio.py + restart.py` |
| [`src/cognition/recommendations.rs`](../src/cognition/recommendations.rs) | Merchant-approved associations are consumed by the public shop without exposing order counts or identities. | `apps.py + live intelligence.py/studio.py + restart.py` |
| [`src/cognition/routes.rs`](../src/cognition/routes.rs) | Merchant memory endpoints and revision-bound experiment/dismissal decisions. | `apps.py + live intelligence.py/studio.py + restart.py` |
| [`src/payments/mod.rs`](../src/payments/mod.rs) | Provider-independent payment ledger and durable workers; the first adapter is explicitly PayPal Sandbox. | `payments.py (local wire fixture) + Rust integer-money tests` |
| [`src/payments/operations.rs`](../src/payments/operations.rs) | Durable idempotent payment commands, customer context binding and serial refund admission. | `payments.py (local wire fixture) + Rust integer-money tests` |
| [`src/payments/paypal.rs`](../src/payments/paypal.rs) | Native PayPal Orders v2 sandbox wire adapter; credentials never enter prompts or browser responses. | `payments.py (local wire fixture) + Rust integer-money tests` |
| [`src/payments/provider.rs`](../src/payments/provider.rs) | Payment provider identity, tenant account configuration and immutable wire context. | `payments.py (local wire fixture) + Rust integer-money tests` |
| [`src/payments/routes.rs`](../src/payments/routes.rs) | Customer payment status/capture and merchant refund operations share the durable command API. | `payments.py (local wire fixture) + Rust integer-money tests` |
| [`src/payments/storage.rs`](../src/payments/storage.rs) | Transactional provider receipts and order state updates; external responses cannot invent amounts or tenants. | `payments.py (local wire fixture) + Rust integer-money tests` |
| [`src/payments/webhooks.rs`](../src/payments/webhooks.rs) | PayPal verifies webhook signatures before inbox insertion; provider reconciliation confirms monetary state. | `payments.py (local wire fixture) + Rust integer-money tests` |
| [`src/payments/worker.rs`](../src/payments/worker.rs) | Leased payment jobs; network runs after claim commit, fenced receipts prevent duplicate local effects. | `payments.py (local wire fixture) + Rust integer-money tests` |
| [`src/chat_lease.rs`](../src/chat_lease.rs) | Short, cross-replica conversation leases; inference never retains a database transaction. | `providers.py` |
| [`src/workers.rs`](../src/workers.rs) | Independently deployable worker roles; leases and durable receipts coordinate replicas. | `services.py + payments.py` |
| [`src/http_limits.rs`](../src/http_limits.rs) | Bounded streaming responses for extension services and payment providers. | `services.py + payments.py + build` |

## Frontend

| File/group | Responsibility | Verification |
|---|---|---|
| `main.tsx` | Hash routing and language context | Production typecheck/build; browser navigation |
| `Storefront.tsx` | Catalog, adaptive display and cart orchestration | Browser collection→detail→cart flow; underlying HTTP suites |
| `ProductPage.tsx` | Gallery, SKU option matrix, server tiers/properties/reviews | Browser variant/image/quantity/sold-out checks; commerce.py |
| `CheckoutPanel.tsx` | Native modal, address/country/methods and authoritative totals | Browser selection, empty/filled cart and simulated order; commerce.py |
| `shop-api.ts`, `shop-i18n.ts`, `shop.css` | Typed shop contracts, four-language text, scoped styles | Typecheck, browser language switching and layout inspection |
| `Merchant.tsx` | Merchant workspace/session and chat orchestration | Browser personal sign-in/navigation/reload; users.py + real chat HTTP tests |
| `SettingsDialog.tsx`, `ProposalCard.tsx`, `PreviewDialog.tsx`, `MessageText.tsx` | Focused merchant interactions | Build, browser interactions; proposal execution through HTTP tests |
| `OverviewView.tsx`, `KnowledgeView.tsx`, `AgentsView.tsx`, `PreviewPanel.tsx` | API-backed activity, graph, protocol setup and server quote | Build, browser views; studio.py/intelligence.py |
| `CommerceManager.tsx`, `UsersManager.tsx` | Tax/shipping/payment/reviews/orders and personal/team access | Browser rendering/sign-in; commerce.py + users.py |
| `i18n.tsx`, `locales/{en,de,fr,es,shop-*}.ts` | Merchant locale context and separate typed dictionaries | Typechecked equal keys and four localized API views |
| `Icon.tsx`, `ProductArt.tsx`, scoped CSS | Reusable authored visuals | Build and screenshots; gallery asset HTTP resolution |

Browser interactions were checked with the actual local app. They are not a
committed automated browser regression suite. Accessibility, assistive-device
coverage, all mobile breakpoints and exhaustive visual diffs remain additional
work; do not infer those from screenshots or typechecking.

App frontend modules: `AppsManager`/`AppEntity` manage lifecycle/data;
`AppFrame` provides the constrained iframe SDK bridge; `AppSlot` personalizes
products; `PaymentSession`/`PaymentManager` display customer/provider state;
`MemoryView`/`MemoryRecommendations` connect evidence to approved suggestions.
`app-i18n` supplies four-language host vocabulary; `apps.css` scopes their layout.
Verification: strict build plus actual browser navigation/data/configuration,
backed by `apps.py`, `services.py`, `payments.py` and `providers.py`. No automated
visual/iframe-browser regression suite is claimed.

## Persistence, fixtures and tooling

Migrations 001–005 retain the earlier core/graph/context model. 006 adds SKU
metadata, review storage and commerce settings; 007 initializes synthetic demo
commerce once; 008 adds personal users/memberships/invitations/sessions; 009
corrects template variant capacity and the authored example review. Migrations
are additive; existing stock/orders/prices are retained. Migration 010 adds
managed app metadata/DDL, event deliveries, knowledge evidence and payment
attempts/jobs/inbox/reservations; core monetary quotes retain their original shape. No production Shopware
store is imported by these migrations.

`fixtures/demo-catalog.json` and `demo-settings.json` are fixed public templates
for new workspaces, not exports of current merchant state. `frontend/public/media`
contains 33 authored SVG illustrations. Four executable WAT policies and their
limitations are documented in [extensions/README.md](../extensions/README.md).

The original Shopware reference lives in `reference/` (Composer-pinned source
and independent PHP runners). `porting/units.json` and `scripts/port.py` select
incremental migration gates. `scripts/dev.sh` starts the isolated local demo;
`mcp_stdio.py` bridges explicit client credentials. CI builds/types/lints/tests,
executes original PHP comparisons and the real DB suites. Private state,
credentials and DB backups remain ignored in `.run`, `.env` and local work.

See [shopware-parity.md](shopware-parity.md) for exact equivalence boundaries and
[security.md](security.md) for production gaps. No 100% code-coverage or full
Shopware compatibility claim is made.

| File | Responsibility | Verification |
|---|---|---|
| [`src/apps/runtime.rs`](../src/apps/runtime.rs) | Generic cached Wasm ABI execution; no app business rules. | Rust Wasm boundary tests + `apps.py` |
| [`src/apps/compatibility.rs`](../src/apps/compatibility.rs) | Explicit adapter for pre-1.1 engraving cart records; completed snapshots stay immutable. | Rust compatibility regression |
| [`extensions/apps/engraving/configuration.wat`](../extensions/apps/engraving/configuration.wat) | App-owned text-length and fee acceptance rules. | Rust guest tests + `apps.py` |
| [`extensions/apps/gift-message/configuration.wat`](../extensions/apps/gift-message/configuration.wat) | Independent app with its own length/fee limits and input field. | `apps.py` real taxed checkout |

| [`src/checkout_handoff.rs`](../src/checkout_handoff.rs) | Generic expiring, single-use transfer of an authoritative cart; rotates tokens. | `checkout_handoff.py` real PostgreSQL concurrency/order checks |
| [`extensions/apps/storyfront/manifest.json`](../extensions/apps/storyfront/manifest.json) | Storyfront app capabilities, separate service and merchant UI contract. | Installed package + actual connector/browser flow; see `storyfront.md` |


## Workbench and additional commerce domains

| Files | Responsibility | Tests |
|---|---|---|
| `src/staging/{clone,snapshot,documents,release,mod}.rs` | Private clones, publishable units, document provenance and selected conflict-checked atomic releases | `staging.py`, `marketing_accounts.py` |
| `src/developer/{generation,builds,routes,mod}.rs` | Structured model schema, immutable versions, restricted runtimes, staging/import/MCP tasks | `developer_documents.py`, `staging.py`, Rust validation tests |
| `src/documents/{ingestion,parser,retrieval,questions,mod}.rs` | Bounded PDF/text ingestion, private/public sources, actual graph/chunks/vector retrieval and cited PDP answers | `developer_documents.py` including real PDF child process |
| `src/accounts/{mod,profile}.rs`, `customer.rs`, `cart_storage.rs` | Separate customer sessions, profile/password/history and trusted identity reuse | `marketing_accounts.py`, `commerce.py` |
| `src/auth/provision.rs`, `registration.rs` | Shared synthetic template provisioning for first and additional owned shops | `marketing_accounts.py`, `users.py` |
| `src/marketing/{rules,promotions,flows,channels,routes,mod}.rs` | Bounded AST, authoritative campaigns, durable note/proposal jobs and sales-channel scope | Rust rule tests, `marketing_accounts.py`, `developer_documents.py` |
| `src/rule_comparison.rs`, `src/bin/rules.rs`, `reference/rules.php` | Original Shopware numeric comparison behavior, independent batch oracle | `rule_differential.py`: 1,280 comparisons |
| `src/discount.rs` | Exact-cent proportional basket discount allocation | Rust conservation/bounds tests, concurrent coupon HTTP checkout |
| `src/commerce/product_edit.rs` | Revision-bound translations and advanced metadata; own product/reference validation | `marketing_accounts.py` and selected release |
| `src/experience.rs` | Persisted layout policy plus owned-session signal ranking/clearing | `intelligence.py`, `marketing_accounts.py` |
| `frontend/src/{DeveloperView,EnvironmentManager,StoryfrontView,AutomationView,ProductDataView}.tsx` | Dedicated merchant workbench forms and review surfaces | Strict frontend build, actual browser review |
| `frontend/src/{CustomerAccount,DocumentsManager,ProductQuestion}.tsx` | Customer account editing/history and private upload/cited shopper questions | Native HTTP suites and browser forms |
| `frontend/src/{workbench-i18n,errors-i18n}.ts`, `frontend/tests/locales.mjs` | Four-language typed vocabulary and exact/fallback errors | Locale parity/nonempty/error tests |
| `deploy/*`, `scripts/prepare_vercel.py` | Self-hosted image/TLS network and credential-free Vercel API rewrite generation | Container build/start and Compose/static checks |

Migrations 011, 013–015 add source documents/chunks, environment/release/build
records, customer sessions/profiles, rules/promotions/flows/channels/product
metadata and anonymous behavior signals. Migration 012 contains checkout handoff.
The domain file guard remains enforced: Rust modules at most 320 lines, `main.rs`
at most 120 lines, each module starts with its responsibility comment.
## Bounded reads and setup

| File | Responsibility | Behavioral verification |
|---|---|---|
| [`src/catalog_page.rs`](../src/catalog_page.rs), [`src/catalog_search.sql`, `src/catalog_channel.sql`](../src/catalog_search.sql) | Tenant cursor pages, literal localized server search and enforced limits. | `scalability.py`: complete traversal, later-page search, mixed-field language fallback, wildcards, tenant boundaries; million-product HTTP benchmark |
| [`src/channel_metrics.rs`](../src/channel_metrics.rs) | Capped best-effort diagnostic buffer and bounded bulk writes. | Rust buffer-bound test + persisted counters in `scalability.py` |
| [`src/migrations.rs`](../src/migrations.rs) | Serialized checksummed setup and fixed demo seed; no catalog-wide restart scan. | Fresh database full suites; manual serve/migrate/readiness and independent-worker restart checks |

`scalability.py` also checks a 120-variant family, last-page reviews, deep links,
64 cart edits with 32 clients and competing optimistic revisions. Independent
processes were restarted against the million-product database, with warm database
caches; this is not a machine/database cold-start or failover test.

## Customer/merchant operations addition

| Source | Responsibility and behavioral tests |
|---|---|
| `src/accounts/{contacts,metadata,addresses,address_store,order_snapshot,demo}.rs`, `profile.rs`, `customer.rs`, `cart_storage.rs` | Typed contacts, indexed order metrics, composite-owned address books/CAS/defaults, login context defaults and immutable order copies. `customer_accounts.py` tests the entire buyer path and negative ownership cases. |
| `src/operations/{customers,orders,addresses,workflow,receipts,receipt_text,receipt_pdf}.rs` | Bounded CRM/order details, shared MCP address operations, workflow settings, central issuer settings, audited notes and immutable multilingual document issuance. `merchant_operations.py` + `customer_accounts.py`. |
| `src/commerce/{order_machine,order_workflow,order_fields,fulfillment}.rs` | Extensible validated state graph, eligible next actions/business guards, authoritative standard order projection and idempotent committed state transitions/events. Unit tests and actual concurrent workflow/flow/app effects. |
| `src/commerce/product_fields.rs` | Revision-bound native priced/media/property fields; quantity/tier/media validation in the central product write transaction. Product editor integration tests. |
| `src/assets/*`, `src/staging/assets.rs` | Immutable MIME-checked upload bytes, publication digests, paid owning order download entitlement, typed rich blocks and selective asset release. `merchant_operations.py`. |
| `src/auth/{permissions,integrations,members,invitations,middleware}.rs` | Fifteen scopes, per-shop hashed expiring keys, immediate revocation and non-escalating delegation. Permission units and HTTP/MCP negative tests. |
| `src/payments/{paypal,provider,storage,worker,routes}.rs` | Per-shop Sandbox/Live wallet configuration, pinned official attribution, durable jobs and pending-refund GET recovery. Local wire fixture `payments.py`; no live PSP proof. |
| `frontend/src/{CustomerFields,AddressFields,AddressCard,AddressBook,CheckoutIdentity,CheckoutDetails,CustomerAccount,CustomersManager}.tsx` | Same four-language contact/address interactions in buyer account, checkout and merchant CRM. Strict frontend build, locale tests and browser review. |
| `frontend/src/{OrderDetail,OrderWorkflow,OrderPaymentDelivery,ReceiptPanel,OrdersManager}.tsx` | Direct eligible commands, same-job payment polling, immutable address/document views and event activity. |
| `frontend/src/{SettingsWorkspace,MasterDataSettings,CommerceSettings,AppsManager}.tsx` | Central configuration and issuer, app categories and individual package workspaces; operational layouts use the full available width. |
| Migrations `016`–`021` | Operations/documents/assets, fine-key storage, state-machine/idempotency storage, explicit schema repair, customer IDs/addresses/default foreign keys and explicitly synthetic demo-address backfill. Applied entries remain immutable/checksummed. |

The file guard verifies every Rust module's responsibility header and maximum
320 lines (`main.rs` maximum 120). Tests cover the listed actual behaviors;
this does not claim every source line or every original Shopware operation is covered.

## Formal policy extraction

| File | Responsibility | Verification |
|---|---|---|
| [`src/verified_kernel.rs`](../src/verified_kernel.rs) | Thirteen pure production admission/cap policies | Twenty Lean theorems; compiled Rust/Lean conformance; broken-policy mutations |
| [`src/bin/verified_kernel.rs`](../src/bin/verified_kernel.rs) | Generated JSON comparison driver calling the real policy module | 3,558 comparison cases; generated drift guard |
| [`src/payments/receipt_guard.rs`](../src/payments/receipt_guard.rs) | Checked amount conversion and provider receipt policy binding | `payments.py`; reviewed binding, not a proof of the parser |

All 146 Rust files have explicit status and reviewed hashes in
[`proof/manifest.json`](../proof/manifest.json). The eight consumer modules are
reviewed bindings, not whole-module proofs. See the
[exact formal coverage and remaining gaps](formal-verification.md).
