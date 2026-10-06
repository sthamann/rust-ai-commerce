# shared/api

Typed commerce contracts, scoped transports and authenticated downloads.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`download.ts`](download.ts): Authenticated binary download, never placing session credentials in a URL.
- [`merchant-session.ts`](merchant-session.ts): Private merchant-session rejection signals shared by all JSON transports.
- [`request-json.ts`](request-json.ts): Coalesce simultaneous identical core reads with complete identity; no persisted response cache.
- [`shop-api.ts`](shop-api.ts): shop api: Typed commerce contracts, merchant/store transports and binary download helper.
- [`shop-scope.ts`](shop-scope.ts): Canonical browser shop scope for storefront URLs and tenant-isolated customer storage.
- [`types.ts`](types.ts): Common JSON/multipart request contract for app surfaces and merchant operations.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
