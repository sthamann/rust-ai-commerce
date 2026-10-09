# src/marketing

Ownership, executable contracts and explicit migration boundaries are described in [the automation guide](../../docs/automation.md). Each module owns one responsibility; HTTP and MCP delegate to the same tenant-bound operations.

- [app_flows.rs](app_flows.rs): App flow dispatch uses the same permission/schema gateway as HTTP/MCP, with a stable job key.
- [catalog.rs](catalog.rs): Native condition metadata, app action/event discovery and source-compatible condition import.
- [channels.rs](channels.rs): Sales channels share a merchant tenant but bind independent catalog visibility, locale and cart identity.
- [customer_facts.rs](customer_facts.rs): Customer rule authority is loaded by tenant and stable customer ID, with aggregate history and calendar age.
- [dependencies.rs](dependencies.rs): Tenant-owned semantic references, durable uses and channel dependency counts for safe removal.
- [lifecycle.rs](lifecycle.rs): Shared HTTP/MCP revision-bound deletion, serialized configuration mutations and reference admission.
- [facts.rs](facts.rs): Assemble private server-owned rule context once per quote/event; never publish customer facts in cart responses.
- [flow_access.rs](flow_access.rs): Every queued flow step rehydrates current membership; stored definitions never preserve revoked privileges.
- [flow_actions.rs](flow_actions.rs): Native action schema and permissions use original Core names; no arbitrary SQL, shell or unguarded payment transitions.
- [flow_mutations.rs](flow_mutations.rs): Local flow mutations journal the effect in the same transaction; customer authority changes revoke existing sessions.
- [flow_text.rs](flow_text.rs): Enabled-shop-language admission for simple and graphical flow instructions, bounded text and shop-main-language fallback.
- [flows.rs](flows.rs): Durable order-event flows: conditions, shop notes and AI proposals; no unapproved model mutations.
- [gateway.rs](gateway.rs): MCP automation tools call the same tenant-bound handlers and validators as HTTP; no separate mutation semantics.
- [jobs.rs](jobs.rs): Read bounded tenant flow execution summaries without reloading rule/channel configuration on each Studio refresh.
- [line_facts.rs](line_facts.rs): Rule line facts use immutable priced lines plus current tenant product metadata; protected values override metadata.
- [metadata.rs](metadata.rs): Authorized revision-bound source facts for products, customers and orders; secrets and pricing authority are excluded.
- [mod.rs](mod.rs): Native rule conditions, coupons, durable flows and headless/storefront sales-channel boundaries.
- [pipeline.rs](pipeline.rs): A bounded acyclic flow graph models source-style true/false branches, ordered actions, delays and stop nodes.
- [pipeline_runtime.rs](pipeline_runtime.rs): Durable sequence execution records each action before dispatch, persists delay cursors and reports uncertain effects.
- [pipeline_tests.rs](pipeline_tests.rs): Flow graph and source action schema regression tests reject unsafe graphs before any event dispatch.
- [promotions.rs](promotions.rs): Server-authoritative coupons and automatic campaigns, with deterministic discounts and atomic usage limits.
- [routes.rs](routes.rs): Typed configuration CRUD, rule preview and revision-bound coupon edits.
- [rule_fields.rs](rule_fields.rs): Typed rule fields share the original comparison operators and server-derived checkout/event facts.
- [rule_match.rs](rule_match.rs): Evaluate typed rule trees against server-owned cart, customer and event facts.
- [rule_snapshot.rs](rule_snapshot.rs): Resolve only referenced tenant rule IDs with indexed batched reads; freeze active definitions and revisions into the event snapshot.
- [rule_tests.rs](rule_tests.rs): Regression cases for native rule facts and original container boundaries.
- [rules.rs](rules.rs): Bounded Shopware-style boolean/numeric rule AST. Unknown operators/conditions fail closed.

[Full source inventory](../../docs/module-inventory.md) lists every module. Listings are not a claim of complete test coverage.

Knowledge source lifecycle and approval events share `flows::EVENTS` for admission, catalogue discovery and non-order event projection. Their translated Flow Builder labels come from the knowledge vocabulary. `knowledge_workspace.py` follows real ingestion through an event-field rule into a completed durable flow.

The graphical `knowledge.extract` action reuses the current document/evidence
owner and the existing durable pipeline. Optional source/product IDs override
event defaults; quotes remain proposed and require merchant review. Current
rights and the shared daily AI budget apply before provider work.
