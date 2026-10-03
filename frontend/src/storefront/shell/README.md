# storefront/shell

Store navigation/controller, debounced catalogue and opt-in personalization.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- `CollectionView.tsx`
- `ConciergeView.tsx`
- `Storefront.tsx`
- `StorefrontContext.ts`
- `StorefrontHeader.tsx`
- `StorefrontHome.tsx`
- `useCatalog.ts`
- `usePersonalization.ts`
- `useStorefrontController.ts`

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
