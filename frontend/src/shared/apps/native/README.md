# Native app runtime

The `Manifest` type is the shared representation edited by App Studio and coding agents. Native view definitions contain bounded, typed text/table/cards/form blocks. No source code, HTML or external URL is evaluated.

- `types.ts`: versioned schema types shared by the designer and renderer.
- `NativeAppView.tsx`: layout, action allowlist and content-language scope.
- `NativeDataBlock.tsx`: bounded pages and authorized action requests.
- `NativeRecordForm.tsx`: typed record editing, optimistic revisions and inherited translations.

Both the private sandbox preview and released admin/storefront surfaces use this renderer. The server validates entity/action bindings, rejects public forms and authorizes every action independently. See `docs/app-studio.md` for the contract and limits.

Run the frontend build, localization, architecture and Vitest checks. Focused tests cover the shared model, renderer, lifecycle and tenant-bound preview. These tests do not establish 100% whole-codebase coverage.
