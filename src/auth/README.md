# src/auth

This folder owns the Rust modules listed below. Each source begins with its responsibility contract. The crate currently shares internal types/imports through a facade; APIs, MCP and UCP delegate to shared domain operations.

- [`credentials.rs](credentials.rs): Argon2 password operations run off the asynchronous request executor.
- [`integrations.rs](integrations.rs): Expiring API/MCP keys are bounded to one workspace and intersect their creator's current membership.
- [`invitations.rs](invitations.rs): Single-use, expiring invitations. Acceptance verifies an existing account password.
- [`members.rs](members.rs): Workspace member visibility and immediately effective role/revocation changes.
- [`middleware.rs](middleware.rs): Resolve sessions from PostgreSQL on every request: role changes/revocation work across replicas.
- [`mod.rs](mod.rs): Personal merchant accounts, tenant memberships, scoped sessions and role enforcement.
- [`permissions.rs](permissions.rs): Fine-grained workspace overrides. Owners retain control; delegates cannot grant rights they lack.
- [`provision.rs](provision.rs): Reusable synthetic shop provisioning for initial signup and additional shops owned by the same merchant.
- [`registration.rs](registration.rs): Create an isolated merchant workspace from synthetic template data.
- [`sessions.rs](sessions.rs): Login/logout and personal workspace discovery. Only hashed opaque tokens persist.

The [source inventory](../../docs/module-inventory.md) is checked in CI. [The behavioral map](../../docs/source-map.md) identifies integration suites, and [testing](../../docs/testing.md) describes actual coverage and limits. Every file is limited to 320 lines; `main.rs` to 120.
