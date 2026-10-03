# src/documents

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`ingestion.rs](ingestion.rs): Typed API and bounded upload write source hashes, chunks and graph relations atomically.
- [`mod.rs](mod.rs): Source-bound knowledge ingestion, retrieval and product questions share tenant/product visibility.
- [`parser.rs](parser.rs): PDF extraction executes in a killable child process without inherited commerce credentials.
- [`questions.rs](questions.rs): Product-specific read-only advice with authoritative price/specification snapshot and validated source citations.
- [`retrieval.rs](retrieval.rs): Bounded lexical/vector source retrieval; public questions use only explicitly published documents.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
