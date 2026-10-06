# storefront/analytics

Consent-aware external analytics SDK integration without customer identities.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`ShopAnalytics.tsx`](ShopAnalytics.tsx): Customer consent and real GA4 ecommerce events; absent apps produce no external script.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
