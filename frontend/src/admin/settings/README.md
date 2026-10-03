# admin/settings

Shared issuer/master data plus tax, country, shipping and payment settings under one workspace.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `CommerceSettings.tsx`
- `MasterDataSettings.tsx`
- `SettingsWorkspace.tsx`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
