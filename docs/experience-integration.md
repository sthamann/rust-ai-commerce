# Trusted identity and hosted frontend integration

Vendune exposes a generic integration boundary. No Storyfront source or provider credentials belong in this public repository. A separately operated private experience service can verify a merchant, create an owned tenant, inherit the operator model and mount a public storefront.

## Identity and inference

`POST /api/identity/exchange` accepts an HMAC-SHA256 assertion signed with the runtime-only `IDENTITY_BROKER_KEY` (at least 64 characters). `IDENTITY_BROKER_ISSUER` must match its `iss`. Claims include `aud=vendune-identity`, `verified=true`, `sub`, `email`, `name`, `iat`, `exp`, a random 64-hex nonce, `workspaceId`, `workspaceName` and `demoCatalog`. Sign the exact path, a newline and the base64url JSON payload. Lifetime is at most 60 seconds; PostgreSQL consumes the nonce once across replicas and restarts. Only an active owner may reconnect an existing shop. Email changes require explicit recovery. Default fashion fixtures are copied only when requested.

This key delegates **verified-email identity authority**; its holder can link the corresponding merchant account. Store it only in the trusted service and Core runtime. It is not a browser API key. The deployment is opt-in and disabled without configuration; it does not weaken normal API authentication.

`POST /api/identity/inference` uses the same route-bound assertion and global provider configuration. Its `system`, `input`, bounded JSON `schema` and up to four raster data URLs are validated. Concurrency is bounded by existing model slots; durable allowance is 50 calls per verified email per UTC database day. Provider keys never leave Core. This is a prototype abuse boundary, not SaaS billing or a whole-platform anonymous shopper budget.

## Secure Studio entry

`POST /api/auth/handoff` requires a personal authenticated merchant session. `POST /api/auth/redeem` consumes its opaque 60-second ticket once and rechecks active membership. The Studio reads `login_ticket` then removes it from the URL before making network requests. Responses issue normal personal sessions. No password or bearer token is put into the link.

## Storefront binding

Authenticated `GET/PUT /api/settings/frontends` reads or binds `{alias, channel}` within the caller tenant. An active channel is required. Aliases and shop IDs share one advisory-lock namespace, preventing concurrent collisions. Reserved platform names cannot be allocated.

`HOSTED_FRONTEND_ORIGIN` is an operator-only HTTPS origin (loopback is permitted locally). `HOSTED_FRONTEND_KEY` authenticates Core-to-frontend requests. `SHOP_DOMAIN_SUFFIX` supplies wildcard shop addresses; the hosting layer separately routes the exact Experience host to the private service. Hostname resolution derives tenant and channel from PostgreSQL, rejects conflicting headers and never trusts an arbitrary browser tenant. Paused shops and disabled channels are unavailable.

Only public assets/pages and allowlisted `/experience-api/context` and `/experience-api/shops/...` reach the frontend. Core admin, Store API, MCP, UCP and private service routes stay separate. Proxying strips cookies and merchant Authorization, prohibits redirects and bounds request/response bodies. The private frontend must independently check the gateway key, alias, tenant/channel, same-origin writes and requested shop; public API allowlists must remain restrictive.

## Source and evidence

| Modules | Responsibility |
|---|---|
| `auth/broker.rs`, `broker_inference.rs` | Signature admission, durable replay, owned provisioning, global structured inference |
| `auth/handoff.rs`, `frontend/src/admin/shell/useStudioAccess.ts` | One-use personal Studio login |
| `shop_domains.rs`, `shop_domains/frontends.rs` | Authoritative domain scope, guarded registration, public proxy |
| `commerce/product_create.rs`, `product_edit.rs` | Validated stable import IDs, duplicate conflict and normal revision-bound product saves |
| `migrations/042-identity-frontends.sql` | Identity, nonce, handoff, hosted frontend and daily inference persistence |
| `scripts/identity_broker.py` | Real HTTP/PostgreSQL signatures, foreign ownership, empty/fashion provisioning, handoff, mounts, paused shop and restart regressions |

Hermetic provider tests and these integration checks do not demonstrate Google/Apple production OAuth, actual email delivery or a publicly deployed private experience service. Those require configured credentials and observed external results. New adapters remain explicitly unproved in the formal inventory; existing extracted policies retain their checks.

## Merchant password enrollment and email-link recovery

Migration 052 adds `merchant_users.password_initialized`. Existing accounts keep their
credential and are marked initialized; newly broker-created accounts explicitly start
uninitialized. Provisioning/import workers may use their server-only sessions, but a
Studio handoff cannot be created or redeemed until the merchant chooses a password.
`user_data` exposes `passwordSetupRequired` so the private integration can route its
workspace button to enrollment instead of attempting a handoff.

`POST /api/identity/credentials` accepts only the existing operator-configured broker's
route-bound HMAC assertion, verified email, subject, audience, expiry and one-use nonce.
The asserted identity must already link to that exact canonical email/account and an
active owner membership in the requested shop. It does not create users, link a new
identity, assign roles or trust browser-supplied email/shop claims.

- `set-password`: explicit enrollment/recovery; native Argon2 hashing and the existing
  12–128-byte password validator. A canonical-account lock serializes credential changes.
  Password replacement marks enrollment complete and revokes old merchant sessions and
  unused Studio handoffs before issuing a new personal session.
- `verify-password`: verifies the existing hash and leaves it unchanged. No email-link
  handler should select password replacement implicitly for an existing-password login.

The private integration owns the 24-hour email ticket, scanner-safe GET, bounded
same-origin form POST, confirmation and localized errors. It consumes the ticket in a
transaction before invoking the broker and restores it if the handoff fails. This is
not a distributed transaction: a lost response can leave a chosen password committed in
Rust while the email ticket remains retryable. Retrying or using existing-password login
recovers that situation; a provider password is never logged or stored by Experience.

Legacy randomly generated broker passwords cannot be distinguished reliably from human
passwords by inspecting Argon2 hashes. Existing email links therefore offer explicit
password setup/recovery alongside existing-password verification; the migration never
silently resets an existing hash. Email-code/OAuth authentication remains supported by
the private Experience workspace. The broker is trusted account-recovery authority;
protect its key as carefully as platform credentials.

`src/auth/broker_credentials.rs`, `broker.rs`, `sessions.rs`, `handoff.rs`, the public
route allowlist and migration 052 share this behavior. `scripts/identity_broker.py`
exercises real PostgreSQL/HTTP setup, ordinary password login, wrong-password refusal,
foreign identity/shop denial, signature/replay rejection, session/handoff invalidation
and preservation of chosen credentials across further broker exchanges. These SQL and
network adapters remain **unproved**; no new whole-account Lean guarantee is claimed.
