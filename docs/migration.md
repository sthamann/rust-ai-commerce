# Shopware migration as an executable sequence

Reference: Shopware Core **6.7.14.2**, commit
`de074a584d77d8abb09ddb21d8799f083a61a3da`. Version changes create a new
reference gate; a passing old gate must not silently prove a newer version.

| Unit | Current state | Next acceptance question |
|---|---|---|
| Quantity price | Partial behavioral port; independent PHP gate | Resolve original sales-channel tax state and currency context |
| Product | Durable synthetic catalog | Import UUIDs, variants, translations and inherited prices with exact response contracts |
| Customer context | Guest/company token rotation; bounded language-chain port | Real account lifecycle, sales-channel context and customer group matching |
| Cart | Native item cart and optimistic revisions | Original collector/processor order, promotions, errors and iterative rule matching |
| Checkout/order | Native atomic simulated checkout | Original conversion snapshots, delivery, payment state machine and reservation semantics |
| Rule Builder | Original rule-priority/tier selection, demo membership rules | Typed port of original rule AST and original fixture comparison |
| API | Selected paths with native envelopes | Route-by-route exact schemas, criteria semantics, headers, aliases and errors |
| Extensions | Pure Wasm company approval hook | Capability-bound migration of one actual extension and its dependencies |
| Commercial B2B | Synthetic group pricing demonstration | Licensed source, entitlement and a separately agreed parity contract |

## Initial v0.1 pricing slice (expanded below)

`reference/price.php` loads the original Shopware classes through Composer:

- `Checkout/Cart/Price/GrossPriceCalculator.php`
- `Checkout/Cart/Price/NetPriceCalculator.php`
- `Checkout/Cart/Price/CashRounding.php`
- `Checkout/Cart/Tax/TaxCalculator.php`
- `Checkout/Cart/Tax/Struct/CalculatedTax.php`
- `Checkout/Cart/Price/Struct/QuantityPriceDefinition.php`
- `Framework/Util/FloatComparator.php`

The initial v0.1 port reproduced one tax rule at 100% allocation, unit rounding before total,
gross/net and calculated flags, cash interval, net rounding option and the
default `precision=14` tax cast. Differential cases include decimal ties,
both sides of ties, negative amounts, quantity multiplication, 0/7/19/20% tax,
0.01/0.05 intervals, and 2/3 decimal places. This is a bounded behavioral port,
not a proof for all floats, all PHP settings or the whole cart pipeline.

## Workflow for every next unit

1. Select the smallest domain function and its original call-site/context.
2. Add independently executed original fixtures, including the first decisive
   counterexample. A Rust reimplementation in PHP is not an oracle.
3. Let an agent read source/context and propose a Rust patch. Keep generated
   code reviewable; do not trust a translation merely because it compiles.
4. Run unit differential, API contracts and the existing full purchase path.
5. Record verified scope and remaining differences in `porting/units.json`.
6. Route only the verified operation to Rust; keep the PHP reference/fallback
   until the new gate covers its relevant context and observable state.

`scripts/port.py` runs named unit gates from the manifest. This automates
verification and packages the exact original paths for the next coding agent.
It does not claim to generate a correct full-core port automatically. A future
translation orchestrator should create an isolated branch, produce a patch,
run these gates and submit a diff; failed parity cannot promote its route.

API conformance will need sanitized requests against a seeded original shop
and Rust: compare status/headers/body **and state changes**. Unknown routes
must remain explicitly unsupported. No current test certifies full Store API,
Admin API, Shopware Administration or plugin compatibility.

## v0.2 pricing port

The same original PHP reference now covers 2,144 cases and every returned
field: tax allocation (including duplicate-rate collection replacement and
empty rules), list-price discounts, regulation price and reference units.
The expanded Rust calculator is used by the real cart, checkout, MCP and UCP
paths. Synthetic lamp/list and notebook/reference metadata is initialized once.
This does not port the complete cart collector/processor or resolve a sales
channel's tax state. Full rules, variant inheritance, delivery builders and payment-provider flows
still need their own original-reference ports. Native v0.4 commerce functionality
is tracked separately below.

## v0.3 context and product-cart slice

`reference/context.php` invokes original private methods through Reflection.
The context factory uses a real DBAL connection with synthetic language rows;
tier selection uses original entities, collections, rule filtering, collection
sorting and ProductCartProcessor price-definition selection. Fixture discount
values act as distinct calculated-price markers; this gate tests selection, not
currency price hydration. 1,446 cases cover unavailable/invalid/missing language
IDs, one-parent fallback, duplicate system-language entries, missing rules,
priority order, unsorted tiers, gaps, open ends, beyond-last quantities and
floor rounding below a minimum.

`src/context.rs` supplies the shared ports. Native locale hydration falls back
field-by-field and is used by the catalog, persisted carts, merchant overview
and actual model input. It is not a port of the complete DAL translation loader.
The demo makes all seeded languages available to both tenants; production
sales-channel language membership still needs its own source fixtures.

The cart combines the ported floor rule with native clamping to minimum/maximum.
It returns the effective quantity so the client can explain adjustments. The
original full processor's errors, closeout availability, inherited fields and
collector lifecycle are not covered by this clamp. Advanced tier fixtures are
initialized once for both demo tenants and retain the prior 10%/15% B2B behavior.

Use `python3 scripts/port.py verify context-tier-quantity` against a running app.
The manifest records the remaining behaviors without marking this whole unit
complete. `scripts/studio.py` also proves that the real preview and persisted
cart consume these ports, rather than merely testing an unused utility.

## v0.4 native commerce and SaaS slice

See [the precise parity matrix](shopware-parity.md) for every implemented feature,
original unit, implementation file, executable evidence and remaining behavior.
Product details now connect real SKU combinations, three images, properties,
moderated reviews and contextual quantity prices to carts. Shipping methods,
destination country tax rates, manual/simulated payments and internal delivery
state transitions persist in real order snapshots. The original proportional
tax builder contributes another 1,002 independently compared cases.

Personal merchant users and multi-workspace memberships are a native addition,
not an original Shopware identity port. Roles also protect MCP mutation, and
revocation is checked from the DB on subsequent requests. Four Wasm examples
exercise a bounded actual B2B checkout hook. The source is split into documented
Rust domains, with a size guard and a [source/test map](source-map.md).

No full product/DAL/fulfillment/payment API parity is inferred from these native
features. A next original port should target one product inheritance resolver
or delivery rule operation with sanitized original state fixtures.
