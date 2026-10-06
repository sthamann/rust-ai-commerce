# shared/api

Typed commerce contracts, scoped transports and authenticated downloads.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- `download.ts`
- `shop-scope.ts`
- `shop-api.ts`
- `types.ts`
- `request-json.ts`: shares only simultaneous identical core reads. The complete
  shop/channel/locale/cart/customer/merchant headers are part of the key. Entries
  disappear after completion or failure; writes clear admission before and after
  execution. Custom app gateway calls and aborted requests are not shared.
- `merchant-session.ts`: privately reports authoritative merchant-authentication
  rejections to the active Studio. Customer/provider errors, login failures and
  platform-operator requests do not invalidate merchant identity.

Both Studio and storefront transports use this helper. Each caller gets a separate
parsed object, so editing one response cannot corrupt another component's state.
There is no time-based frontend cache or persisted merchant/customer response.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
