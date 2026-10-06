# Tenant isolation: current guarantees and remaining boundary

A sales channel is a storefront inside one merchant workspace. It can override
catalog visibility, locale, company and commerce settings, but shares that
workspace's merchant membership and customers/orders. It is **not** a security
boundary between unrelated businesses. Independent SaaS merchants need separate
tenant IDs, memberships, settings and records. A person may intentionally be a
member of both; an integration key remains bound to one workspace.

## Actual enforcement

1. `src/auth/middleware.rs` strips forged internal identity headers, resolves the
   personal session and current active membership, and derives the principal.
   Caller `x-tenant` selects a workspace; it cannot grant membership. Platform
   access requires a separate personal operator grant. Private stages inherit
   live-workspace membership and reject anonymous commerce/API/MCP access.
2. Object handlers scope records by tenant **and** object ID. Customers also need
   their own customer session; addresses bind tenant, customer and address ID.
   Cart/payment/download/handoff capabilities require the scoped secret token
   or the applicable customer ownership. Public storefront catalog and explicitly
   published assets are intentionally public; changing shops to read a published
   product is not an authorization failure.
3. HTTP and MCP use the same native operations; MCP discovery and direct calls
   both enforce current grants. Apps cannot override tenant scope in arguments.
   Native app records use tenant, app, entity and record ID. Same IDs in different
   shops must remain independent. External service implementations are separately
   trusted operator-configured services, not automatically isolated by core RLS.
4. Read caches carry tenant/channel/authentication context. Each new request
   rechecks authoritative membership and configuration versions. Semantic results
   require tenant/model filters and current PostgreSQL hydration, plus publication
   checks for public documents. Database and vector services must stay private.
5. `038-tenant-references` adds 22 tenant-aware foreign keys for order/cart,
   payment/reservation/refund, receipt/download/promotion, product parent,
   event/flow/app/knowledge, and live/staging/build relationships. Existing customer,
   address, product/category and document keys already carry tenant scope.

## Reproduced gap and repair

On the pre-migration schema, an internal SQL write could associate a record under
shop A with shop B's cart. Only cart ID existence was checked. Adversarial API
probes did **not** demonstrate a remote bypass; the defect was missing relational
containment if an application query were wrong. Migration 038 makes PostgreSQL
reject these relationships with SQLSTATE `23503`. Refunds additionally bind the
job and its exact payment attempt. Environment/build references bind the same
live workspace. Existing rows are validated atomically: migration failure leaves
the ledger/data unchanged and requires investigation, never silent reassignment.

The migration retains legacy keys and adds indexed unique target tuples. It scans
existing rows and takes DDL locks; schedule it as a controlled migration on a
large/live installation. It does not add per-request network trips or change
canonical object IDs. Its write/index overhead is not yet benchmarked at SaaS scale.

## Continuous real regression

```sh
QDRANT_URL=http://127.0.0.1:16333 python3 scripts/verify_integration.py \
  --container rust-ai-commerce-postgres-1 --only tenant_isolation
```

The single integration registry runs this automatically in CI. It creates two
synthetic shops with real personal/customer sessions and actual PostgreSQL;
provider calls are zero. `scripts/tenant_isolation.py` tests swapped IDs and
headers in both directions across CRM/orders/receipts/assets/knowledge/stages/
builds/memberships, direct MCP/UCP calls, same-ID app data, scope injection,
current integration-key rights and revocation. It re-reads victim records to
ensure denied writes did not change them. Successful owner reads validate that
negative MCP probes did not merely call nonexistent tools.
Foreign integration-key deletion is also tested: its idempotent 200 response
must leave the other shop's key list unchanged and the original key usable.

`scripts/security/tenant_schema.py` tests each of the 22 new constraints with
both an accepted own-shop operation and a denied foreign-shop operation, checking
the exact constraint name. A deliberately introduced bad reference verifies that the schema guard detects
missing containment. The schema-wide guard rejects new ID-only foreign keys
between tenant tables unless a scoped counterpart exists. Managed app RLS is
executed under `NOSUPERUSER NOBYPASSRLS`: missing context reads nothing, context
A cannot see/write B, and transaction-local context disappears on connection
reuse. `artifacts/tenant-isolation.json` records grouped checks; this is not a
claim of exhaustive endpoint coverage or a penetration-test certificate.

## Explicitly incomplete: database-wide read/write containment

Core tables still lack row-level security. The local `commerce` database role
is a superuser with `BYPASSRLS`, which bypasses even forced app policies.
The restricted-role test proves those app policies, not containment under the
actual local runtime role. The 22 foreign keys prevent wrong associations;
they cannot stop an unscoped `SELECT`, `UPDATE` or `DELETE` on unrelated rows.
No full independent-SaaS database containment or production security certificate
is claimed. Partial Lean policies do not prove SQL authorization.
PostgreSQL explicitly documents that superuser and `BYPASSRLS` roles bypass
[row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
Object-level authorization for every supplied ID remains an application
requirement, as described in [OWASP BOLA](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/).

The next structural hardening must introduce separate migration/runtime/worker
identities, a least-privileged runtime without schema ownership/BYPASSRLS, and
core RLS with fail-closed tenant context. Context must be transaction-local on
the **same** connection as every protected query; a session-wide `SET` on a pool
is unsafe. Authentication/control-plane lookups and global work claiming need
narrow privileged interfaces; workers must enter the claimed tenant context
before reading or writing commerce data. Apps must not receive raw core database
credentials or schema privileges.

Acceptance requires real tests omitting tenant predicates, read/insert/update/
delete probes under the actual runtime role, alternating tenants on one pooled
connection, rollback/cancellation/restart, platform and cross-tenant workers,
cache isolation and every supported extension entry. This is substantive work;
adding policies without converting the actual connection paths would break the
server or leave bypasses. Separate database cells provide additional blast-radius
control but do not automatically isolate shops sharing a cell.

Public hosting additionally requires isolated origins/CSP, session and recovery
hardening, resource quotas, secure provider/service storage, backup/export/restore
boundaries and independent security review. The instance bootstrap token has
fleet-wide authority and must remain disabled (`ALLOW_BOOTSTRAP_AUTH=false`) in
SaaS deployment. It must never be handed to a merchant or external app.
