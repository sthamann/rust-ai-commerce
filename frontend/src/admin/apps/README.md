# admin/apps

Installed app directory/details, entity editor and isolated service settings for payment, connectors and transactional email.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- [`AppArtwork.tsx`](AppArtwork.tsx): Passive app artwork with independent failed-image fallbacks and deterministic local category covers.
- [`AppDetails.tsx`](AppDetails.tsx): AppDetails: Installed app details, activation, version, data and isolated interface.
- [`AppEntity.tsx`](AppEntity.tsx): Managed entity editor renders fields from the installed app contract.
- [`AppInterfaces.tsx`](AppInterfaces.tsx): Open registered native/isolated admin surfaces through the existing permission-filtered registry.
- [`AppLibrary.tsx`](AppLibrary.tsx): Searchable installed/discovery app cards with category/status filters and real lifecycle actions.
- [`AppsManager.tsx`](AppsManager.tsx): Installed package workspace: lifecycle, generated entities and shared agent actions.
- [`ConnectorPanel.tsx`](ConnectorPanel.tsx): Native app workspace: OAuth, provider settings, durable jobs and private sources.
- [`EmailPanel.tsx`](EmailPanel.tsx): Native email app settings, localized templates, safe previews and durable delivery receipts.
- [`EmailProviderFields.tsx`](EmailProviderFields.tsx): EmailProviderFields: focused connector-settings view with explicit typed inputs and callbacks.
- [`PaymentManager.tsx`](PaymentManager.tsx): Payment ledger, adapter readiness and explicit refund approval.
- [`app-types.ts`](app-types.ts): Installed package metadata used by app administration views.
- [`email-languages.ts`](email-languages.ts): Supported transactional email template languages.
- [`library-model.ts`](library-model.ts): Shared app discovery metadata, safe artwork sources and localized search independent of rendering.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
