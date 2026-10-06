# SaaS operator console

Open `/#platform` on the same origin as the storefront. This is a separate,
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

The directory opens `/?shop=ID` and `/?shop=ID#merchant`. One frontend serves many
shops and selected sales channels. The configured `SHOP_DOMAIN_SUFFIX` can bind
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
| `GET /api/platform/shops/ID?days=30` | Shop name, currency totals and daily orders |
| `POST /api/platform/shops` | `{id,name,ownerEmail?,seedCatalog?}`; returns shop paths and payment/indexing state |
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
