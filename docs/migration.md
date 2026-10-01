# Shopware migration as an executable sequence

Reference: Shopware Core **6.7.14.2**, commit
`de074a584d77d8abb09ddb21d8799f083a61a3da`. Version changes create a new
reference gate; a passing old gate must not silently prove a newer version.

| Unit | Current state | Next acceptance question |
|---|---|---|
| Quantity price | Partial behavioral port; independent PHP gate | Add reference/list/regulation price and multi-tax allocation |
| Product | Durable synthetic catalog | Import UUIDs, variants, translations and inherited prices with exact response contracts |
| Customer context | Demo guest/company carts with token rotation | Real account lifecycle, sales-channel context and customer group matching |
| Cart | Native item cart and optimistic revisions | Original collector/processor order, promotions, errors and iterative rule matching |
| Checkout/order | Native atomic simulated checkout | Original conversion snapshots, delivery, payment state machine and reservation semantics |
| Rule Builder | Two explicit group/quantity conditions | Typed port of original rule AST and original fixture comparison |
| API | Selected paths with native envelopes | Route-by-route exact schemas, criteria semantics, headers, aliases and errors |
| Extensions | Pure Wasm company approval hook | Capability-bound migration of one actual extension and its dependencies |
| Commercial B2B | Synthetic group pricing demonstration | Licensed source, entitlement and a separately agreed parity contract |

## First verified port

`reference/price.php` loads the original Shopware classes through Composer:

- `Checkout/Cart/Price/GrossPriceCalculator.php`
- `Checkout/Cart/Price/NetPriceCalculator.php`
- `Checkout/Cart/Price/CashRounding.php`
- `Checkout/Cart/Tax/TaxCalculator.php`
- `Checkout/Cart/Tax/Struct/CalculatedTax.php`
- `Checkout/Cart/Price/Struct/QuantityPriceDefinition.php`
- `Framework/Util/FloatComparator.php`

Rust reproduces one tax rule at 100% allocation, unit rounding before total,
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
