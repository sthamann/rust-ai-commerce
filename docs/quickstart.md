# Run a Rust ecommerce prototype locally

Start with commerce, then add AI or an MCP client when you need it.

## Requirements

- Rust stable 1.96+ (`cargo` on your PATH)
- Node.js 22 or newer and npm
- Docker with Docker Compose and a running daemon
- Python 3
- Free ports 8787 (application), 15487 (database) and 16333 (private Qdrant)

Ollama and API credentials are optional for the initial commerce tour.

## Start commerce without a model download

```sh
git clone https://github.com/sthamann/vendune.git
cd vendune
./scripts/dev.sh
```

The first start pulls PostgreSQL/Qdrant images and builds the frontend and Rust application.
Keep the terminal open while the server runs. Open http://127.0.0.1:8787/.
The storefront, SKU selection, quantity pricing, cart and simulated checkout
work without a running LLM. Chat planning and vector indexing require their
respective model services and report errors when unavailable.

Open Vendune Studio (`/#merchant`). The login page offers **Create shop** for
a new personal owner account, **Sign in** for an existing account and invitation
acceptance. Select **Create shop** for the first local tour.
Create a personal owner account and a synthetic shop. One identity can belong
to multiple shops. The generated global `MERCHANT_TOKEN` is an instance bootstrap
credential, not an invitation or a merchant credential to distribute.

The synthetic B2B customer is `buyer@example.test` / `demo-business`. It is
separate from merchant accounts. The default tour uses simulated/manual payments.
A separately configured native PayPal adapter supports Sandbox/Live;
actual PSP transactions remain unverified.

Stop the app with Ctrl+C. Restart with `./scripts/dev.sh`; database data is
retained. Stop the database with `docker compose -p vendune stop`.
Do not remove its volume if you want to retain orders and accounts.

## Add the connected playground

After creating your personal merchant account:

```sh
python3 scripts/playground.py --email your-personal-merchant@example.test
```

Enter that account's password privately. This creates a separate **Commerce
Playground** with a rule, `TRY10` coupon, Home collection sales channel, engraving
app and active branching invoice flow. The script prints its Studio/storefront
links. Repeating setup preserves your edits. No AI/provider calls or orders are
made by setup. [Follow the ten-minute walkthrough](playground.md).

## Add local AI (optional)

Install and start Ollama, then explicitly download the documented models:

```sh
ollama pull qwen3.6:35b
ollama pull qwen3-embedding:0.6b
```

The Qwen3.6-35B-A3B artifact is about 24 GB; runtime/context need additional
memory. This is not a lightweight default for every laptop. A compatible
installed model can be selected with `OLLAMA_MODEL` in the private `.env`.
Smaller alternatives are not claimed as verified by this project.
An existing `.env` keeps its previous model selection.

Restart the app after changing `.env`. In Studio, choose Local in **Settings**.
Select **Refresh shop knowledge** when the embedding service is ready.

Try a bounded request such as: “Propose a price of EUR 23 for the mug. Do not
apply it yet.” Inspect the actual change fields before approving; the model's
summary alone is not an execution guarantee.

## Use OpenAI or Claude (optional)

Configure your own server-side API credentials following [the provider guide](connectors.md).
API access is separate from consumer chat subscriptions and may incur charges.
No cloud credentials are needed for ordinary commerce or local Ollama inference.

## Connect an MCP client

Follow [Claude Desktop and local MCP clients](connectors.md#claude-desktop--local-mcp-clients).
The bridge connects to your running Rust app. It does not start the server.
Remote hosted clients cannot connect directly to localhost; their setup remains separate.

## Run a separate development instance

Use a different Compose project and database/application ports on a fresh checkout:

```sh
DB_PORT=15489 QDRANT_PORT=16335 BIND_ADDR=127.0.0.1:8789 \
COMPOSE_PROJECT_NAME=vendune-second ./scripts/dev.sh
```

`DB_PORT` is used when generating a new `.env`. For an existing `.env`, update
its `DATABASE_URL` to the chosen port and keep `QDRANT_URL` consistent with
`QDRANT_PORT` if it is already configured. Use the same project name/ports when
restarting; stop its database with `docker compose -p vendune-second stop`.
Never point a test run at a shop whose data you need to preserve.

## Troubleshooting

- **`cargo: command not found`:** install Rust or put the existing toolchain on PATH.
- **Cannot connect to Docker:** start Docker and check that `docker info` succeeds.
- **Port already allocated:** use the separate-instance settings above.
- **AI unavailable:** commerce still works; check the chosen provider and model service.
- **First build is slow:** images are downloaded and Rust/frontend dependencies are built.

[Project overview](../README.md) · [Full feature tour](features.md) · [Security scope](security.md)

## Separate setup, HTTP and workers

Local development defaults to `BOOTSTRAP_MODE=auto` and `PROCESS_ROLE=all`.
For independently operated processes, run setup once before starting replicas:

```sh
BOOTSTRAP_MODE=migrate target/release/vendune
BOOTSTRAP_MODE=serve PROCESS_ROLE=http target/release/vendune
# Separate terminals/processes, using the same private database configuration:
BOOTSTRAP_MODE=serve PROCESS_ROLE=memory-worker target/release/vendune
BOOTSTRAP_MODE=serve PROCESS_ROLE=payment-worker target/release/vendune
BOOTSTRAP_MODE=serve PROCESS_ROLE=app-worker target/release/vendune
BOOTSTRAP_MODE=serve PROCESS_ROLE=translation-worker target/release/vendune
BOOTSTRAP_MODE=serve PROCESS_ROLE=media-worker target/release/vendune
```

The HTTP role does not consume the durable outbox. The memory worker creates
commerce projections and app deliveries; the app worker delivers them. Serve
refuses an incomplete setup. Schema checksums detect changed applied migrations
when running setup; keep applied source immutable and add new migration files.
Plan the initial index build before serving a large existing database. This
process separation is a foundation, not a production deployment recipe.

## Upgrading an existing pre-Vendune checkout

The repository and binaries are now named **Vendune**. An old checkout directory
can stay in place. `scripts/dev.sh` reuses a detected legacy Compose database
project; an explicit `COMPOSE_PROJECT_NAME` overrides detection. Use that actual
project name when stopping it. Never remove the old data volume to rename the
app. Rebuild frontend and Rust before starting the new `target/debug/vendune`
binary. Existing shop IDs and browser sessions remain valid. See [branding and
compatibility](branding.md).
