# platform/styles

Ordered stylesheet fragments; parent imports define cascade order.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`platform.css`](platform.css): Ordered platform stylesheet entry; domain rules live in the adjacent folder.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
