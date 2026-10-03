# admin/shell

Studio layout, session/workspace controller, authenticated transport and lazy workspace navigation. The controller owns state; views consume the scoped context. Live-only account/developer calls stay separate from staging calls.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `Merchant.tsx`
- `StudioComposer.tsx`
- `StudioContext.ts`
- `StudioConversation.tsx`
- `StudioHeader.tsx`
- `StudioRoutes.tsx`
- `StudioSidebar.tsx`
- `navigation.ts`
- `requests.ts`
- `studio-types.ts`
- `useServerHealth.ts`
- `useStudioController.ts`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
