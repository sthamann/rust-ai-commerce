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
- `StudioSidebar.tsx`: permission-filtered navigation in Intelligence, Commerce, Experiences and Workspace groups, with independent scrolling.
- `navigation.ts`
- `requests.ts`
- `studio-types.ts`
- `useServerHealth.ts`
- `useStudioController.ts`
- `useStudioSession.ts`: validates visible connected sessions once per minute and
  on focus/visibility restoration. It deduplicates checks, releases listeners and
  timers on unmount, and ignores failures belonging to an older login token.

An authoritative session rejection clears the active Studio token, permissions,
overview, conversations and messages together. It presents a translated sign-in
action instead of retaining an apparently connected overview beside failing
editors. The server's expiry and tenant/permission checks remain unchanged.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.

`useEntityNavigation.ts` owns query-backed customer/order/product navigation and back paths; shop/environment changes clear the selected entity.
