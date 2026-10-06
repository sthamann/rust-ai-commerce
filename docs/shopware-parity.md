# Shopware core parity and remaining work

Reference: **shopware/core 6.7.14.2**, MIT, commit
`de074a584d77d8abb09ddb21d8799f083a61a3da`, installed by `reference/composer.lock`.
Paths below are relative to that original Core package. Native functionality is
not automatically a behavioral port. None of these rows certifies full Admin
API, Store API, Administration, DAL or plugin interchangeability.

**Partial port** means original PHP executes independently as an oracle for the
specified operation. **Native equivalent for the prototype** means the feature
works end to end within the documented subset, but upstream response/state
parity has not been established. **Missing** means no implementation exists.

| Feature / original Core unit | Implementation in this repository | Verified behavior | Remaining difference |
|---|---|---|---|
| Quantity price: `Checkout/Cart/Price/{GrossPriceCalculator,NetPriceCalculator,CashRounding}.php`, `Tax/TaxCalculator.php`, price structs | `src/pricing.rs`, consumed in `cart_price.rs` and checkout | **Partial port:** 2,144 original-PHP comparisons of every returned price/tax field; unit rounding, gross/net, intervals, empty/multiple/duplicate taxes, list/regulation/reference metadata | Sales-channel tax-state resolution, currency conversion, complete processor pipeline |
| Context: `System/SalesChannel/Context/ContextFactory.php`; `Content/Product/SalesChannel/Price/ProductPriceCalculator.php`, `Aggregate/ProductPrice/ProductPriceCollection.php`, `Cart/ProductCartProcessor.php` | `src/context.rs`, `localization.rs`, `cart_price.rs` | **Partial port:** 1,446 original-PHP cases: one-parent/system language chain, first matching rule priority, tier ordering/selection and floor quantity steps | Complete context hydration, complete upstream sales-channel membership semantics, full original rule evaluation and DAL translations |
| Proportional shipping taxes: `Checkout/Cart/Tax/PercentageTaxRuleBuilder.php` | `src/pricing.rs::proportional_tax_rules`, `commerce/delivery.rs` | **Partial port:** 1,002 original-PHP cases including empty/zero and mixed-rate inputs; native checkout consumes it | Entire delivery price/processor context and tax detection |
| Product details: `Content/Product/SalesChannel/Detail/ProductDetailRoute.php` | `commerce/detail.rs`, `catalog_model.rs`, frontend `ProductPage.tsx` | **Native equivalent for prototype:** actual SKU detail route, contextual prices, gallery, family and approved review aggregate | Original UUID/response schema, criteria/associations, visibility and full context inheritance |
| Variants: product parent/children and configurator settings | `commerce/catalog.rs`, migrations 006/007/009, `ProductPage.tsx` | 11 real purchasable SKUs in six families; explicit option combinations; each SKU owns price/stock/media/properties; child inherits parent localized text and initialized tiers | Generic variant generation, arbitrary inheritance masks, configuration sorting/exclusions, original closeout behavior, generic catalog editing/import UI |
| Multiple media and product properties | `catalog_model.rs`, `commerce/detail.rs`, `frontend/public/media`, gallery/property views | Three ordered illustrations per SKU; property display; selected variant gallery and capacity change | Media upload/storage/transform pipeline, real photographs, global property groups, filter/SEO/CMS integration |
| Reviews: `Content/Product/Aggregate/ProductReview` and product review route | `commerce/reviews.rs`, `review_moderation.rs`, `detail.rs`, `admin/catalog/ReviewModeration.tsx + admin/orders/OrderWorkflow.tsx` | Pending submission → authorized tenant moderation → actual aggregate. Verified purchase uses completed cart/account evidence, never client session claims | Production account recovery/verification, spam/rate limits, original validation, review pagination/sorting/localization and verified-purchase policy |
| Advanced prices | `context.rs`, `cart_price.rs`, detail tier preview | First matching group rule; public 1/6/12 tiers, B2B 1/5 tiers; server detail/cart share price operation | Arbitrary original rule AST, currency and complete inherited product-price records |
| Tax configuration: `System/Tax` | `commerce/configuration.rs`, `tax.rs`, `settings_validation.rs`, `settings_mutation.rs` | Editable standard/reduced country rates; preserve base net value; country changes update cart/detail; persisted revision and validated configuration | Tax IDs/exemption/VAT verification, original jurisdiction/state rules, OSS/accounting/compliance and general class assignment; seeded rates are demo settings |
| Shipping: delivery builders/calculators and `System/Shipping` | `commerce/delivery.rs`, `context_routes.rs`, order snapshots | Country eligibility, active methods, gross fees/free threshold, highest/proportional tax, address and calendar date range. Removed methods retain items and require new explicit selection | Multiple delivery groups/warehouses, general warehouse reservations/backorders/restock (Sandbox payment reservations now exist), working-day calendars, weight/dimension/rule price matrices, carrier rates/labels/webhooks |
| Payment methods and order transactions: `Checkout/Payment` | `commerce/types.rs`, `settings_*`, `order_checkout.rs`, `fulfillment.rs` | Simulated card authorization and manual bank transfer; B2B-only invoice eligibility. Persisted chosen method and pending/authorized→paid transition | **No live-money PSP charge**; native Sandbox capture/refund/reconciliation now exists in `src/payments/*` with contract tests, but original handler parity, authorization/void, fraud checks, legal invoice generation, full original state machine |
| Deliveries and fulfillment | `commerce/fulfillment.rs`, `admin/catalog/ReviewModeration.tsx + admin/orders/OrderWorkflow.tsx` | Owning merchant marks open→shipped→delivered with tracking and optimistic revision; completed cart keeps immutable quote and latest order state | Physical fulfillment, carrier integration, split/partial shipments, returns/cancellation and stock restitution |
| Atomic order path: cart order route/order persister | `order_checkout.rs`, cart modules, outbox | Native transaction stock locks, persisted idempotency, single order for parallel retries, snapshots and event. HTTP/MCP/UCP consume shared operations | Original conversion graph/collectors/processors/events, monetary decimal overhaul, general inventory reservations (Sandbox payment reservations now exist), full error semantics |
| Merchant users/ACL and SaaS workspaces | `src/auth/*`, migration 008, `UsersManager.tsx` | **Native SaaS extension:** personal Argon2 accounts, independent tenant memberships, four roles, single-use expiring invitations, hashed sessions, multi-workspace selection and next-request revocation | Production identity/OIDC/MFA/recovery/email verification, rate limits, tenant lifecycle/billing/domains, core-wide RLS and physical tenant separation. Customer demo login remains separate |
| Extension system | `sandbox.rs`, `extensions.rs`, four WAT examples | Actual B2B purchase hook, tenant activation/revision, import/fuel/memory/stack restrictions, persisted-policy refresh across app instances | Original PHP plugins, automatic PHP→Rust/Wasm compilation, general hook ABI and process-isolated compiler |
| App custom entities / admin modules / event actions | `src/apps/*`, migration 010, `AppsManager.tsx`, iframe SDK and four app manifests | **Native prototype:** versioned typed tables, tenant references/RLS, additive upgrades, role-checked HTTP/MCP actions, product/admin slots, separate service and durable events | Original app registration/signing/permissions protocol, DAL interoperability, general component runtime, marketplace/install trust, destructive migrations |
| Order association memory and merchant-approved recommendations | `src/cognition/*`, outbox, PostgreSQL, `KnowledgeView.tsx`, `MemoryRecommendations.tsx` | **Native extension:** persisted order/event evidence, deduplication, hypothesis approval and actual public consumer | No original Shopware equivalence claimed; experiments/causal uplift/weight training missing |
| Native external payment adapter | `src/payments/*`, payment UI, `scripts/payments.py` | Configured PayPal Sandbox/Live create/capture/reconcile/refund, reserved stock/release, webhook postback verification, restart and uncertain receipts using local contract server | No actual Sandbox account run or live charge; Shopware Payments connector remains unavailable; original payment API/state parity missing |
| Full DAL, category/search criteria, CMS, subscriptions, returns and currencies | — | **Missing**, except native bounded catalog/search paths | Port as separate source units with original fixtures and state/response comparisons; partial rules/flows/promotions/customer accounts are listed below |
| Commercial B2B modules | — | **Missing:** demo company pricing/approval is native prototype behavior | Licensed source/entitlement and explicit independent parity scope required |

## Tests and evidence

`cargo test --locked` protects pure rules, parsers, credentials and sandbox
boundaries. `scripts/{differential,context_differential,delivery_differential,rule_differential}.py`
execute original PHP classes. `commerce.py` proves native product→cart→tax/
shipping/payment→order→delivery/review behavior, including counterexamples.
`users.py` attacks permissions, cross-shop state and existing-session revocation.
`extensions.py` activates three actual guest policies and submits allowed/blocked
B2B orders. Existing integration/protocol/studio/intelligence/provider suites
protect the former application paths after the module split. `apps.py`,
`services.py` and `payments.py` test the new native extension paths.

There is **no measured 100% line/branch coverage claim** and no blanket claim
that all possible inputs or all Shopware behaviors are covered. Important
remaining tests include large catalogs, replica failover, long-running load,
production identity abuse, real PSP/carrier integration and complete protocol
conformance. Executable migration units live in `porting/units.json`.


## Additional bounded ports and native workbench behavior

| Shopware area | Implementation | Status / verified scope | Remaining |
|---|---|---|---|
| `Framework/Rule/RuleComparison::numeric`, `Framework/Util/FloatComparator` | `rule_comparison.rs`, `marketing/rules.rs` | **Partial port:** 1,280 original-PHP cases, null/empty/unsupported operators and 1e-8 boundaries. JSON float roundtrip parsing preserves boundary inputs. | Complete rule hierarchy and full calendar/validation matrices; current string/array comparisons and source conditions are covered below |
| Rule Builder conditions | `automation_rules/*`, `marketing/{facts,rule_snapshot,rules}.rs`, Studio rule editor | **Partial port:** 114 reflected production classes, 108 native scopes; 432 actual PHP cases across 74 classes; AND/OR/NOT/XOR, line quantifiers, metadata and saved references | Six disabled runtimes, full original validation/data/UUID/line-scope parity; see [automation](automation.md) |
| Flow Builder | `marketing/{pipeline,pipeline_runtime,flow_actions,flow_mutations}.rs`, outbox/workers, Studio canvas | **Partial port:** connected true/false graph, multi-action sequence, durable delay/stop, 16 Core action names with bounded native configurations; current-rights checks and per-step receipts | Complete source trigger producers, arbitrary mail templates/document/group configuration, subflows and original FlowSequence interchange; see [automation](automation.md) |
| Promotions/vouchers/actions | `marketing/promotions.rs`, `discount.rs`, cart/order paths | **Native prototype:** automatic/coded percentage/fixed/free-shipping discounts, priorities/exclusivity/windows/global uses, exact-cent allocation, tax and concurrent usage checks | Shopware set groups/packages/filter calculators, individual coupon redemption, per-customer limits, currency/source processor parity |
| Customer account profile/order routes | `accounts/*`, `customer.rs`, `CustomerAccount.tsx` | **Native prototype:** registration/login, trusted group, profile/address/password/logout, own order history without cart secrets | Recovery/verification/email changes, consent/account deletion, full original account schema/route compatibility |
| Product specification/SEO/cross-selling/free shipping | `commerce/product_edit.rs`, product `extra`, PDP and delivery | **Native prototype:** configured content locales with shop-main inheritance, names/descriptions, bounded translated specs, SEO title/description/slug metadata, own cross-selling IDs, shipping-free flag consumed in quote | Server-rendered SEO routes, complete custom fields/media/cross-selling groups, arbitrary inherited advanced prices/currency |
| Sales channels / multishop | `marketing/channels.rs`, cart binding, catalog/detail/order/handoff, `auth/provision.rs` | **Native prototype:** independent shop tenants and multiple storefront/headless channel catalogs/locales inside a tenant | Full context hydration, automatic domain provisioning, currencies and full upstream channel entity semantics |
| Live/staging/app development | `staging/*`, `developer/*`, migrations 013 | **Native SaaS extension:** immutable declarative app drafts, private tenant preview, typed schema/API/UI, exact selected releases and live conflicts | Full source IDE/Git operations, isolated service compilation/deploy, destructive migrations, rollback/merge and large-catalog branch mechanics |
| PDP knowledge and session personalization | `documents/*`, SQL relations/Qdrant, `experience.rs` | **Native AI extension:** published cited sources and persisted ranking consumed by actual PDP/catalog, shopper opt-in/clear | Real model answer quality, language correctness for every provider, ANN scale, causal economics and learned LLM weights |

See [workbench.md](workbench.md) for the precise supported contract and
[deployment.md](deployment.md) for the prepared self-hosted/Vercel split.

## Customer and operational delta (2026-10-02)

Original entity references: `Checkout/Customer/CustomerDefinition.php`,
`Aggregate/CustomerAddress/CustomerAddressDefinition.php`,
`Checkout/Order/OrderDefinition.php` and its address/customer/transaction aggregates.
The reference package remains pinned above; the public upstream definitions were
also consulted for field responsibilities. The native identifiers, country model,
response envelopes and operation paths differ.

| Feature | Native implementation | Evidence | Still missing |
|---|---|---|---|
| Customer fields and address book | `accounts/contacts.rs`, `metadata.rs`, `address_store.rs`, `profile.rs`, `operations/customers.rs` | Structured names/contact/company/VAT/birthday; stable identity/number; defaults; first/last login; order metrics; real tenant-owned CRUD and revision conflicts | Full original DAL response/criteria, verification/recovery/MFA, email identity changes, original salutation/country UUID catalogs, guest account records, marketing double opt-in, full original custom-field/tag definitions and imported historical metrics; native typed metadata and tag flow actions are implemented |
| Connected buyer checkout | `customer.rs`, `cart_storage.rs`, `commerce/context_routes.rs`, `accounts/order_snapshot.rs`, `order_checkout.rs`, frontend account/address/checkout components | Registration → login → defaults → own selection → order → own history, with independent sessions and immutable billing/shipping copies; guest-email negative test | Complete original Store API route/schema/error parity, production consent/legal flows, saved payment instruments, multi-currency and general channel domains |
| Order read fields and operational state | `commerce/order_fields.rs`, `order_machine.rs`, `order_workflow.rs`, `fulfillment.rs`, `operations/orders.rs` | Native totals/line items/address/transaction projection, one-click eligible actions, indexed delivery tracking, six repeated concurrent requests produce one state effect and flow note | Original full state machine, multiple partial transactions, split delivery/returns/carrier operations and full DAL conversion |
| Central issuer and immutable documents | `operations/receipts.rs`, `receipt_pdf.rs`, `receipt_text.rs`, `SettingsWorkspace.tsx` | Four language PDFs, transactional numbers, concurrent receipt idempotency, billing vs delivery address, original bytes retained after account/issuer edits | Full original document generators/templates/number-range semantics, legal/e-invoice certification and general Unicode fonts |
| Fine team and integration access | `auth/permissions.rs`, `integrations.rs`, `members.rs`, `invitations.rs` | Fifteen HTTP/MCP scopes, explicit overrides, per-shop keys, expiry/revocation and non-escalating role/invite delegation | Original ACL privilege graph and production IdP/account recovery |
| Files, digital products and rich content | `assets/*`, `staging/assets.rs`, rich/attachment/download frontend components | Typed localized blocks, MIME/magic checks, private paid downloads, immutable entitlement, mixed physical delivery and selected digest release | AV/object storage/media transforms, partial-line refund entitlements, full CMS/product-data model |
| App workflow extension | `commerce/order_machine.rs`, `operations/workflow.rs`, `marketing/flows.rs`, app event deliveries | Native app provenance, translated custom states/edges, immutable event conditions, durable app inbox and actual flow notes | Complete upstream app state/FlowSequence signing/registration protocol; native graphical branches, sequences and delays are implemented above |
| PayPal attribution and durable refunds | `payments/*` | Local Orders v2 wire contract, explicit configured private attribution header, single capture on lost response, pending refund lookup and restart | Actual Sandbox/Live PSP validation, advanced PayPal features and supported Shopware Payments standalone contract |

The customer and operational rows above are native end-to-end behaviors, without
a new original-PHP entity/state parity proof. The current 7,000 original-PHP
comparisons cover the narrowly specified pricing, context, shipping-tax,
comparison primitives and 432 condition cases across 74 original rule classes.
They do not establish equivalence of whole entities, triggers or flow sequences.

## Formal safeguards (additional to upstream behavior comparison)

Twenty selected Rust commerce policies are backed by forty-five Lean theorems and
compiled Rust/Lean conformance checks. They preserve native admission/cap rules
in checkout, permissions, operational transitions, refunds, receipts and downloads.
This is a bounded new safeguard, **not proof of full Shopware equivalence** or of
all surrounding implementation. The original PHP differential suites and real
HTTP/PostgreSQL checks remain separate. See [formal coverage](formal-verification.md)
and the machine-readable inventory in `proof/manifest.json`.

## Connected-app migration update

The rule framework now shares original Shopware numeric, string, string-array and UUID
comparison behavior, checked against 1,976 PHP cases. The graphical rule editor edits
real AND/OR/NOT condition trees; original supported condition payloads normalize through
`/api/automation/import-condition`. The common native checkout scopes include customer
email/authentication/group, country, shipping/payment method, sales channel and cart
conditions. `cartLineItem` handles parent-product matching and original per-line negative
operators, and `cartLineItemsInCartCount`/`customerCustomerGroup` are accepted source names.

The newer reflected production inventory is **114 concrete original Rule subclasses**, of which **108 have an executable native scope**. The previous 120-name regex inventory included non-executable/test names and is retained only as historical material. The executable catalog is `reference/automation-registry.json`; `reference/automation-native.json` explicitly records each binding. Direct original class comparisons now add 432 cases across 74 scopes to the comparison-primitive suite. Complete behavior remains unproved and each catalog row keeps `behavioralParity:false`. The six disabled classes, data/validation boundaries and exact native Core action contracts are listed in [automation](automation.md). Original entity UUIDs require explicit identity migration to native IDs. Existing native `lineItemId` and `shippingCountry` remain distinct legacy conditions.

App subscriptions and own typed app events now share the durable outbox. Flow app actions
use the same HTTP/MCP gateway and recheck current rights before delivery. GA4, Gmail and
Slack are new independent integrations, not claimed ports of an original Shopware provider
plugin. Their real wire/database fixtures and live-credential boundary are documented in
`docs/connected-apps.md`.

## Full-app extension delta (2026-10-03)

Native app contracts now include own Studio modules, product/order panels,
storefront pages/slots, namespaced HTTP aliases, selected AI tools/context,
managed JSONB data and independently deployed code/storage. The Product Lab
example exercises the shared UI/API/MCP gateway and overloaded-service isolation.
See [the full app contract](app-platform.md). This is additional native extension
capability, not Shopware PHP plugin ABI, App Script or Administration module parity.

## Central product workspace and native categories (2026-10-05)

The native editor is now a searchable/filterable list plus create/detail workflows,
not a metadata-only form. Migration 026 and `categories/*` add real translated
category trees, many-to-many assignments, active/visible semantics, nested-listing
control and per-channel navigation roots. `commerce/product_admin*`,
`product_channels.rs`, `product_fields.rs` and `product_edit.rs` share atomic writes
with MCP, graph synchronization and product outbox events. Ordered media uploads,
visual rich documents, native SKU creation and selective staging have real consumers.

This supersedes the older “generic catalog editing UI missing” entry; complete
variant generation, global property/manufacturer entities, CMS/product streams,
original API/DAL schemas and full SEO URL generation remain missing.
[Exact source mapping, implemented behaviors and gaps](product-management.md).

## International configuration delta (2026-10-05)

Country and tax concepts follow original `System/Country`, `System/Tax` and
Shopware Administration settings. The native subset lives in
`commerce/geography.rs`, `tax_rules.rs`, `tax_context.rs`, `settings_validation.rs`
and the Settings Studio modules. It adds the world catalogue, US subdivisions,
tenant overlays, destination/postcode/date/Rule Builder resolution, custom product
tax classes and localized shipping/payment availability. `international_commerce.py`
checks actual prices, checkout snapshots, invalid geography and tenant boundaries.
This is **native prototype equivalence for the documented subset**, not an
original-PHP tax-detection comparison or full Shopware DAL/API parity.

`localization.rs`, `commerce/content_text.rs`, `product_languages.rs` and
`product_edit.rs` implement configurable main-language and per-field inheritance.
`translations/` is a native AI extension with durable drafts, bounded jobs and
revision-protected apply, covered by the restart/provider/permissions fixture suite.
See [the full international contract](international-commerce.md) for remaining
compound tax/currency, worldwide subdivision, full UI-language and model-quality gaps.

## Company identity and sales-channel configuration

The native `operations/company_model.rs`, `master_data.rs`, `company_logo.rs` and
`company_public.rs` replace this prototype's flat issuer settings with structured
address/company/legal metadata, revisioned sparse per-channel inheritance,
localized brand/legal text, validated tenant logo uploads and Store API identity.
`staging/company.rs` publishes basis/channel units selectively; receipts resolve
the order's channel and freeze the effective issuer. This is native functional
coverage inspired by Shopware's sales-channel settings, not a claim of identical
SystemConfig/DAL wire compatibility. Other commerce settings remain shop-wide,
full upstream settings/import formats are not equivalent, and the minimal PDF
renderer does not embed a logo. See [contracts and tests](company-settings.md).

## Channel settings and media workspaces (2026-10-05)

See [the settings/media guide](settings-media.md) for the current single-language editor, field-level checkout overrides, dependency-safe method removal, gallery and optional private image jobs. These are native prototype extensions; they do not establish additional full Shopware API/DAL parity, current tax law, paid-provider quality or whole-system formal certification.

## CRM usability and native history delta (2026-10-05)

Independent default address card actions, linked customer/order/product editors
and configured translated customer groups now run through native API/MCP
contracts. Exact group IDs drive rules/flows/tier prices; their explicit price
basis drives gross/net presentation. Shared definitions cannot be overridden
per channel. This remains a native implementation, not original customer-group
DAL/UUID or complete criteria compatibility.

Thirteen entity history types (including inspection-only orders) now record
transactional before/after aggregates; twelve editable types delegate rollback
to current domain validation. Credentials, immutable identity/login metadata and
financial events are not rewound. Historical Shopware versions are not imported
or synthesized. [The history contract](entity-history.md) lists all boundaries.

Checkout review and approval return: `order_checkout.rs`, `payments/storage.rs`,
`payments/return_urls.rs` and `frontend/src/storefront/checkout/*` provide native
one-page selection, revision/amount confirmation and verified approval capture.
Local PostgreSQL/provider fixtures cover stale reviews, replay and forged returns.
No full Shopware Payments, accelerated wallet/card or conversion-uplift parity is claimed.
