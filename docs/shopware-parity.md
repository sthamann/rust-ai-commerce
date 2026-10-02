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
| Context: `System/SalesChannel/Context/ContextFactory.php`; `Content/Product/SalesChannel/Price/ProductPriceCalculator.php`, `Aggregate/ProductPrice/ProductPriceCollection.php`, `Cart/ProductCartProcessor.php` | `src/context.rs`, `localization.rs`, `cart_price.rs` | **Partial port:** 1,446 original-PHP cases: one-parent/system language chain, first matching rule priority, tier ordering/selection and floor quantity steps | Complete context hydration, sales-channel language membership, original rule evaluation and DAL translations |
| Proportional shipping taxes: `Checkout/Cart/Tax/PercentageTaxRuleBuilder.php` | `src/pricing.rs::proportional_tax_rules`, `commerce/delivery.rs` | **Partial port:** 1,002 original-PHP cases including empty/zero and mixed-rate inputs; native checkout consumes it | Entire delivery price/processor context and tax detection |
| Product details: `Content/Product/SalesChannel/Detail/ProductDetailRoute.php` | `commerce/detail.rs`, `catalog_model.rs`, frontend `ProductPage.tsx` | **Native equivalent for prototype:** actual SKU detail route, contextual prices, gallery, family and approved review aggregate | Original UUID/response schema, criteria/associations, visibility and full context inheritance |
| Variants: product parent/children and configurator settings | `commerce/catalog.rs`, migrations 006/007/009, `ProductPage.tsx` | 11 real purchasable SKUs in six families; explicit option combinations; each SKU owns price/stock/media/properties; child inherits parent localized text and initialized tiers | Generic variant generation, arbitrary inheritance masks, configuration sorting/exclusions, original closeout behavior, generic catalog editing/import UI |
| Multiple media and product properties | `catalog_model.rs`, `commerce/detail.rs`, `frontend/public/media`, gallery/property views | Three ordered illustrations per SKU; property display; selected variant gallery and capacity change | Media upload/storage/transform pipeline, real photographs, global property groups, filter/SEO/CMS integration |
| Reviews: `Content/Product/Aggregate/ProductReview` and product review route | `commerce/reviews.rs`, `review_moderation.rs`, `detail.rs`, `CommerceManager.tsx` | Pending submission → authorized tenant moderation → actual aggregate. Verified purchase uses completed cart/account evidence, never client session claims | Full account lifecycle, spam/rate limits, original validation, review pagination/sorting/localization and verified-purchase policy |
| Advanced prices | `context.rs`, `cart_price.rs`, detail tier preview | First matching group rule; public 1/6/12 tiers, B2B 1/5 tiers; server detail/cart share price operation | Arbitrary original rule AST, currency and complete inherited product-price records |
| Tax configuration: `System/Tax` | `commerce/configuration.rs`, `tax.rs`, `settings_validation.rs`, `settings_mutation.rs` | Editable standard/reduced country rates; preserve base net value; country changes update cart/detail; persisted revision and validated configuration | Tax IDs/exemption/VAT verification, original jurisdiction/state rules, OSS/accounting/compliance and general class assignment; seeded rates are demo settings |
| Shipping: delivery builders/calculators and `System/Shipping` | `commerce/delivery.rs`, `context_routes.rs`, order snapshots | Country eligibility, active methods, gross fees/free threshold, highest/proportional tax, address and calendar date range. Removed methods retain items and require new explicit selection | Multiple delivery groups/warehouses, general warehouse reservations/backorders/restock (Sandbox payment reservations now exist), working-day calendars, weight/dimension/rule price matrices, carrier rates/labels/webhooks |
| Payment methods and order transactions: `Checkout/Payment` | `commerce/types.rs`, `settings_*`, `order_checkout.rs`, `fulfillment.rs` | Simulated card authorization and manual bank transfer; B2B-only invoice eligibility. Persisted chosen method and pending/authorized→paid transition | **No live-money PSP charge**; native Sandbox capture/refund/reconciliation now exists in `src/payments/*` with contract tests, but original handler parity, authorization/void, fraud checks, legal invoice generation, full original state machine |
| Deliveries and fulfillment | `commerce/fulfillment.rs`, `CommerceManager.tsx` | Owning merchant marks open→shipped→delivered with tracking and optimistic revision; completed cart keeps immutable quote and latest order state | Physical fulfillment, carrier integration, split/partial shipments, returns/cancellation and stock restitution |
| Atomic order path: cart order route/order persister | `order_checkout.rs`, cart modules, outbox | Native transaction stock locks, persisted idempotency, single order for parallel retries, snapshots and event. HTTP/MCP/UCP consume shared operations | Original conversion graph/collectors/processors/events, monetary decimal overhaul, general inventory reservations (Sandbox payment reservations now exist), full error semantics |
| Merchant users/ACL and SaaS workspaces | `src/auth/*`, migration 008, `UsersManager.tsx` | **Native SaaS extension:** personal Argon2 accounts, independent tenant memberships, four roles, single-use expiring invitations, hashed sessions, multi-workspace selection and next-request revocation | Production identity/OIDC/MFA/recovery/email verification, rate limits, tenant lifecycle/billing/domains, core-wide RLS and physical tenant separation. Customer demo login remains separate |
| Extension system | `sandbox.rs`, `extensions.rs`, four WAT examples | Actual B2B purchase hook, tenant activation/revision, import/fuel/memory/stack restrictions, persisted-policy refresh across app instances | Original PHP plugins, automatic PHP→Rust/Wasm compilation, general hook ABI and process-isolated compiler |
| App custom entities / admin modules / event actions | `src/apps/*`, migration 010, `AppsManager.tsx`, iframe SDK and four app manifests | **Native prototype:** versioned typed tables, tenant references/RLS, additive upgrades, role-checked HTTP/MCP actions, product/admin slots, separate service and durable events | Original app registration/signing/permissions protocol, DAL interoperability, general component runtime, marketplace/install trust, destructive migrations |
| Order association memory and merchant-approved recommendations | `src/cognition/*`, outbox, AGE, `MemoryView.tsx`, `MemoryRecommendations.tsx` | **Native extension:** persisted order/event evidence, deduplication, hypothesis approval and actual public consumer | No original Shopware equivalence claimed; experiments/causal uplift/weight training missing |
| Native external payment adapter | `src/payments/*`, payment UI, `scripts/payments.py` | PayPal Sandbox create/capture/reconcile/refund, reserved stock/release, webhook postback verification, restart and uncertain receipts using local contract server | No actual Sandbox account run or live charge; Shopware Payments connector remains unavailable; original payment API/state parity missing |
| Rule Builder, promotions, Flow Builder, DAL, categories/search criteria, CMS, subscriptions, returns, currency, customer registration | — | **Missing**, except explicitly bounded selectors and native catalog/search noted above | Port as separate source units with original fixtures and state/response comparisons |
| Commercial B2B modules | — | **Missing:** demo company pricing/approval is native prototype behavior | Licensed source/entitlement and explicit independent parity scope required |

## Tests and evidence

`cargo test --locked` protects pure rules, parsers, credentials and sandbox
boundaries. `scripts/{differential,context_differential,delivery_differential}.py`
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
