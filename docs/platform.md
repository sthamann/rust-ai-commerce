# SaaS operator console

Open [admin.vendune.ai](https://admin.vendune.ai/) for the service directory, then choose **Platform operator**. Locally, open `/#platform`. This is a separate,
multilingual control plane for the platform operator, with a light blue workspace,
shop directory, statistics, shop creation and a bounded activity log. Its personal
session is independent of the merchant studio's browser session.

![Operator overview with synthetic database totals](assets/platform-overview-en.png)

## What the numbers mean

- Live shops exclude private staging environments. Migration-created empty
  `atelier`/`workshop` tenants and an operator's initial empty workspace are still
  shops; the UI does not silently hide them.
- Product SKUs include variant rows. Customers and merchant users are distinct
  populations. Shop teams count active memberships.
- Orders cover the selected 7/30/90-day calendar window, including today in the
  database's UTC timezone. Per-shop details show actual daily counts, including
  zero days. Monetary totals use that order cohort, not the provider settlement
  timestamp. Current inventory/customer counts are not historical snapshots.
- Amounts remain decimal strings grouped by currency. Recorded order value
  excludes cancelled orders. Simulated payments are separate. Confirmed captures
  require the persisted provider-confirmed `realMoneyCharged=true` and a confirmed capture/late-capture/refund
  state. Refunding a payment does not erase its original gross capture. These are gross captures, not net revenue, fees, refunds or settlements.
- API activity is persisted lifetime HTTP request counts, including development
  tests and merchant calls. It is not GA visitors or the selected order window.
  In-flight counter updates may appear after the normal metrics flush.
- Sales channels count active persisted channels, including the required main `default` channel once.
  Connected evidence counts app evidence records; uploaded product documents
  remain accessible in each shop's knowledge workspace.

## Access and first setup

A merchant `owner`/`admin` role never grants platform access. Neither an integration
key nor the instance bootstrap token can call `/api/platform/*`. A personal
session must resolve to a current, active `platform_operators` grant on every
request. Revocation applies immediately across replicas. Client-supplied internal
identity headers are removed. Platform access does not grant merchant membership
in foreign shops; the ordinary shop API keeps its normal permissions.

For a new host, [prepare private configuration and run the one-shot operator
setup](deployment.md). The CLI `--bootstrap-operator` requires migration-only
mode, hashes a supplied strong password and creates an empty initial operator
workspace. Re-running it verifies the existing password; it never resets an
existing user's password. It issues no browser session or printed credential.

For an **existing** personal account, an operator with database access can grant
or revoke explicitly:

```sh
python3 scripts/platform_admin.py grant --email operator@example.com --container YOUR_POSTGRES_CONTAINER
python3 scripts/platform_admin.py revoke --email operator@example.com --container YOUR_POSTGRES_CONTAINER
```

Without `--container`, the helper uses the locally supplied `DATABASE_URL` and
installed `psql`. `--database` selects an explicit test database for local checks.
Both changes write an audit record. This is an offline operational action, not an
endpoint available to ordinary signup. Public Compose disables merchant signup,
demo seeding and instance-token HTTP access. Existing merchant invitations still
work. Customer storefront registration remains available.

## Creating shops

Choose **Create shop**, provide a unique ID/name and optionally an existing
merchant owner's email. With no owner email, the operator owns the shop. Choose
an empty shop or sample catalogue. Neither choice creates demo customers or known
customer passwords. Settings, membership and audit commit in one transaction.
The shop uses simulated payments until explicitly configured for a provider.

On a configured public host, the directory opens `https://ID.vendune.ai/` and
`https://app.vendune.ai/?shop=ID#merchant`. Legacy shared-origin storefront
bookmarks redirect to the shop subdomain and retain product/channel/locale context.
Studio/login and private sandbox URLs stay on their original authenticated origin.
One frontend serves many shops and selected sales channels. The configured `SHOP_DOMAIN_SUFFIX` can bind
known shop subdomains to tenant scope; see [managed hosting](managed-hosting.md).
Automatic DNS/certificate provisioning for arbitrary merchant domains, billing,
resource quotas and automatic Storyfront-service provisioning remain absent.
The directory uses keyset pagination (default 50, maximum 100); searches and
statistics periods are bounded. Sample-catalogue graph indexing is reported as
`knowledgeIndexed`, independent of the already committed shop.

## HTTP contract

All endpoints require `Authorization: Bearer PERSONAL_OPERATOR_SESSION`.
No customer records, support-mail bodies, passwords or integration secrets are
returned by the aggregate endpoints.

| Endpoint | Result |
|---|---|
| `GET /api/platform/session` | Current operator identity and platform capabilities |
| `GET /api/platform/overview?days=30` | Global counts, per-currency totals, persisted channel counters |
| `GET /api/platform/shops?days=30&search=demo&limit=50&after=ID` | Bounded live-shop directory; `hasMore`, `nextCursor` |
| `GET /api/platform/shops/ID?days=30` | Registration/status, business identity, team, product/customer/app counts, channels, lifetime HTTP timings, currency totals and daily orders |
| `POST /api/platform/shops` | `{id,name,ownerEmail?,seedCatalog?}`; returns canonical `urls`, legacy paths and payment/indexing state |
| `POST /api/platform/shops/ID/status` | `{status,revision,reason,confirmShopId?}`; audited, reversible lifecycle |
| `GET /api/platform/ai` | Current revision, sanitized settings and key-presence flags; never key values |
| `PUT /api/platform/ai` | `{revision,settings,keys?,clearKeys?}`; encrypted write-only credentials |
| `GET /api/platform/infrastructure` | Real database/Qdrant probes, process pool/cache, queues, HTTP timings and optional Linux container resources |
| `GET /api/platform/audit` | Latest 100 operator events without private audit payloads |

The frontend and API support English, German, French and Spanish for UI copy.
Shop names, authored evidence and provider codes retain their original content.

## Verification boundary

`platform.py` exercises the actual HTTP/PostgreSQL path: grants, failed escalation,
forged headers, integration keys, ownership isolation, empty/sample provisioning,
conflicts, validation, pagination, actual simulated checkout, daily/global totals,
staging exclusion, audit and revocation. `platform_setup.py` starts a fresh
production-mode database and checks actual operator sign-in, no demo accounts,
existing-password verification and closed public signup/bootstrap. Both are
required in CI. `hosting_container.py` exercises the built non-root deployment
image against a uniquely named local database.

The operator authorization conjunction is a production-bound Lean policy. SQL,
provisioning, browser behavior and deployment are explicitly outside its proof.
This console is an experimental platform control plane, not a complete hardened
SaaS operations system. Backup restore, abuse control, SSO/MFA/account recovery,
quotas, settlement accounting and measured failover still require work.

## Central AI, inherited by all shops

**AI providers** selects the platform default and manages Ollama-compatible,
OpenAI Responses and Anthropic Messages connections. Existing shops and new shops
resolve the same server-side settings. Chat, app generation, product questions,
translation jobs and AI flow proposals use the shared adapter. Choose **Platform
default** to follow later operator changes; explicit provider choices remain
available. Settings are cached per process for at most five seconds. Restarted
replicas recover them from PostgreSQL. No browser account subscription is linked. **Configured** means the adapter has
the required settings/credentials, not that a paid request or provider-health
probe has succeeded.

Keys are write-only and stored as AES-256-GCM ciphertext with a random nonce and
provider-specific authentication. `PLATFORM_SECRET_KEY` must contain 64 random
hex characters, be runtime-only, identical across replicas, and backed up
separately from the database. A missing/mismatched key fails safely; replacing it
without preserving the old key makes existing ciphertext unreadable. Blank key
fields retain stored keys. Removing a stored key restores environment fallback;
it does not erase an environment credential. Disabling a provider denies its use.
No key is returned to merchants, operators or audit responses.

Ollama credentials/endpoints are also used by embeddings, while
`EMBEDDING_MODEL` stays pinned to the indexed 1024-dimensional model. Changing the
chat model cannot silently reinterpret the vector index. Optional product image
jobs use the inherited OpenAI connection but still require
`IMAGE_GENERATION_ENABLED=true` and keep their independent image model. Central
settings do not start a paid inference/image request by themselves.

![Central AI settings in the actual local operator UI](assets/platform-ai-en.png)

## Shop lifecycle and dossier

Open a directory row to view registration, company/legal details, team access,
products, customers, installed apps, sales channels and recorded API/MCP/UCP
activity. Channel cards link to their actual storefront scope. Counts are bounded
reads over stored records; HTTP calls are not unique visitors.

**Pause** requires a reason and current status revision. Customer actions, AI
requests and ordinary writes are denied. Authenticated merchants retain read-only
GET access and explicitly admitted product/order searches and quotes. Live-shop
suspension also applies to its private stages. New outbox/flow/app/schedule/
translation/vector/image work is deferred; already-running requests/tasks can
finish. Reconciliation of existing payment outcomes remains available.

**Move to trash** additionally requires typing the exact shop ID. It closes shop
operations but preserves records and can be restored through the same console.
This is recoverable deletion, not physical erasure or a GDPR purge. Status changes
are revision-checked in a transaction and record actor, time and reason. They do
not automatically cancel orders, refund payments or terminate running providers.

## Infrastructure and measurement boundaries

![Actual local service probes; unavailable Linux counters remain empty](assets/platform-infrastructure-en.png)

**Infrastructure** shows PostgreSQL size/version/connection probes, Qdrant
health, Rust pool/cache diagnostics and pending events. HTTP counters persist
per shop/channel and aggregate across processes. Mean/max handler milliseconds
use only calls with recorded timing; older requests do not dilute averages.
They exclude the external network and browser rendering, and are best-effort
operational diagnostics rather than billing or security logs.

### What the HTTP error counts mean

The former **Failures** label combined every recorded HTTP 4xx and 5xx response.
It was not a count of software defects. The dashboard, shop dossier and
infrastructure view now share an exact response-code breakdown:

- **Access rejected (401/403):** check the session, permission or browser Origin.
  A legitimate security refusal must not be “fixed” by relaxing access checks.
- **Other 4xx:** inspect the specific status. 400/422 can indicate invalid input,
  404 a missing record, 409 a revision conflict and 429 an admission limit.
  These can also expose client bugs and are not automatically considered harmless.
- **Server failures (5xx):** investigate the server, database or downstream provider.
- **Historical · unclassified:** preserved older failures for which no response
  code was stored. They cannot be retrospectively assigned to one of these groups.

`responses` in the existing operator overview/dossier/infrastructure APIs maps
HTTP codes to cumulative counts. Migration 056 adds this bounded histogram to
`channel_metrics`; the existing interval buffer and bulk database flush remain
its owner. No payload, token, address, query string or raw object URL is stored.
For new 4xx/5xx responses, service logs contain the router template, method,
workspace identifier and status, so operators can locate the failing endpoint
without logging request bodies. For example, a product route contains `{id}`
rather than a real product ID.

These diagnostics start **after** host resolution and authentication admission.
Early host/session refusals are not included. MCP application errors returned in
an HTTP 200 JSON-RPC envelope are also not HTTP failures. This view therefore
cannot claim all protocol operations succeeded or provide security auditing.
Counters are best-effort and can be lost on timeout/process failure; they are
not suitable for billing. New counts accumulate alongside old totals, which are
never reset or relabelled as confirmed successes.

CPU/RAM come from Linux `/proc` and cgroup v2 when available; CPU needs two
refreshes at least a second apart and is normalized to the container quota.
Unavailable readings display **—**. Pool/cache/process readings describe the
responding process/container, not every hosting service or the whole fleet.
No p95/p99, host-wide load, database CPU, external LLM performance or GA visitor
counts are invented. Use the hosting provider's monitoring for that broader view.
