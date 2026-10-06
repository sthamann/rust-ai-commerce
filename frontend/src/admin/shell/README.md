# admin/shell

Studio layout, session/workspace controller, authenticated transport and lazy workspace navigation. The controller owns state; views consume the scoped context. Live-only account/developer calls stay separate from staging calls.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Session lifecycle

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

## Modules

- [`Merchant.tsx`](Merchant.tsx): Studio composition root: layout, scoped controller and modular workspace views.
- [`StudioComposer.tsx`](StudioComposer.tsx): StudioComposer: focused Studio view; state and commands come from the session-scoped controller.
- [`StudioContext.ts`](StudioContext.ts): Typed, local Studio context; never shared across a different mounted Studio.
- [`StudioConversation.tsx`](StudioConversation.tsx): StudioConversation: focused Studio view; state and commands come from the session-scoped controller.
- [`StudioHeader.tsx`](StudioHeader.tsx): StudioHeader: focused Studio view; state and commands come from the session-scoped controller.
- [`StudioRoutes.tsx`](StudioRoutes.tsx): StudioRoutes: focused Studio view; state and commands come from the session-scoped controller.
- [`StudioSidebar.tsx`](StudioSidebar.tsx): StudioSidebar: focused Studio view; state and commands come from the session-scoped controller.
- [`StudioSignIn.tsx`](StudioSignIn.tsx): Dedicated login page and blocking reauthentication dialog preserve mounted private editors.
- [`navigation.ts`](navigation.ts): Typed built-in Studio navigation and locale-specific labels.
- [`requests.ts`](requests.ts): Authenticated Studio transport; staging changes only the tenant, never the principal.
- [`studio-types.ts`](studio-types.ts): studio types: Studio layout, session/workspace controller, authenticated transport and lazy workspace navigation.
- [`useEntityNavigation.ts`](useEntityNavigation.ts): Linked entity navigation keeps native editors, browser deep links and back paths in the same tenant scope.
- [`useServerHealth.ts`](useServerHealth.ts): Public server health is independent of the personal Studio session.
- [`useStudioAccess.ts`](useStudioAccess.ts): Central Studio identity boundary: initial login, expiry suspension and same-account resume.
- [`useStudioController.ts`](useStudioController.ts): Studio session/controller: authentication context, tenant/staging state and chat commands.
- [`useStudioSession.ts`](useStudioSession.ts): Revalidate visible Studio sessions and route authenticated failures to the active controller.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.

`useEntityNavigation.ts` owns query-backed customer/order/product navigation and back paths; shop/environment changes clear the selected entity.
