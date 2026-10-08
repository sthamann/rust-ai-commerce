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
removed before middleware creates a typed Principal in request extensions. Every API route declares its method-specific permission; an unknown API route is denied. Revocation
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
appropriate cookie/token gateway, OIDC/MFA, password recovery and verified email. The native strict script CSP, strict-deployment HSTS, constant-time bootstrap comparison and database-backed account/peer throttles are now implemented; see [the eighteen review fixes](core-hardening.md).

Studio validates a visible connected session once per minute and on return to
the tab. An authoritative merchant-authentication rejection from either JSON
transport clears the active credential and the loaded private overview, rights
and conversation state together, with a translated sign-in action. A late
rejection for a previous token cannot disconnect a renewed session. Customer,
provider, login and operator errors are separate; 403/5xx/network failures do
not silently sign out a merchant. This UI handling does not extend session TTL,
restore a revoked credential or relax server authorization. The current blocking
reauthentication dialog retains drafts and requires the same account and active
membership before resuming; failed writes are never replayed.
[Current Studio session behavior](studio-api-and-channels.md#studio-login-and-session-expiry).

Native object handlers bind tenant scope in HTTP, graph/vector and MCP paths.
The adversarial [tenant isolation suite](tenant-isolation.md) tests ID/header
swaps and unchanged victim state; it is not an exhaustive endpoint audit.
Migration 038 additionally scopes 22 critical foreign-key relationships by
tenant, preventing wrong-shop order/payment/event/staging associations. Migration
044 adds core FORCE RLS, connection-bound tenant context and strict runtime role
checks. Managed app tables retain their forced policy. Enable the separate
non-owner runtime with `DATABASE_RUNTIME_URL` and `DB_RLS_REQUIRED=true`; a
superuser still bypasses the policies. Two actual restricted-runtime replicas
exercise direct foreign SQL, pooled reuse and native checkout/CRM APIs.
[Deployment and privileged exceptions](production-architecture.md) are explicit.
These checks do not prove containment against SQL injection or a compromised
server/database identity; physical tenant isolation remains additional work.
Operator provisioning, configured shop-subdomain routing and recoverable
pause/trash/restore are implemented; see [the platform guide](platform.md).
Production billing, full token/spend quotas, physical tenant erasure/export, isolated
backups and automated failover remain additional work. Local storefront selection
uses `?shop=<workspace-id>`; configured public subdomains derive scope from the
stored host mapping. Customer cart tokens remain independently scoped and rotate
on B2B demo login.

## Commerce, agents and extensions

Core mutation paths bind SQL/Cypher parameters and use row locks, persisted
idempotency and optimistic revisions. Completed quotes are immutable. Payment
methods are simulated/manual or explicitly configured PayPal Sandbox/Live.
PayPal credentials stay on the server; card data is handled by the provider.
Actual PSP transactions remain unverified; local tests use protocol fixtures.
Fulfillment records are internal states, not a dispatched physical shipment.
Tax rates and calendars are prototype configuration, not jurisdiction advice.

Models receive bounded shop/conversation context and verified observations.
They emit allowlisted typed proposals. A separate authorized, explicit
approval executes changes; the model cannot grant authority, run SQL/code or
approve its own proposal. MCP mutation uses the same role gate as HTTP.
Interactive model admission has durable daily quotas and shared concurrency leases. Complete token/spend billing and edge abuse defenses remain separate.

Cloud credentials stay on the server. Provider URLs are server configuration,
not merchant input. Selecting OpenAI/Claude sends bounded shop context to that
provider; this is disclosed in the UI. Local native MCP rejects unrecognized
browser origins. The stdio bridge inherits explicitly configured credentials;
remote ChatGPT/Claude setup still requires a real production authorization
endpoint. No OAuth server or externally connected account is claimed.

Wasm guests have no host imports/WASI and bounded fuel/memory/stack/source.
Cold compilation uses a bounded LRU and blocking-pool slots before cart/product locks; checkout verifies its persisted digest under the lock. Pure app Wasm shares the same cache implementation, without compilation under its global cache mutex. Traps roll back
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
media URLs, not executable HTML. Production recovery/verification,
legal document compliance and complete upstream PSP capabilities remain outside
the verified prototype. See the exact [operations boundaries](merchant-operations.md).

## Formal verification boundary

Selected production admission/cap policies are extracted to Lean and checked in
CI, with transitive axiom auditing, compiled conformance and negative mutations.
The [formal guide](formal-verification.md) names the extracted policies and their
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

## Full app surface boundary

Custom UI stays in an opaque iframe with source-window/nonce checks, selected
bridge actions and current server permission checks. Only operator configuration
chooses remote UI/service origins. Custom GET routes use the extracted read
admission policy; its external `readOnly` fact remains trusted metadata. Service
calls use per-process admission limits, five-second timeouts and 64 KiB payload
bounds. The runnable container adds explicit resources but does not provide
microVM security. See [the app contract and remaining production gaps](app-platform.md).

## Optional trusted experience identity

The server-to-server identity/inference broker, one-use personal Studio handoff
and restricted public frontend mount are opt-in. Signing keys delegate verified
identity authority and stay in the trusted service/Core runtime; browser clients
receive neither these keys nor provider credentials. Replay/expiry/ownership and
proxy scope checks are distinct from deployed OAuth, recovery or external email
verification. [Exact trust and deployment boundary](experience-integration.md).

## Extension security

[The app security matrix](app-security.md) lists package consent/signatures,
tenant schemas, callback/surface authority, bounded Wasm, encrypted secrets,
private file access and replay/lease controls together with executable regressions
and deployment limits. These controls do not certify arbitrary third-party code.
