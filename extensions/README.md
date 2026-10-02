# Tenant extension examples

The working ABI is `approve(total_minor: i64, limit_minor: i64) -> i32`.
Amounts are integer EUR cents; zero rejects and any nonzero result allows.
The hook runs in the **actual B2B order transaction**, after authoritative
item + shipping totals and inventory checks, before any stock/order mutation.
B2C orders do not invoke this hook. No guest can rewrite prices or access data.

| Example | Business policy | Boundary example |
|---|---|---|
| [company-limit.wat](company-limit.wat) | Supplied company purchase budget | 100,000 cents allowed; 100,001 rejected |
| [budget-reserve.wat](budget-reserve.wat) | Preserve EUR 100 of that budget | At a EUR 1,000 budget, EUR 900 allowed; EUR 900.01 rejected |
| [minimum-order.wat](minimum-order.wat) | Minimum EUR 50, respecting the budget | EUR 49.99 rejected; EUR 50 allowed |
| [single-order-cap.wat](single-order-cap.wat) | At most EUR 250 per purchase, respecting the budget | EUR 250 allowed; EUR 250.01 rejected |

The current demo supplies a EUR 1,000 **per-purchase** budget. It is not a
monthly/remaining-credit ledger; purchases do not consume a company budget.
Policies are alternatives: activating one replaces the previous hook for the
selected tenant. They are not automatically composed.

## Activate a policy

An owner/administrator can call `POST /api/extensions/activate` with
`{"wat":"...contents of the selected example..."}`, personal bearer session,
and `x-tenant`. The server compiles and probes it before persisting source,
SHA-256 digest and revision. Checkout reuses compiled modules while creating
an isolated Store for each invocation. It reads the persisted policy inside
the transaction: changes from another application instance refresh a stale
local compiled module before purchase. Restarts restore the persisted source.

No host imports, WASI, filesystem, network or clocks are supplied. Guests have
10,000 fuel units, a 1 MiB linear-memory limit, a 256 KiB stack limit and a
32 KiB source limit. Traps fail closed and roll back the order transaction.
This is Wasmtime compilation of Wasm/WAT, **not PHP-to-Rust transpilation**.
Arbitrary existing Shopware plugins are not supported.

## Verify actual behavior

```sh
set -a; source .env; set +a
cargo test --locked sandbox
REPORT_PATH=.run/extensions.json python3 scripts/extensions.py
```

The HTTP check temporarily replaces the `workshop` demo policy, submits blocked
and allowed synthetic B2B purchases through the real cart/checkout API, checks
host-import/fuel/memory failures, and restores the exact previous policy even
on failure. It creates three simulated orders and changes synthetic inventory.
Use it against the local demo only. Set `TEST_TENANT` to another synthetic shop
containing the demo B2B buyer and template catalog if needed.

Adding hooks for discount rules, content or fulfillment requires a new typed
host contract, role authorization and transaction tests. A guest does not gain
those capabilities merely by exporting a function with that name.

## Versioned apps · API 1

The WAT examples above remain supported. The broader app API adds independently
installed packages with their own data, actions and UI. See
[full implementation and limits](../docs/intelligence-apps-payments.md).

| Package | Executable features | Example files |
|---|---|---|
| Product personalization | Own price-rule entity; HTTP/MCP read/write; product form; server-taxed per-unit cart surcharge; order configuration view; agent preview/approval | [manifest](apps/engraving/manifest.json) |
| Workshop notes | Own notes/tickets tables and tenant foreign reference; admin forms; native MCP actions; external service action, opaque iframe UI and durable SQLite event inbox | [manifest](apps/service-example/manifest.json), [service](apps/service-example/server.py), [browser SDK](sdk/browser.js) |
| PayPal Sandbox | Native provider adapter, checkout handoff, paid/refund ledger and app administration | [manifest](apps/paypal/manifest.json), [`src/payments`](../src/payments) |
| Shopware Payments readiness | Explicit connector status in admin; cannot process payment until its official standalone contract is verified | [manifest](apps/shopware-payments/manifest.json) |

Install built-ins with `POST /api/apps` and `{"builtIn":"engraving"}`, `paypal` or
`shopware_payments`, or submit `{"manifest":...}` for your own API-1 manifest.
Use an owner/admin personal session and the owning `x-tenant`. Installation is
atomic. `PUT /api/apps/{id}` accepts active/revision for deactivation/reactivation;
data and immutable version history remain. No uninstall/data deletion is provided.

A manifest declares `coreApi`, `id`, three-part `version`, localized `name`, `runtime`,
`permissions`, `entities`, `actions`, `slots` and `events`. Entity fields are
string/integer/boolean and may reference another entity in the same app. Root
metadata (`tenant`, `id`, `revision`) is core-owned. Identifiers are constrained;
DDL is generated, never submitted by the app. Each action has a typed flat
`inputSchema` and registered list/save/configurations/service handler. Arbitrary
JSON Schema nesting/validation keywords are not implemented.

`data.read`, `data.write`, `storefront.slot`, `admin.slot`, `service.call` and
`events.read` are supported capabilities. Public writes to managed entities are
prohibited. Public service actions must be explicitly declared and should be
read-only: their business side effects require an additional application-specific
customer authorization/approval contract. Do not put secrets in editor-writable
entities. Only operator configuration carries service/payment credentials.

List/save your data through `/api/apps/{id}/entities/{entity}`. Saves use
`{"id":"one","revision":0,"fields":{"title":"My note"}}`; existing records require
their actual revision. The same operation is a declared action at
`/api/apps/{id}/actions/{name}` and MCP `app.{id}.{name}`. The planner exposes
registered managed save actions as reviewable proposals, with revisions bound
by the server. Existing-record revisions omitted/guessed by the model cannot
bypass the comparison.

### Run the external app

Start the provided service in a separate terminal:

```sh
APP_TOKEN=choose-a-private-development-token \
APP_DB=.run/workshop-app.sqlite \
python3 extensions/apps/service-example/server.py
```

Configure the core and independently deployed app worker with this server-only
value, then restart them:

```sh
export APP_SERVICES='{"workshop_notes":{"url":"http://127.0.0.1:8795","uiUrl":"http://127.0.0.1:8795/","token":"choose-a-private-development-token"}}'
# Main HTTP process; projects core events without delivering external events:
PROCESS_ROLE=http target/debug/rust-ai-commerce
# Separate terminal, with the same DB/APP_SERVICES configuration:
PROCESS_ROLE=app-worker target/debug/rust-ai-commerce
```

Install `apps/service-example/manifest.json` in your synthetic shop with
`POST /api/apps`. Apps & payments shows managed data editors and the iframe.
The UI uses `connectCommerce()` from the SDK and can call `sdk.action('notes')`
or `sdk.action('availability', {sku:'mug'})`. Core session tokens never enter
this iframe. The availability result is explicitly synthetic, not a real ERP.
The app UI owns its content localization; the host supplies the selected locale
in the SDK context. This example provides English, German, French and Spanish copy and shows ordinary notes instead of raw JSON.

Events contain tenant, event ID, kind, data and stable `idempotencyKey`.
The service must deduplicate `(tenant, idempotencyKey)` in its own storage. Delivery
is at least once; timeouts are retried, never exactly-once remote execution.
The SQLite example persists and deduplicates its inbox. Eight failed deliveries
move to failed; an operator retry/dead-letter dashboard remains future work.

External-service execution is a separate process, **not a microVM sandbox**.
Deployment needs resource/network limits; the supplied service is a development
example. The browser boundary is an opaque iframe and constrained action bridge.
No app may choose an arbitrary backend URL through a merchant manifest.

### App and payment verification

```sh
set -a; source .env; set +a
python3 scripts/apps.py
python3 scripts/services.py
python3 scripts/payments.py
# Real local inference, using the synthetic workspace created by apps.py:
TEST_MODEL=1 python3 scripts/app_inference.py
```

These use real core/DB operations and a real standalone SQLite service. Payment
wire responses/signature verification are simulated by a local contract server;
no actual PayPal Sandbox account is contacted. Real local inference is separate.

### App-owned product configuration

Product configuration is a host capability, **not engraving logic in the core**.
The two runnable examples are [engraving](apps/engraving/manifest.json) and
[gift message](apps/gift-message/manifest.json). Their `configuration.wat` files
own their rules: engraving accepts 1–40 characters and fees of 0–100,000 cents;
gift messages accept 1–12 characters and fees of 0–500 cents. Each manifest embeds
the matching Wasm source, localized labels/hints, its own input field, typed entity
and default data. Submit the gift-message manifest through the normal app installation API;
no Rust branch or recompilation is needed to add it.

The generic host invokes two exports:

```text
validate_fee(fee_minor: i64) -> i32          # 1 accepts app price data
configuration_fee(fee_minor: i64, input_length: i64) -> i64
                                          # negative rejects; otherwise gross EUR cents per item
```

The platform enforces printable bounded input, tenant/authentication boundaries,
resource and money ceilings, immutable package versions, cart/data revisions and
authoritative quantity/tax calculation. The package owns its business predicates.
`POST /store-api/apps/{id}/configure` accepts
`{"productId":"mug","revision":3,"fields":{"message":"For Ada"}}` with the cart
context token and owning tenant. Input field names are declared by the package.
Multiple apps compose on a SKU; order `appConfigurations` records each app separately.
The generic storefront renders registered `product-configuration` slots.

This initial pure-Wasm contract passes price and character count, not full text or
arbitrary product data into Wasm. Richer rules need a versioned typed ABI or an
external service contract; the example does not claim a universal configurator.

Upgrade engraving 1.0 to 1.1 explicitly from Apps. Existing rule data
remains; open carts must be reconfigured against the new version. Completed orders
retain their original snapshot and idempotent checkout replay. The small core
`compatibility.rs` adapter reads the older cart format; it contains no current
engraving acceptance or price rules.


## Storyfront connector app

`apps/storyfront` declares an independent service app with a multilingual merchant
iframe. `generate` imports this tenant's catalog into Storyfront; `status` reports
the durable job and configured shop URL. The companion Ambient-C connector owns
manifest mapping and publication. The core exposes only generic app actions and a
single-use checkout transfer. See [the complete setup and limits](../docs/storyfront.md).


## Packing workflow app

[packing-helper](apps/packing-helper/manifest.json) supplies translated packing
checklists, an app-owned typed entity and an admin form. Its
[workflow definition](apps/packing-helper/workflow.json) adds a `packed` order
state and a single-click “Confirm packed” action. It belongs to **Apps → Operations**.

Install the manifest through `POST /api/apps`, then save the reviewed definition
through `PUT /api/merchant/order-state-machine` with
`{"revision":0,"data":<workflow.json>}` (use the current revision returned by GET).
The equivalent MCP tools are `merchant.workflow` and `merchant.workflow.save`.
Saving app provenance requires the installed app, `apps.manage` and
`settings.write`; orders retain their ordinary payment/delivery business guards.
The workflow can be staged and selectively released as `order-workflow`.

Committed actions emit `order.state_changed` for native flows and external app
inboxes. A note flow can attach a visible activity to that event exactly once.
The example does not run arbitrary code on the transition, automatically install
its workflow, or implement the complete Shopware graphical Flow Builder.
`python3 scripts/merchant_operations.py` exercises installation, validation,
concurrent exact-once transition, the actual flow note and selective publication.
