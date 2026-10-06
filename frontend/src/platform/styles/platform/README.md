# platform/styles/platform

Ordered stylesheet fragments; parent imports define cascade order.

Each file starts with its responsibility. See [the source inventory](../../../../../docs/module-inventory.md) for the full map.

## Modules

- [`01-platform-console.css`](01-platform-console.css): platform: platform-console styles. Source order is preserved by the entry stylesheet.
- [`02-platform-shop-stats-span.css`](02-platform-shop-stats-span.css): platform: platform-shop-stats-span styles. Source order is preserved by the entry stylesheet.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../../docs/testing.md); file presence does not mean full test coverage.
