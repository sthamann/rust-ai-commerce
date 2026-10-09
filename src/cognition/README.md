# src/cognition

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`context.rs`](context.rs): Bounded localized catalog retrieval before inference; full catalog size never expands the prompt.
- [`mod.rs`](mod.rs): Evidence-based shop memory: event receipts, observed pairs, reviewable hypotheses and bounded context.
- [`projection.rs`](projection.rs): Exactly-once local observation projection; associations retain order/event evidence and simulation labels.
- [`recommendations.rs`](recommendations.rs): Merchant-approved associations are consumed by the public shop without exposing order counts or identities.
- [`routes.rs`](routes.rs): Merchant memory endpoints and revision-bound experiment/dismissal decisions.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.

## Connected cognition owners

The [cognitive commerce guide](../../docs/cognitive-commerce.md) explains the real
source→index→agent→proposal→native consumer path and remaining audit work.

- `indexing.rs` and `generations.rs`: bounded source/model-change intake into the
  existing embedding queue; provider work happens outside SQL transactions.
- `evidence.rs`, `extraction.rs`, `claim_batches.rs`, `contracts.rs`, `signed.rs`:
  document-bound candidates, merchant review, current public compilation and
  short-lived signed native facts. SQL companions are the same evidence owner.
- `guardrails.rs` and `autonomy.rs`: native settings, currency-aware price checks
  and atomic daily budgets used by the existing proposal apply transaction.
- `tools.rs` and `stream.rs`: current authorized read-tool rounds and existing-chat
  SSE progress; writes remain proposals, not automatically dispatched mutations.
- `experiments/`: immutable native layout preregistration, consent-bound assignment
  and final live-payment/refund readout.
- `preferences.rs`: private cart-context graph, explicit advice sharing, current
  consent, export and erasure; not cross-device authenticated customer storage.

Integration verification uses `providers`, `knowledge_workspace`,
`cognitive_experiments`, `managed_search`, `users` and `tenant_isolation`; fixtures
prove native state effects, not semantic model quality or commerce uplift.

Document extraction can also run from an explicitly configured native Flow
pipeline on document ingestion/update. It uses the same extraction function,
source-language quotes, current permissions and daily tenant AI attempt quota
as HTTP/MCP; it does not publish or confirm generated statements.
