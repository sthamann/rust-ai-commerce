# Transactional entity history

Migration 034 records transaction-coalesced before/after aggregate snapshots in
PostgreSQL. `mod` supplies trusted transaction-local actor attribution. `routes`
implements tenant/permission-filtered paging, detail and explicit restores.
`capability` exposes the same handlers via MCP. `restore` delegates to existing
validated writes; `product` preserves current inventory while restoring content.
Credentials and cart access tokens are excluded. Orders have inspection only;
financial and delivery corrections must use normal workflow actions.

No retroactive authors/history are inferred. Coverage and limitations are in
`docs/entity-history.md`; HTTP regressions are in `scripts/crm_history.py`.
