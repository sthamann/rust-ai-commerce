# Connected CRM, customer groups and entity history

## Merchant workflow

Customer address cards have independent **Use as default billing address** and
**Use as default delivery address** actions. Existing defaults remain visible;
selecting one does not implicitly replace the other. Address deletion uses the
shared confirmation dialog. Save/discard profile edits before editing addresses.
Checkout and the storefront account use the same validated address API.

Customer orders open native order details. Registered order customers and product
line items open their native editors when the reader holds the corresponding
permissions. Back navigation retains the entity path; `studio` and `entity` query
parameters support direct links and refresh. Switching shops/environments clears
that path. Pending customer profile edits require an explicit discard decision.

**Settings → Customer groups** owns translated names/descriptions and an explicit
gross/consumer or net/business price basis. Exact group IDs remain available to
rules, promotions, flows and quantity prices; exact group tiers take priority over
basis tiers. Public registration cannot assign privileged groups. Group changes
revoke customer sessions and open privileged cart contexts. Removal is rejected
while customers, product quantity prices or saved rules/flows reference a group.
Consumer and business basis groups are required. Group definitions are shared
across sales channels; channel-specific checkout configuration still inherits its
own independent settings. This is native behavior, not Shopware DAL/API parity.

## Recorded entities

The shared history panel is present in products, categories, customers, orders,
company details, checkout settings, rules, flows, promotions, sales channels and
knowledge sources. Settings and company profiles keep separate base/channel
histories. Entries show timestamp, current known author, request origin and
reason; exact before/after differences are loaded only on demand. Historical
values are displayed as text, never executed as HTML.

Migrations 034/035 capture the first prior aggregate and one final aggregate per
committed PostgreSQL transaction, including product translations/associations and
customer addresses. Failed transactions leave no committed history. Deferred
finalization avoids a full snapshot for every translated row. Cursor pages are
limited to 30 entries. Client actor/reason headers are stripped at authentication;
internal actor attribution is transaction-local. Unattributed legacy/system
writers are explicitly displayed as system/unknown, not a fabricated person.

History starts when the migrations are installed. Existing changes cannot be
reconstructed. App packages keep their separate immutable version/release system;
this change does not claim automatic history coverage for every database table.
Snapshots increase storage and currently have no automatic retention or erasure
policy. History is tenant-private and not a customer-facing export.

## Restoration boundary

Restoration needs the entity's read **and** write permission, explicit approval,
and its current revision. It reuses ordinary validated writes and creates a new
revision/event/history entry; it never rewinds the database transaction log.
Concurrent edits are rejected. Current dependencies, enabled languages/countries,
media ownership and channel inheritance remain authoritative.

- Products restore content, prices and associations while preserving **current
  stock**. This cannot replenish quantities sold after the selected version.
- Customers restore editable contact/company/group/active fields, owned address
  book/defaults and automation data. Account ID/number, credentials, channel and
  language provenance, login timestamps and last purchase/payment remain current.
  Sessions are revoked by the normal customer update. Order address/customer
  snapshots remain immutable.
- Knowledge sources re-enter private review. Past publication approval is never
  restored. Archived sources use their normal lifecycle restore first.
- Orders are inspection-only. Payment, delivery and order corrections use the
  existing state machine/provider actions; financial events are not replayed.
- A missing/deleted entity is not generically resurrected. Address-book rollback
  can recreate owned addresses, with current geography/ownership validation.

## HTTP and MCP

`GET /api/history/{entity}/{id}?before={cursor}` returns summaries and `canRestore`.
`GET /api/history/{entity}/{id}/{version}` returns exact snapshots.
`POST /api/history/{entity}/{id}/{version}/restore` accepts
`{ "approve": true, "revision": 7, "side": "before" }` (`after` also supported).
Entity names are `product`, `category`, `customer`, `order`, `settings`, `company`,
`companyChannel`, `checkoutChannel`, `rule`, `flow`, `promotion`, `channel`, `source`.
Shared settings/company IDs are `base`; customer IDs are URL-encoded emails.
A history version must match the exact entity and owning tenant.

MCP tools `merchant.history`, `merchant.history.version`,
`merchant.history.restore` and `merchant.customer.groups` share these operations.
Group discovery is `GET /api/merchant/customer-groups`; group writes use the
revision-bound shared commerce settings API.

## Verification

`scripts/crm_history.py` uses isolated synthetic shops, actual customer sessions,
checkout, PostgreSQL writes, all twelve editable entity restore types, independent
address defaults/deletion restoration, custom net/tier pricing, immutable orders,
source review, group dependency refusal, stale revisions, role/tenant/MCP controls
and bounded pagination. It is part of the integration registry/CI.
`frontend/tests/unit/crm-history.test.tsx` tests actual controls, unsaved changes,
entity navigation/scope clearing, inherited group editing and confirmed restore
requests/failures. Existing CRM, checkout, automation, staging and international
integration suites remain required. The extracted group-basis policy has a Lean
exactness/unknown-group contract and negative mutations; SQL, UI, snapshot and
async adapters remain unproved.
