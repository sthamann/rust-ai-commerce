# platform

Operator login, shop provisioning/directory and cross-shop metrics, with a separate operator transport.

Files and their individual responsibilities are listed in [the generated source inventory](../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `PlatformConsole.tsx`
- `PlatformDashboard.tsx`
- `PlatformLanguage.tsx`
- `PlatformShops.tsx`
- `PlatformSignIn.tsx`
- `platform-api.ts`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../docs/testing.md) for backend integration and coverage limits.
