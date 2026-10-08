# admin/storyfronts

Merchant management of existing hosted Experiences and optional Storyfront app connections. Hosted mounts come from the tenant-scoped `/api/settings/frontends` registry used by onboarding. Scene generation and editing remain in the independently deployed private service.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- [`StoryfrontView.tsx`](StoryfrontView.tsx): Dedicated merchant integration surface for the independently deployed Storyfront service.
- [`storyfront-model.ts`](storyfront-model.ts): Hosted connection contract and safe passive navigation URLs.
- [`storyfront-i18n.ts`](storyfront-i18n.ts): Matching English, German, French and Spanish management messages.
- [`../styles/storyfronts.css`](../styles/storyfronts.css): Responsive connection cards using shared Studio theme tokens.

`HOSTED_FRONTEND_EDITOR_URL=https://experience.vendune.ai/design/{alias}` links each hosted mount to its existing authenticated editor. It is operator configuration, never a merchant-controlled destination or an access token. See [Experience integration](../../../../docs/experience-integration.md) for ownership and deployment details.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.

[`storyfront-management.test.tsx`](../../../tests/unit/storyfront-management.test.tsx) exercises mount discovery without an installed app, editor/storefront navigation, loading and retry, stale workspace responses, missing editor configuration and unsafe URLs. `scripts/identity_broker.py` verifies the real HTTP/PostgreSQL registry for own, foreign, anonymous and forged tenant requests.
