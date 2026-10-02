# Vercel frontend + self-hosted Rust / PostgreSQL

This is the requested split deployment preparation. It does not deploy the
long-lived Rust service or database into a Vercel function.

## Backend

Copy `deploy/.env.example` to ignored `deploy/.env`. Set a public DNS name, an
independent generated database password and instance-admin credential. URL-encode
the database password in `DATABASE_URL`. All model and app-service credentials
remain server-side. Point DNS to the backend host and allow ports 80/443.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

The image builds the real Rust binary and frontend. Setup records checksummed
migrations once; `BOOTSTRAP_MODE=migrate` performs setup without starting workers,
and `BOOTSTRAP_MODE=serve` requires every schema to be ready. The default `auto`
mode handles the first admitted experimental deployment. Serving replicas do not
scan or rewrite all tenant catalogs at startup. The runtime runs as a
non-root user. PostgreSQL/AGE/pgvector have no published database port in this
setup. Caddy terminates HTTPS and proxies to Rust on the private container
network. [Caddy's automatic HTTPS](https://caddyserver.com/docs/automatic-https)
requires a reachable configured domain. Persistent volumes retain database and
certificate state. Back up the database before upgrades.

Ollama is an operator-controlled private service; the Compose file does not
download a model or reserve a GPU. Optional OpenAI/Anthropic API secrets are
provided only to Rust. Storyfront remains an independently deployed service;
configure its admitted tenant mappings and `APP_SERVICES` as documented in
[Storyfront setup](storyfront.md).

## Frontend on Vercel

Render the actual HTTPS backend origin into the frontend configuration:

```sh
python3 scripts/prepare_vercel.py --backend https://YOUR-COMMERCE-API-DOMAIN
```

Select `frontend` as the Vercel project's root, Vite as its framework, `npm run
build` as its build command and `dist` as output. Generated `frontend/vercel.json`
proxies `/api`, `/store-api`, `/mcp`, `/ucp`, `/.well-known`, `/media` and `/health`
to the backend and serves the SPA for frontend routes. It contains no secrets.
Vercel supports [external rewrites](https://vercel.com/docs/routing/rewrites)
and [Vite deployments](https://vercel.com/docs/frameworks/frontend/vite).
Auth/cart/agent routes are marked private and non-cacheable. Authenticated or
personalized results must never be shared across tenants by a CDN rule.

A merchant can register a shop and create additional shops under that account.
Use `?shop=SHOP_ID`, and optionally `&channel=CHANNEL_ID`, for a storefront.
Staging previews use `&sandbox=1` plus the current personal merchant session.
One frontend can serve many shops; private tenant membership checks remain in
Rust. Custom domains and host-to-tenant provisioning are not implemented by the
query-parameter prototype.

## Before public SaaS operation

The repository prepares the architecture, containers and configuration. It does
not certify a hardened public service: account recovery/email verification,
production rate limits/abuse controls, bootstrap-token restrictions, full
core-wide RLS, per-tenant inference budgets, signed app trust, billing,
large-catalog staged branches, backup/restore operations and measured failover
remain deployment work. Use this setup for admitted experimental shops first.

No public Vercel project, domain or backend host was selected/deployed as part of
this preparation. Container and configuration validation is distinct from a
verified HTTPS/Vercel round trip.
