# shared/styles

Ordered stylesheet fragments; parent imports define cascade order.

Each file starts with its responsibility. See [the source inventory](../../../../docs/module-inventory.md) for the full map.

## Modules

- [`app-surfaces.css`](app-surfaces.css): app surfaces: Shared customer, app and workbench styles; application workspaces must not import each other..
- [`apps.css`](apps.css): apps: Shared customer, app and workbench styles; application workspaces must not import each other..
- [`customers.css`](customers.css): Shared light account/address workspace, responsive and keyboard-accessible.
- [`native-app.css`](native-app.css): Native app layouts share commerce design tokens; tables/forms remain bounded and responsive.
- [`workbench.css`](workbench.css): Merchant workbench uses the studio's light-blue design tokens and responsive review panels.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files. See [testing and limitations](../../../../docs/testing.md); file presence does not mean full test coverage.
