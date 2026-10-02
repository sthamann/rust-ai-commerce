# Rust AI Commerce — Agentic commerce with merchant control

An **open-source ecommerce prototype in Rust** for developers exploring AI-assisted
B2C and B2B commerce. Run a storefront and merchant workspace on your own machine,
connect local LLMs or optional cloud models, and expose selected commerce operations
through **Model Context Protocol (MCP)** and **Universal Commerce Protocol (UCP)** adapters.

**The AI proposes. The merchant reviews and approves. The Rust core applies the change.**
Browser and agent clients share the same pricing, inventory and checkout operations.
This is also a laboratory for porting selected original Shopware behavior to Rust.

[Website & guides](https://sthamann.github.io/rust-ai-commerce/) ·
[Quickstart](docs/quickstart.md) · [MCP setup](docs/connectors.md) ·
[Feature matrix](docs/shopware-parity.md) · [Contributing](CONTRIBUTING.md)

[![Verify prototype](https://github.com/sthamann/rust-ai-commerce/actions/workflows/verify.yml/badge.svg)](https://github.com/sthamann/rust-ai-commerce/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[![Merchant reviews a local AI proposal before approving the price change](docs/assets/merchant-proposal-en.png)](https://sthamann.github.io/rust-ai-commerce/#demo)

## Why try it?

| You want to explore… | What this prototype provides |
|---|---|
| AI-assisted merchant operations | Stored proposals, visible changes, role checks and explicit approval |
| Local AI commerce | Ollama for local inference; optional OpenAI and Anthropic API adapters |
| Agent commerce protocols | A local MCP bridge and partial UCP checkout adapters using shared operations |
| Rust ecommerce and B2B checkout | SKU variants, quantity prices, tax/shipping configuration and durable demo orders |
| Shopware behavior in Rust | Bounded ports checked against original Shopware PHP classes |
| Storyfront shops | Catalog/variant/media import and checkout transfer through a separate [Storyfront app](docs/storyfront.md) |
| Self-hosted storage | PostgreSQL + Apache AGE + pgvector; no paid database service required |

The interface supports **English, German, French and Spanish**. MIT licensed.

## Try the commerce app first — no model download

Requirements: **Rust stable (1.96+), Node 22+, Docker Compose and Python 3**.

```sh
git clone https://github.com/sthamann/rust-ai-commerce.git
cd rust-ai-commerce
./scripts/dev.sh
```

Open [Storefront](http://127.0.0.1:8787/),
[Commerce Studio](http://127.0.0.1:8787/#merchant), or the
[example product](http://127.0.0.1:8787/#product/mug).
In Studio, select **Team & access → Create shop** to create a personal owner
account and a separate synthetic shop. Then explore products, quantity prices,
cart and simulated checkout. AI chat and semantic indexing require their model
services; ordinary commerce operations do not.

The first start builds the database image, frontend and Rust application. It can
take several minutes. No model is downloaded by this command. Private instance
credentials are generated in ignored `.env`; the app binds to `127.0.0.1:8787`
and PostgreSQL to `127.0.0.1:15487`.

## Choose your next step

- **Add local AI:** follow the [Ollama setup](docs/quickstart.md#add-local-ai-optional).
  The documented default model download is about 24 GB, with additional runtime
  memory required. Install it only when you want local inference.
- **Connect an MCP client:** use the [Claude Desktop / local MCP configuration](docs/connectors.md#claude-desktop--local-mcp-clients).
- **Use a cloud model:** configure your own API credentials using the
  [provider guide](docs/connectors.md#models-inside-the-merchant-chat).
- **Study the implementation:** read the [feature tour](docs/features.md),
  [architecture](docs/architecture.md) and [Shopware migration workflow](docs/migration.md).

## See three short feature demos

[Watch the feature clips](https://sthamann.github.io/rust-ai-commerce/#demo):

- Switch an actual SKU, select six units and carry the quantity tier into the cart.
- Personalize a product through an installed Wasm app; its fee enters the real cart.
- Review and approve a local AI price proposal, then inspect the changed storefront.

In the approval clip,
a local model proposes EUR 69.90 instead of EUR 74.90 for the lamp; the price
changes only after merchant approval and is then visible in the storefront.
The recording uses a synthetic shop; waiting time is shortened.

1. Ask the assistant to propose a catalog change.
2. Inspect the stored proposal and the exact fields that would change.
3. Approve with an authorized merchant account.
4. Inspect the updated product in the storefront.

Model text does not grant permissions. The server checks roles and current
revisions before applying an approved proposal. See the [security scope](docs/security.md).

## Inspect measured performance

The [local benchmark comparison](https://sthamann.github.io/rust-ai-commerce/benchmarks.html)
reports translated 6-/1,000-product catalogs, a 20-line cart and fresh durable
checkouts. It includes baseline/optimized results, raw latencies, response checks,
hardware and source/binary metadata. [Reproduce the setup](docs/benchmarks.md).
These bounded synthetic measurements do not establish production capacity or LLM speed.

## Current status and limits

**Working prototype; payments are simulated, manually recorded or PayPal Sandbox.
No real money is charged.** This is not a complete drop-in Shopware replacement or a validated
production SaaS deployment.

MCP/UCP cover selected capabilities, not full protocol conformance. Hosted
ChatGPT/Claude connectors require separate endpoint/account setup; no production
OAuth server is included. Live cloud model quality, production scale and causal
sales uplift are unverified. The Sandbox adapter is tested with local contract
fixtures; no live Sandbox transaction is claimed. See the [precise feature matrix](docs/shopware-parity.md)
and [connection boundaries](docs/connectors.md).

## Apps, payments and shop intelligence

The v0.5 prototype also includes versioned app installation, independent worker
roles, an evidence-based shop-intelligence view and a PayPal Sandbox adapter.
See [implementation and limits](docs/intelligence-apps-payments.md),
[worker roles](docs/intelligence-apps-payments.md) and [extension examples](extensions/README.md).

## Evidence and documentation

- [Features, extension examples and verification commands](docs/features.md)
- [Source files and their tests](docs/source-map.md)
- [Recorded verification results](docs/verification.json) and [current CI runs](https://github.com/sthamann/rust-ai-commerce/actions)
- [Original Shopware migration units](porting/units.json) and [migration workflow](docs/migration.md)
- [Architecture decisions](docs/architecture.md), [security](docs/security.md), [third-party licenses](THIRD_PARTY.md)

The recorded suite includes **4,592 bounded comparisons** against original
Shopware 6.7.14.2 PHP classes. These cover selected pricing/context/tax operations;
they do not establish full Shopware compatibility.

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Useful contributions include
reproducible bugs, clearer setup instructions, locale improvements and bounded
behavior ports with original-source comparisons. Please include the current
version, steps to reproduce and expected versus observed behavior.

App-owned product rules: engraving and gift-message packages supply their own Wasm business rules, input fields and localized forms. The core hosts a generic cart-contribution contract. See [extension examples](extensions/README.md#app-owned-product-configuration).
