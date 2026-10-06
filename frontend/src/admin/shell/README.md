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

`useStudioAccess.ts` verifies a personal session before any protected workspace
mounts or loads data. Anonymous and initially invalid sessions use `#login`,
preserving same-origin shop/tab/entity query parameters. The storefront remains
public. Integration keys belong in the developer API tester, never in Studio's
personal login.

`StudioSignIn.tsx` renders the dedicated multilingual login page and a native
blocking dialog when an already verified session expires. The current workspace
stays mounted and inert behind the dialog: entity, staging context and drafts
remain intact. Only the same account with active membership may resume it;
leaving Studio explicitly clears the in-memory workspace by reloading the login
page. The transport suspends later operations using the expired token. No failed
mutation is replayed after login. Token renewal updates a ref behind stable
request functions, so editors and app surfaces do not remount solely because a
token changed. Permission (403), network and provider errors do not trigger an
expiry dialog. Old-token replies cannot expire a new session.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.

`useEntityNavigation.ts` owns query-backed customer/order/product navigation and back paths; shop/environment changes clear the selected entity.
