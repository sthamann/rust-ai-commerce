# src/platform

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`auth.rs`](auth.rs): Independent platform authorization: live personal sessions, current grants, no integration/bootstrap escalation.
- [`bootstrap.rs`](bootstrap.rs): Offline first-operator setup: migration-only process, supplied strong credentials, password proof for existing accounts.
- [`metrics.rs`](metrics.rs): Aggregate-only control-plane reads: real tenants, bounded pages, explicit currencies and simulated/confirmed amounts.
- [`mod.rs`](mod.rs): Global SaaS control plane: operator-only aggregate statistics and audited shop provisioning.
- [`provision.rs`](provision.rs): Operator shop creation commits ownership, settings and audit atomically; never issues another user's credentials.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.

## Control plane

- `ai.rs`: revisioned global defaults and encrypted, write-only provider keys. Authenticated operator access is independent of merchant membership.
- `lifecycle.rs`: reversible active/paused/archived state and request fence; reconciliation remains available.
- `shop_detail.rs`: bounded business/team/channel dossier and diagnostic traffic.
- `infrastructure.rs`: database/Qdrant probes, pool/cache/queue and fleet HTTP diagnostics.
- `resources.rs`: Linux cgroup v2 CPU/memory; unavailable readings are null, never invented.

New background work is deferred while paused/archived. In-flight work can finish. Restore resumes queued jobs; trash does not physically delete commerce records.
