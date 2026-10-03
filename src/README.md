# src

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`agent.rs](agent.rs): Persistent grounded conversations and tenant-scoped semantic knowledge HTTP adapters.
- [`bootstrap.rs](bootstrap.rs): Startup, additive migrations, persisted extensions and outbox worker.
- [`capabilities.rs](capabilities.rs): Shared HTTP/MCP capability dispatch and tool authorization.
- [`cart_model.rs](cart_model.rs): Persisted cart, item and customer-context types.
- [`cart_mutation.rs](cart_mutation.rs): Optimistic cart mutations and quantity normalization.
- [`cart_price.rs](cart_price.rs): Authoritative quantity pricing and localized checkout quote assembly.
- [`cart_routes.rs](cart_routes.rs): Store API cart and order route adapters.
- [`cart_storage.rs](cart_storage.rs): Cart creation, loading and input validation.
- [`catalog_model.rs](catalog_model.rs): Tenant product model and database hydration.
- [`catalog_page.rs](catalog_page.rs): Bounded tenant-scoped catalog reads. A cursor is a product ID, never an offset.
- [`catalog_routes.rs](catalog_routes.rs): Health and localized catalogue HTTP routes.
- [`channel_metrics.rs](channel_metrics.rs): Bounded, lossy diagnostic counters. Never use this buffer for business events.
- [`chat_lease.rs](chat_lease.rs): Short, cross-replica conversation leases; inference never retains a database transaction.
- [`checkout_handoff.rs](checkout_handoff.rs): Single-use checkout transfer for independent storefronts; no app-specific catalog or checkout rules.
- [`concierge.rs](concierge.rs): Read-only storefront shopping advisor.
- [`context.rs](context.rs): Bounded behavioral ports of Shopware 6.7.14.2 context and product-cart selection.
- [`customer.rs](customer.rs): Customer credential verification and context rotation.
- [`discount.rs](discount.rs): Integer-cent proportional discount allocation; cumulative rounding conserves the exact basket discount.
- [`experience.rs](experience.rs): Persisted storefront layout policy and observed synthetic rewards.
- [`extensions.rs](extensions.rs): Merchant catalogue and Wasm extension activation/state.
- [`foundation.rs](foundation.rs): Application dependencies, error responses and request context helpers.
- [`http_limits.rs](http_limits.rs): Bounded streaming responses for extension services and payment providers.
- [`inference.rs](inference.rs): Provider adapters. Credentials stay on the server; domain validation is separate.
- [`knowledge.rs](knowledge.rs): Apache AGE graph plus pgvector retrieval. Queries are fixed, parameters are data.
- [`lib.rs](lib.rs): Reusable pricing, context, sandbox, graph and inference modules.
- [`localization.rs](localization.rs): Shop locale resolution, translated catalog hydration and non-mutating merchant quote.
- [`main.rs](main.rs): Process lifetime only. See docs/source-map.md for domain responsibilities.
- [`mcp.rs](mcp.rs): Typed MCP schemas and JSON-RPC transport.
- [`migrations.rs](migrations.rs): Versioned setup is separate from serving; no catalog-wide startup repair.
- [`order_checkout.rs](order_checkout.rs): Atomic checkout, stock locks, extension policy and idempotency.
- [`order_routes.rs](order_routes.rs): Merchant order read adapter.
- [`outbox.rs](outbox.rs): Durable outbox and audit projection worker.
- [`planner.rs](planner.rs): Grounded model planning, recorded inputs and proposed changes.
- [`pricing.rs](pricing.rs): Behavioral port of Shopware 6.7.14.2 quantity calculators.
- [`proposal_apply.rs](proposal_apply.rs): Transactional application of approved, revision-bound proposals.
- [`proposal_model.rs](proposal_model.rs): Typed proposals and validation before persistence or execution.
- [`proposal_routes.rs](proposal_routes.rs): HTTP proposal creation, approval and task listing.
- [`routes.rs](routes.rs): HTTP transport registry; domain behavior lives in dedicated modules.
- [`rule_comparison.rs](rule_comparison.rs): Behavioral port of Shopware 6.7.14.2 RuleComparison::numeric and FloatComparator's exact epsilon boundaries.
- [`sandbox.rs](sandbox.rs): Pure Wasmtime guest execution with bounded resources and no host imports.
- [`seed.rs](seed.rs): Idempotent synthetic template catalogue initialization.
- [`studio.rs](studio.rs): Verified merchant overview facts consumed by the chat and activity views.
- [`ucp.rs](ucp.rs): Selected UCP checkout adapters sharing the native cart.
- [`verified_kernel.rs](verified_kernel.rs): Closed, side-effect-free commerce policies extracted to Lean; keep within the checked bool/u64 grammar.
- [`workers.rs](workers.rs): Independently deployable worker roles; leases and durable receipts coordinate replicas.

The [source inventory](../docs/module-inventory.md) is checked in CI. [The behavioral map](../docs/source-map.md) identifies integration suites, and [testing](../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
