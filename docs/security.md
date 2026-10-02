# Prototype trust boundaries

Localhost-only application/database bindings are the defaults. This is a
working SaaS workspace foundation for synthetic data, not a hardened public
hosting service. Do not expose this development setup directly to the Internet.

## Personal users and merchant workspaces

Merchant accounts use Argon2 salted password hashes. Opaque 12-hour session
tokens and 24-hour one-use invitations persist only as SHA-256 digests.
Acceptance of an invitation for an existing email requires that account's
password and cannot overwrite or escalate an existing membership.

Every authenticated request resolves its session and **active membership from
PostgreSQL**. A client-supplied `x-tenant` only selects among authorized
memberships; it grants no authority. Client `x-rac-*` principal headers are
removed before middleware derives trusted user/tenant/role headers. Revocation
and role changes apply to subsequent requests, including on other replicas;
already executing requests are not retroactively cancelled.

| Role | Authority |
|---|---|
| Owner | Own shop read/plan/catalog, settings/operations/extensions and members; can appoint owners |
| Administrator | Same operational actions; cannot grant/change ownership |
| Editor | Read, plan and explicitly approve catalog/experience changes |
| Reader | Read and plan; cannot apply catalog changes, fulfill orders or alter settings/users/extensions |

The last active owner cannot be removed/demoted. Its invariant is serialized
using a tenant row lock. Memberships allow one identity in multiple shops with
different roles. New shops use static public fixtures and start with empty
orders, conversations, vector records and policy counters. Curated graph
relationships are explicitly synthetic template data.

`MERCHANT_TOKEN` remains an **instance administrator bootstrap credential**
for local setup/verification. It has global authority and must never be
shared with ordinary merchants. The UI places it under advanced settings;
normal operation uses Team & access. Personal sessions are kept in browser
sessionStorage, so same-origin XSS could steal them. Production needs an
appropriate cookie/token gateway, strict CSP, TLS, origins/CSRF, OIDC/MFA,
password recovery, verified email, abuse/rate controls and session management.

All business relations are tenant-filtered in native HTTP, graph/vector and
MCP paths. Database tables share one PostgreSQL application identity;
**core-wide RLS and physically isolated tenants are not implemented**. Managed app
tables have forced RLS; the local DB account is a superuser, which bypasses it.
A restricted-identity regression proves the policy, not production containment. These
application checks and small HTTP tests do not prove production containment
against a compromised server/database identity. Production provisioning,
billing, quotas, tenant deletion/export, backup isolation and domain routing
remain required. Storefront selection is `?shop=<workspace-id>`; customer
cart tokens remain independently scoped and rotate on B2B demo login.

## Commerce, agents and extensions

Core mutation paths bind SQL/Cypher parameters and use row locks, persisted
idempotency and optimistic revisions. Completed quotes are immutable. Payment
methods are simulated/manual or Sandbox. PayPal credentials stay on the server;
no card data or live-money charges are handled.
Fulfillment records are internal states, not a dispatched physical shipment.
Tax rates and calendars are prototype configuration, not jurisdiction advice.

Models receive bounded shop/conversation context and verified observations.
They emit allowlisted typed proposals. A separate authorized, explicit
approval executes changes; the model cannot grant authority, run SQL/code or
approve its own proposal. MCP mutation uses the same role gate as HTTP.
Public model endpoints need quotas/abuse controls before remote deployment.

Cloud credentials stay on the server. Provider URLs are server configuration,
not merchant input. Selecting OpenAI/Claude sends bounded shop context to that
provider; this is disclosed in the UI. Local native MCP rejects unrecognized
browser origins. The stdio bridge inherits explicitly configured credentials;
remote ChatGPT/Claude setup still requires a real production authorization
endpoint. No OAuth server or externally connected account is claimed.

Wasm guests have no host imports/WASI and bounded fuel/memory/stack/source.
Compilation occurs before activation; checkout refreshes a changed persisted
policy before execution, including across app instances. Traps roll back
purchase. A process-isolated compiler is still a production requirement.

See [app and payment boundaries](intelligence-apps-payments.md) for the opaque
iframe/action gateway, native adapter, exact receipt checks and remaining gaps.

Learning counts use synthetic sessions/orders; they are not LLM weight
training or demonstrated causal sales uplift. Production behavior tracking
requires consent, minimization and deletion/export. Reports/screenshots contain
only synthetic data; private `.env`, DB backups and session artifacts stay
ignored by Git.

## Customer/operation scopes and immutable purchases

Fine member permissions replace role defaults, and delegated role/invitation/key
scopes cannot exceed the actor's current permissions. Integration keys are bound
to one workspace and re-evaluated alongside active membership. Customer sessions
are separate from merchant sessions. Address defaults and address ownership have
composite `(tenant,email,id)` foreign keys; endpoint and address-ID checkout checks
add an independent customer session. New guest orders never acquire an account
identity through a typed email. Legacy pre-snapshot email ownership must be
explicitly resolved during a production import. Order/document customer and
address snapshots remain independent of later CRM edits.

Immutable bytes/digests protect private uploads and paid purchase files; MIME
checks are not antivirus. Rich descriptions accept bounded typed blocks and safe
media URLs, not executable HTML. Global core RLS, production recovery/verification,
legal document compliance and complete upstream PSP capabilities remain outside
the verified prototype. See the exact [operations boundaries](merchant-operations.md).

## Formal verification boundary

Selected production admission/cap policies are extracted to Lean and checked in
CI, with transitive axiom auditing, compiled conformance and negative mutations.
The [formal guide](formal-verification.md) names all thirteen policies and their
actual Rust consumers. This does not prove SQL tenant isolation, authentication,
provider/extension safety or whole-system correctness. Existing security and
behavioral regressions remain mandatory, as do explicit reviews of source,
schema/build and proof-tool changes.

## Experimental public hosting

The dedicated `deploy/compose.yaml` enforces no demo seeding, closed merchant
signup and disabled instance-token HTTP authentication. Personal operator grants
are offline, audited and distinct from tenant roles; grant/revocation is checked
on every `/api/platform/*` request. The bootstrap password belongs only to the
one-shot operator container, never the long-running Rust environment. Review
existing demo databases before exposing them: these flags do not delete old
known-password accounts. See [host procedure](deployment.md) and
[operator API boundary](platform.md). These gates are not comprehensive abuse,
MFA, email verification, account recovery or full core-wide RLS hardening.
