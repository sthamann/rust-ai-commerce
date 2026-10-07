# storefront/shell

Store navigation/controller, debounced catalogue and opt-in personalization.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`CatalogNavigation.tsx`](CatalogNavigation.tsx): Public category navigation uses the same tenant/channel tree as the listing API, with translated names.
- [`CollectionView.tsx`](CollectionView.tsx): CollectionView: storefront view composed from the scoped cart/controller.
- [`CompanyLegalPage.tsx`](CompanyLegalPage.tsx): Directly reachable channel legal page; renders only the server's explicit public projection as text.
- [`ConciergeView.tsx`](ConciergeView.tsx): ConciergeView: storefront view composed from the scoped cart/controller.
- [`Storefront.tsx`](Storefront.tsx): Storefront composition root: cart context, routes, customer account and checkout.
- [`StorefrontContext.ts`](StorefrontContext.ts): Local storefront context, scoped to the mounted tenant and sales channel.
- [`StorefrontHeader.tsx`](StorefrontHeader.tsx): StorefrontHeader: storefront view composed from the scoped cart/controller.
- [`StorefrontHome.tsx`](StorefrontHome.tsx): StorefrontHome: storefront view composed from the scoped cart/controller.
- [`StorefrontLanguage.tsx`](StorefrontLanguage.tsx): Shop-configured content languages, including custom locales; the interface keeps its supported language vocabulary.
- [`useCatalog.ts`](useCatalog.ts): Cursor catalogue loading, debounced filters and stale-response protection.
- [`useCompanyIdentity.ts`](useCompanyIdentity.ts): Channel-scoped public brand/legal identity; stale responses cannot leak across tenants or languages.
- [`usePersonalization.ts`](usePersonalization.ts): Opt-in behavior signals and stable product ordering; no authoritative prices are changed.
- [`useStorefrontController.ts`](useStorefrontController.ts): Cart lifecycle, authoritative checkout commands and storefront coordination.

`useStorefrontAnchors.ts` restores section scrolling after SPA rendering, with reduced-motion support. `ConciergeView` starters prepare an editable question and reuse the existing cart-scoped recommendation API only on explicit submission.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.

`useCompanyIdentity` loads the channel/language-scoped public projection. Header/footer display the effective brand/logo; `CompanyLegalPage` is reachable at `#legal`. Private banking and domestic tax fields never enter this projection.

`useConsentedExperience` assigns experiments after affirmative consent and resets the displayed variant on withdrawal.
