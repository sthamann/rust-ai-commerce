# storefront/styles/shop

Ordered stylesheet fragments; parent imports define cascade order.

Each file starts with its responsibility. See [the source inventory](../../../../../docs/module-inventory.md) for the full map.

## Modules

- [`01--root.css`](01--root.css): shop: -root styles. Source order is preserved by the entry stylesheet.
- [`02-shop-product-image.css`](02-shop-product-image.css): shop: shop-product-image styles. Source order is preserved by the entry stylesheet.
- [`03-availability-span.css`](03-availability-span.css): shop: availability-span styles. Source order is preserved by the entry stylesheet.
- [`04-shop-stepper.css`](04-shop-stepper.css): shop: shop-stepper styles. Source order is preserved by the entry stylesheet.
- [`05-shop-grid-comparison.css`](05-shop-grid-comparison.css): shop: shop-grid-comparison styles. Source order is preserved by the entry stylesheet.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../../docs/testing.md); file presence does not mean full test coverage.
