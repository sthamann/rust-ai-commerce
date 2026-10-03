# Rules and durable flow graphs

This is an executable migration increment against **shopware/core 6.7.14.2**, not a claim that every Shopware plugin, commercial extension or DAL/API is compatible. The pinned MIT PHP classes remain an independent behavioral reference.

## What is connected

The Studio rule editor exposes source-named conditions with localized labels and typed parameters. The Flow workspace has a connected diagram and editable conditions, true/false branches, consecutive actions, persistent delays and stop nodes. Installed app actions use the same schema/permission gateway as HTTP and MCP. AI nodes create reviewable proposals through the existing inference provider selection; they do not apply a model response automatically.

Rules consume server-owned cart, product, selected-address, customer-history and order facts. Product rule metadata is edited by an authorized merchant and is inherited by variants. Purchase prices and all internal rule metadata are excluded from public product serialization. Rule preview returns a Boolean and no side effects, rather than the private facts. Missing required scope is an error, including underneath NOT.

Saved rules can be referenced with `{"type":"ruleReference","ruleId":"eligible"}`. Only referenced IDs are fetched using tenant-bound indexed batch reads, with 100 referenced rules and depth eight as bounds. Reference limits apply independently to each matching flow; unrelated events and inactive flows are not loaded. Event jobs freeze their definitions and revisions. Missing/disabled references fail explicitly; recursive references cannot run indefinitely. Current actor membership and granular permissions are still checked when each delayed action executes.

## Source inventory and limits

`reference/automation-catalog.php` reflects **114 concrete production Rule subclasses and 16 Core FlowAction names**. It excludes test classes and abstract helpers. This corrects the old text-only 120-name inventory, which was not an accurate count of executable production classes.

`reference/automation-native.json` explicitly binds **108 of the 114** classes to native scope implementations. `reference/automation-registry.json` combines those bindings with the original configuration metadata. Registered scope support is not complete behavioral equivalence: every catalog row keeps `behavioralParity:false`, and the complete-catalog flag stays false. The independent PHP comparison currently checks **432 cases across 74 original condition classes**, including missing customers, wildcard/set/numeric operators, calendar boundaries, custom fields, purchase prices, goods filters and Boolean containers.

These six source names remain disabled, with a visible explanation in the editor:

| Source condition | Missing connection |
|---|---|
| `cartLineItemInGroup` | Original package builders, product provider, sorters and promotion group allocation |
| `promotionCodeOfType` | Original promotion line scopes and individual/global/fixed code processing |
| `promotionLineItem` | Original promotion line entities and their scope selection |
| `scriptRule` | A compatible bounded Shopware script runtime; arbitrary PHP/Twig is not evaluated in the core |
| `simple` | Internal source helper, not an end-user Rule Builder feature |
| `unknown_condition` | Unknown source conditions are rejected instead of silently granted |

Further limits: native IDs need an explicit UUID migration map; arbitrary source constraints have not all been ported; original nested promotion/group scopes and every non-product line subtype are not yet proven equivalent; supplier/date/list-price/other imported product fields need correct native data. Source-named order rules require a real order event and fail during cart-only preview. Calendar behavior is compared for the included fixtures; the entire source time-zone/date matrix is not certified.

## Native action contract

The sixteen original Core action names are registered, plus `note`, `ai_proposal` and `app_action`. They dispatch actual domain operations rather than descriptive placeholders.

| Original action family | Native behavior and specific boundary |
|---|---|
| Add/remove customer or order tags | Transactional metadata update; duplicate tags removed; original `tagIds` is accepted as an alias for `tags` |
| Set customer/order/customer-group custom field | `field` and typed JSON `value`; tenant-owned JSONB storage; group storage currently follows the two native groups |
| Set affiliate/campaign codes | Customer or order attribution metadata; immutable original customer identity remains intact |
| Change customer group/status | `groupId`/`customerGroupId` (`consumer` or `business`) or Boolean `active`; sessions and open-cart authority revoked |
| Set order state | `kind: order/payment/delivery`, `state`; uses the existing revision/state machine and emits its real transition events; provider/payment/terminal guards stay active |
| Generate document | `kind: invoice/delivery_note`; real immutable numbered PDF, centrally configured seller details; arbitrary source document-type UUIDs need mapping |
| Grant download access | Boolean `value`: grant or revoke entitlements for ordered download assets; existing download/payment guards still apply |
| Send email | Installed Email Delivery app with `templateId: order_confirmation`; SMTP/Resend/SendGrid delivery gateway; arbitrary original mail templates/recipient/attachment configuration is not yet implemented |
| Stop flow | Stops the current graph without visiting subsequent nodes |

Source `force_transition`, original multi-state arrays, arbitrary customer-group UUIDs, custom document renderers, paid extension action sets and the complete Shopware FlowSequence import/export format are not claimed compatible. Native graph JSON is the current interchange format. Preserve the source original and use explicit identity/configuration mappings rather than guess them.

## Durable execution

The event outbox projects matching flows to `flow_jobs`. A malformed stored flow, oversized reference set or missing rule scope becomes its own failed job and does not poison other flows or the commerce event. Each action gets a stable `flow:<job>:<node>` key and a `flow_steps` receipt before execution. Local tag/field effects and the local activity receipt commit together. Replaying a confirmed step uses its stored result.

A delay stores the next cursor, trace and `available_at` in PostgreSQL and releases its worker. Another worker can continue when it is due. Membership is rechecked at continuation. The worker renews its lease between nodes. An interrupted unconfirmed action is reported as uncertain; external effects are not blindly repeated. This is not an exactly-once guarantee over arbitrary third-party systems. Existing native transition events may start other flows; arbitrary cycles between separate flow definitions still need a global recursion policy.

The current built-in producers remain order placement, payment capture/update and order/payment/delivery state changes, plus namespaced app events. All upstream customer/authentication/catalog and commercial-extension triggers have not been ported. Customer/tag metadata actions currently have activity receipts but do not emit a complete upstream DAL event set.

## HTTP and MCP

| Operation | HTTP | MCP |
|---|---|---|
| Catalog | `GET /api/automation/catalog` | `automation.catalog` |
| Definitions and latest jobs | `GET /api/automation` (configuration), `GET /api/automation/executions` (bounded refreshed jobs) | `automation.list` |
| Revision-bound configuration write | `PUT /api/automation/{rules,flows,promotions,channels}/{id}` | `automation.save` (`kind`, `id`, `revision`, `data`) |
| Side-effect-free cart rule preview | `POST /api/automation/rules/preview` | `automation.preview` (`condition`) |
| Original condition normalization | `POST /api/automation/import-condition` | `automation.import` (`condition`) |
| Rule entity metadata | `PUT /api/automation/entities/{products,customers,orders}/{id}` | Use the authenticated HTTP route; no separate metadata MCP tool yet |

Configuration reads/previews require `settings.read`; writes/imports require `settings.write`. Each action additionally checks its specific customers/orders/documents/apps/catalog/knowledge permission. Preview requires the same cart context token as storefront cart operations. API and MCP call the same handlers.

Example native graph (`data.pipeline`, together with a translated flow name, instruction, locale, trigger and top-level condition):

```json
{
  "entry": "check",
  "nodes": [
    {"id":"check","kind":"condition","condition":{"type":"ruleReference","ruleId":"eligible"},"on_true":"tag","on_false":"stop"},
    {"id":"tag","kind":"action","action":"action.add.order.tag","config":{"tags":["priority"]},"next":"wait"},
    {"id":"wait","kind":"delay","seconds":60,"next":"stop"},
    {"id":"stop","kind":"stop"}
  ]
}
```

Graphs are acyclic, contain 1..100 reachable nodes and allow delays up to thirty days. An edge to an absent node, duplicate node ID, cyclic graph or unreachable node is rejected before saving.

## Files and verification

- `src/automation_rules/`: pure source comparison, field, calendar and container evaluation.
- `src/marketing/{facts,line_facts,customer_facts,rule_snapshot}.rs`: authoritative tenant context and frozen references.
- `src/marketing/{pipeline,pipeline_runtime,flow_actions,flow_mutations,flow_access}.rs`: graph admission, receipts/delays, action dispatch, transactions and current rights.
- `frontend/src/admin/automation/`: localized rule/action editors, graph overview and typed graph helpers.
- `migrations/025-automation-pipelines.sql`: customer metadata, customer groups, delayed jobs and per-node receipts.

Run `python3 scripts/automation_registry.py` to check reflection/native catalog drift (use `--write` only after review); `python3 scripts/automation_differential.py` compares actual PHP classes and the compiled Rust rule evaluator. `python3 scripts/verify_integration.py --only automation` creates a disposable PostgreSQL database and checks the real checkout-to-flow path without provider traffic. The Studio refreshes execution summaries every three seconds while the automation workspace is open, showing persisted branch decisions and scheduled continuation without reloading all configurations. Tenant/recent-job, ready-time, expired-lease and customer-history indexes bound the common database access paths. Frontend tests exercise graph connections/deletion, incomplete JSON editing, four languages and source payload round-trips.

Two production guards, exact XOR hit count and the thirty-day delay boundary, are extracted to Lean with precise properties and rejected negative mutations. SQL, async jobs, time parsing, third-party actions and the whole rule interpreter remain outside that proof boundary. Neither the tests nor these partial proofs establish bug-free whole-core behavior or 100% source coverage.
