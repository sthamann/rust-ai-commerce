# platform

Operator login, shop provisioning/directory and cross-shop metrics, with a separate operator transport.

Files and their individual responsibilities are listed in [the generated source inventory](../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- [`PlatformConsole.tsx`](PlatformConsole.tsx): Independent platform control plane: personal operator access, bounded statistics and audited shop creation.
- [`PlatformDashboard.tsx`](PlatformDashboard.tsx): Aggregate statistics from PostgreSQL; recorded orders and confirmed money remain visibly separate.
- [`PlatformLanguage.tsx`](PlatformLanguage.tsx): Locale selector shared by operator sign-in and the workspace.
- [`PlatformShops.tsx`](PlatformShops.tsx): Searchable shop directory and server-validated provisioning form.
- [`PlatformSignIn.tsx`](PlatformSignIn.tsx): Personal sign-in verifies the current operator grant before retaining a browser session.
- [`platform-api.ts`](platform-api.ts): Tenant-independent operator API; credentials stay in the current browser session.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../docs/testing.md) for backend integration and coverage limits.
