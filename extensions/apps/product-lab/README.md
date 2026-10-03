# Product Lab — complete external app example

This package adds a Studio navigation module, a product-detail question panel,
a storefront page, managed translated/JSONB guide records, namespaced HTTP APIs,
MCP tools, selected AI context and an independent SQLite/event service.

Run `PRODUCT_LAB=1 ./scripts/dev.sh` from the repository root, then install
`manifest.json` in an owner/admin's synthetic shop through `POST /api/apps`.
The launcher generates private ignored credentials; none enter the browser.
Open **Product Lab** in the Studio sidebar or **Product advice** in the shop.
Manage guide records under **Apps → Product Lab**. The native host supplies context
and allowed actions; `app.js` owns the UI and handles product-context updates.

| File | Responsibility |
|---|---|
| `manifest.json` | Versioned data/action/surface/API/event/AI declarations |
| `server.py` | Separate app service, sample facts and durable tenant-keyed event inbox |
| `index.html`, `app.js` | Versioned standalone guest UI in four languages |
| `Dockerfile`, `compose.yaml` | Non-root, read-only and resource-limited container example |

The recommendation action retrieves fixed **sample care facts**, not merchant
knowledge or an LLM answer. Managed guides demonstrate separate shop records;
a real provider can implement its own retrieval/model behind the same action.
The sample fact table is deliberately shared fixture content; tenant-dependent
records must include tenant ownership. Event delivery requires an independent
`PROCESS_ROLE=app-worker` process and receiver deduplication.

[Complete contract, setup, SDK, tests and limits](../../../docs/app-platform.md).
Container limits do not constitute microVM isolation or a hostile-code runner.
