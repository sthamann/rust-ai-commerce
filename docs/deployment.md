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
run a controlled migration-only job before restarting `serve` replicas; do not
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
Broader production SaaS requires recovery/email verification, rate limits/abuse
controls, core-wide RLS, per-tenant inference budgets, signed app trust, billing,
large-catalog staged branches, backups/restores and measured failover. The
[operator guide](platform.md) describes exactly what the dashboard measures.

The Northflank topology, cost model and migration boundaries are in [managed-hosting.md](managed-hosting.md).
