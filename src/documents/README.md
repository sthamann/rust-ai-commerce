# src/documents

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`content.rs`](content.rs): Validate enabled-language source content and rebuild hash-bound chunks without inherited fabricated translations.
- [`ingestion.rs`](ingestion.rs): Typed API and bounded upload write source hashes, chunks and graph relations atomically.
- [`lifecycle.rs`](lifecycle.rs): Revision-bound source detail, editing, archive/restore and publication; edits require a new public review.
- [`mod.rs`](mod.rs): Source-bound knowledge ingestion, retrieval and product questions share tenant/product visibility.
- [`parser.rs`](parser.rs): PDF extraction executes in a killable child process without inherited commerce credentials.
- [`preview.rs`](preview.rs): No-provider retrieval preview shares product-question scope and locale rules; merchant sources never enter customer previews.
- [`product_knowledge.rs`](product_knowledge.rs): Product-centred canonical facts and tenant-filtered graph evidence, independent of the overview's truncated sample.
- [`questions.rs`](questions.rs): Product-specific read-only advice with authoritative price/specification snapshot and validated source citations.
- [`retrieval.rs`](retrieval.rs): Bounded lexical/vector source retrieval; public questions use only explicitly published documents.
- [`tools.rs`](tools.rs): Knowledge workspace/source MCP tools delegate to the same authorized HTTP operations and schemas.
- [`workspace.rs`](workspace.rs): Permission-filtered knowledge census, cursor source inventory and activity; totals never masquerade as sampled graph counts.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
