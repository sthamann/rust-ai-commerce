# src/developer

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`builds.rs](builds.rs): Immutable development versions are validated before storage; installation targets only private environments.
- [`generation.rs](generation.rs): Structured provider output becomes a reviewable immutable manifest; it cannot write files or call shell tools.
- [`mod.rs](mod.rs): Prompt-generated declarative apps and native coding-agent handoff, never unsandboxed model code.
- [`routes.rs](routes.rs): Developer HTTP transport and coding-agent task export; explicit staging precedes live release.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.

Generation keeps existing same-identity action access settings; new synthesized native actions default to MCP off. Task exports include the editor reference, choice, automation and scope contracts documented in [guided apps](../../docs/app-assistants.md).
