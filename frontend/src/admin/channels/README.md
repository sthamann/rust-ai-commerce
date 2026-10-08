# Sales-channel workspace

- `SalesChannelsWorkspace`: separate navigation and native channel cards; independent SaaS workspace creation stays in Team & access.
- `ChannelEditor`: three-step creation, shared single-language editing, revision-aware changes, activation confirmation and history.
- `ChannelProducts`: bounded server-side search, selected product chips, no opaque comma-separated IDs.
- `ChannelSettings`: embeds existing company and checkout editors with an initial channel scope. Unchanged values inherit the shared basis; protected dependencies and stale revisions still run through the existing API.
- `channel-model`: existing API shape and encoded storefront preview URLs.
- `channel-i18n`: complete EN/DE/FR/ES interface vocabulary; content languages come from the shop.

Sales channels share a tenant's catalog, customer data and team. They are not an isolation boundary. Unrelated SaaS merchants must use separate workspaces. Deactivation preserves historical orders; the main channel is protected from deletion. Unused additional channels can be deleted through the shared dependency confirmation; used channels must be deactivated. Storefront domains are configured by hosting; this wizard produces channel-specific preview links, not DNS records.

Verification: `sales-channel-workspace.test.tsx`, `settings_scopes`, `marketing_accounts`, `catalog_management`, `tenant_isolation` and the source/localization gates.

`ChannelActions` owns confirmed pause/resume, shared dependency deletion and personal preview handoff. The main channel may be paused or made private; only deletion/type/language inheritance remain protected. `ChannelConnections` displays and revision-edits the existing frontend alias registry, preserves canonical Experience identity and links to its existing editor. `ChannelCatalog` owns extracted language/catalog controls. New copy lives in `channel-i18n` and `connection-i18n` with four-language translation export.

See [channel access and integration limits](../../../../docs/channel-management.md). `channel-management.test.tsx` and the registered real HTTP `channel_management` suite exercise these paths.
