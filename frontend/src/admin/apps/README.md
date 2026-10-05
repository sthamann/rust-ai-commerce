# admin/apps

Installed app directory/details, entity editor and isolated service settings for payment, connectors and transactional email.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `AppLibrary.tsx` — installed/discover search, filters and actionable cards
- `AppArtwork.tsx` — provided assets, independent fallbacks and generated vector covers
- `AppInterfaces.tsx` — permission-filtered registered native/external admin surfaces
- `library-model.ts` — builtin catalog, categories and localized content resolution
- `AppDetails.tsx`
- `AppEntity.tsx`
- `AppsManager.tsx`
- `ConnectorPanel.tsx`
- `EmailPanel.tsx`
- `EmailProviderFields.tsx`
- `PaymentManager.tsx`
- `app-types.ts`
- `email-languages.ts`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
