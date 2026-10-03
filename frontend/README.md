# Experience applications

The Studio, customer storefront and SaaS operator console are independent React 19/TypeScript entry modules. `src/main.tsx` mounts `application/ApplicationRouter.tsx`, which selects an application; Studio workspaces load lazily instead of shipping all management screens in the conversation bundle.

```text
src/
  application/ root routing and lazy-load recovery
  admin/       shell, assistant, dashboard, catalog, orders, customers,
               intelligence, automation, apps, settings, team,
               storyfronts, developer, environments, preview, styles
  storefront/  shell, catalog, checkout, account, analytics, styles
  platform/    operator login, shops and aggregate statistics
  shared/      api, apps, customer, content, ui, i18n, styles
```

Every feature folder has a README and every source file has a responsibility comment. The [complete module inventory](../docs/module-inventory.md) is checked in CI. The Rust module/test mapping remains in [the source map](../docs/source-map.md).

## State and boundaries

`admin/shell/useStudioController.ts` owns merchant session, workspace, staging, conversation and command state. `StudioContext` exposes that state to focused composition views, not to shared building blocks. `requests.ts` preserves the separate live and selected-environment transports. `useServerHealth.ts` checks public server availability independently of merchant login.

`storefront/shell/useStorefrontController.ts` owns shopping context and routing. `useCatalog.ts` owns debounced catalogue reads, cursors and obsolete-response rejection. `usePersonalization.ts` owns opt-in ordering and signal submission; it cannot change authoritative product prices. Product details split rendering, purchasing, reviews, questions and attachments into explicit modules.

Shared modules cannot import Studio, storefront or operator code. Applications cannot import each other's workspaces. Type-only dependencies are checked for ownership but do not count as runtime cycles. The only outside-tree source import allowed by the architecture check is the documented public `extensions/sdk/analytics.js` adapter.

Executable files and stylesheet fragments are limited to 400 lines. Translation modules have a 700-line data allowance; this does not excuse growing view/controller files. Ordered stylesheet entry imports preserve existing cascade order.

## Build and tests

```sh
npm ci
npm run format:check
npm run build
npm run architecture
npm run test:coverage
```

Unit/component tests use Testing Library and the real components/transports, with explicit synthetic HTTP fixtures and no external providers. Their coverage includes **all TS/TSX source files**, including untouched files. `npm run test:coverage:full` deliberately fails until all measured frontend statements, lines, branches and functions reach 100%; the current result must not be advertised as 100%.

See [the cross-language testing guide](../docs/testing.md) for actual PostgreSQL/AGE integration, original Shopware comparisons, Lean scope, reports and CI gates. UI integration fixtures are not proof that all products, accounts or provider configurations work in production.

Local in-place builds retain content-addressed chunks for already-open sessions. Deployment packaging should start in a fresh directory. Application and Studio workspace error boundaries offer an explicit reload if a chunk was removed by a deployment.
