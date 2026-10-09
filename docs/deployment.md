# Vercel frontend + self-hosted Rust / PostgreSQL

**Current status:** the operator console and deployment package are implemented
and tested locally. The managed Rust Studio and `/health` are reachable at
`https://app.vendune.ai/` (checked 2026-10-06). The root `vendune.ai` currently fails
TLS hostname negotiation. Public Vercel commerce deployment and production checkout
remain unverified; see [managed hosting](managed-hosting.md) for the active topology.
GitHub Pages hosts documentation, not the Rust commerce service.

## Prepare the private host configuration

Use a Linux host with Docker Compose, a public DNS name pointing to it and
reachable ports 80/443. PostgreSQL/Qdrant stay on the private Compose
network. The repository does not purchase a server or reuse unrelated services.

From the repository root:

```sh
python3 scripts/prepare_host.py --domain commerce-api.YOUR-DOMAIN --admin-email YOUR-OPERATOR-EMAIL
```

This creates ignored `deploy/.env` with mode 0600, independent generated database,
instance and operator credentials. It refuses to overwrite an existing file and
never prints secret values. Configure the private inference endpoint and optional
provider/app endpoints there. Transfer this private file securely to the selected
host; do not commit it or paste resolved Compose configuration into logs.

Public Compose enforces `SEED_DEMO=false`, `ALLOW_PUBLIC_SIGNUP=false` and
`ALLOW_BOOTSTRAP_AUTH=false`. It creates no known demo customer accounts. Existing
demo data is not deleted during an upgrade: never reuse an old publicly seeded
demo database for a new public deployment without reviewing its accounts.

## Start the backend and your operator account

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build postgres qdrant commerce gateway
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile operator-setup run --rm operator
```

The image builds the real Rust binary and frontend, including the shared analytics
SDK. Rust runs as UID 10001. The one-shot operator service receives the initial
operator password; the long-running commerce service does not. After successful
setup, remove `PLATFORM_ADMIN_PASSWORD` from the private file (retain your password
in your own password manager). Sign in at `https://YOUR-BACKEND-DOMAIN/#platform`.
No instance token should be entered in the browser. Use the console to create
empty or example-catalogue shops, then invite individual merchant team members.

Caddy terminates HTTPS and proxies to the internal Rust service.
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) requires a
reachable configured domain. Persistent volumes retain PostgreSQL, uploaded
binary product assets (stored in PostgreSQL), connector state and certificates.
Back up PostgreSQL before upgrades; automatic backup/restore/failover is not yet
implemented.

Setup records immutable checksummed migrations. `BOOTSTRAP_MODE=migrate` performs
setup without workers; `serve` requires all migrations to be ready. On upgrades,
run the controlled migration-only job and then the post-migration runtime-role provisioning job before restarting `serve` replicas; do not
roll mixed schema versions blindly. The initial `auto` mode supports one admitted
experimental deployment, not rolling-upgrade orchestration.

Ollama is an operator-controlled private service. Compose does not download a
model or reserve a GPU. Optional OpenAI/Anthropic credentials stay in Rust.
The [connected-app service](connected-apps.md) is optional; configure private
Google/Slack clients, encryption/gateway keys and the actual callback URL before
starting the `connected-apps` profile. Storyfront remains independently deployed;
configure its admitted tenant mappings and `APP_SERVICES` as in
[Storyfront setup](storyfront.md). Creating a commerce shop does not automatically
provision those external services or enable real payment credentials.

## Deploy the frontend on Vercel

Only after the backend is reachable over valid HTTPS:

```sh
python3 scripts/hosting_check.py --origin https://YOUR-BACKEND-DOMAIN
python3 scripts/prepare_vercel.py --backend https://YOUR-BACKEND-DOMAIN
```

Create the dedicated `vendune` Vercel project from this GitHub repository.
Select `frontend` as root, Vite, `npm run build`, and `dist`. **Enable including
source files outside the root directory**: the frontend imports the shared
`extensions/sdk/analytics` module. This is also covered by the corrected Docker
build. Keep the generated `frontend/vercel.json` in the deployment checkout or
configure the same rewrites in the deployment's committed environment-specific
configuration; it is ignored by this generic source repository and must be
supplied before a Git-based build. Do not import a project with placeholder
rewrites and call it a working deployment.

Set `COMMERCE_PUBLIC_ORIGIN` on Rust to the HTTPS origin of the Studio browser.
MCP validates this configured origin; a proxy Host header cannot grant browser access.
For a separate Vercel Studio, use its real public origin rather than the internal Rust host.

Generated configuration proxies `/api`, `/store-api`, `/mcp`, `/ucp`,
`/.well-known`, `/media` and `/health` to the backend and serves the SPA. It contains
no credentials. Vercel supports [external rewrites](https://vercel.com/docs/routing/rewrites)
and [Vite deployments](https://vercel.com/docs/frameworks/frontend/vite). Private
API responses are marked non-cacheable. Authenticated/personalized results must
never be shared across tenants by CDN rules. Run the HTTPS check against the
Vercel preview too, then verify operator sign-in, creation of an isolated shop,
customer registration/address checkout and own order access before promoting it.

Use `?shop=SHOP_ID` and optionally `&channel=CHANNEL_ID` for storefronts.
`/#platform` opens the operator console; `?shop=SHOP_ID#merchant` opens a shop's
merchant studio. Staging previews use the existing private merchant session.
`SHOP_DOMAIN_SUFFIX` supports operator-configured shop subdomains with trusted
host-to-tenant binding; see [managed hosting](managed-hosting.md). Automatic
DNS/certificate provisioning for arbitrary merchant domains remains unimplemented.

## Local release checks

```sh
docker build -f deploy/Dockerfile -t vendune:platform .
# With the existing local Compose PostgreSQL container and private DATABASE_URL:
python3 scripts/hosting_container.py
```

This creates and removes only a uniquely named synthetic test database/container,
checks the built frontend, non-root Rust process, personal operator login,
actual shop creation and closed signup/bootstrap gates. It is distinct from a
public HTTPS/Vercel deployment. `platform.py` and `platform_setup.py` are mandatory
HTTP/PostgreSQL CI tests.

Additional public deployments need their own host/domain and operator identity.
Broader production SaaS requires recovery/email verification, full provider/token/spend quotas, signed app trust, billing,
large-catalog staged branches, backups/restores and measured failover. The
[operator guide](platform.md) describes exactly what the dashboard measures.

The Northflank topology, cost model and migration boundaries are in [managed-hosting.md](managed-hosting.md).

## Central provider secrets and shop domains

With wildcard DNS/TLS and `SHOP_DOMAIN_SUFFIX=vendune.ai`, new shops use
`SHOP.vendune.ai`; `admin.vendune.ai` is the public service directory. Set
`COMMERCE_PUBLIC_ORIGIN=https://app.vendune.ai` for the shared merchant Studio.
Provision `PLATFORM_SECRET_KEY` as a persistent runtime-only 64-character random
hex key before saving provider API keys in the operator console. All replicas and
AI workers need the same key; back it up separately. Do not rotate it without
re-encrypting existing credentials. `INFERENCE_ALLOW_LOOPBACK` stays false in
public deployments. [Control-plane behavior and boundaries](platform.md).

## Optional private experience service

The generic trusted broker, one-use Studio handoff and hosted frontend mount are opt-in. Configure the exact private service issuer/origin and matching runtime-only shared keys; see [experience integration](experience-integration.md). The private service and Storyfront never belong in this public build or repository.

### Storefront product addresses

Public storefronts use `https://SHOP.vendune.ai/`. The shared Studio deliberately remains at
`https://app.vendune.ai/?shop=SHOP#merchant` so merchant login stays on its original domain.
Legacy product bookmarks discard stale `studio` parameters and move to the shop domain.
Product links use `/products/SKU/LOCALIZED-SLUG` (or `/products/SKU` without a slug),
with the selected content language and sales channel retained. SKU identity prevents two
same-name products from colliding; translated slugs inherit through the existing language
chain. The server admits direct HTML requests through the same tenant, active-product
and sales-channel checks as the Store API. Browser navigation and Back/Forward retain
cart state, and reloads serve the application at that URL. Older slug addresses still find
the SKU and canonicalize to the currently saved slug. Metadata and canonical tags are
rendered by the client; server-side product HTML, sitemap generation and slug-only
redirect history are not implemented by this change.

## Strict runtime and real transaction pooling

The production Compose template separates migration owner, commerce runtime and
connector credentials. Migrations finish before role provisioning; commerce starts
in `serve` with strict RLS, no bootstrap auth and no demo fallback. Run provisioning
after additive upgrades. Existing hosts must migrate and change their own runtime
credentials explicitly; changing this template alone does not reconfigure them.

`DB_CLUSTER_CONNECTION_BUDGET` is shared by all HTTP/worker processes. Each reserves
`DB_POOL_MAX + 2`; set `DB_MAX_PROCESSES` and the same budget on every replica.
Transaction pooling requires PgBouncer 1.21+, protocol prepared-statement support
and a **direct/session** `DATABASE_LISTENER_URL` under the non-owner login. Set
`DB_POOLER_MODE=transaction`; statement pooling is unsupported. [Complete settings,
upgrade sequence, worker retention and tested boundaries](core-hardening.md).

## Production image compile-time dependencies

Run `python3 scripts/testing/image_context.py` before building `deploy/Dockerfile`.
This CI gate reads literal Rust `include_str!`/`include_bytes!` dependencies and
checks them against the Rust stage COPY set. Its negative control removes the
historical app-manifest COPY and must find the missing inputs. These eight files
are used by app approval/upgrade compatibility; tests against a full checkout
alone cannot detect their absence from a container build. The final image still
contains no Python interpreter. A green dependency check does not replace an
actual image build or the managed backup/migration/runtime-role rollout.
