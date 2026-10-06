# admin/styles

Studio visual system and merchant operational layouts. Entry imports preserve cascade order.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- [`api-console.css`](api-console.css): Responsive developer key management and bounded API explorer using Studio theme tokens.
- [`app-artwork.css`](app-artwork.css): Category cover and app icon artwork, with local deterministic fallbacks.
- [`app-assistant.css`](app-assistant.css): Guided extension workspace: restrained colour, clear choices and responsive setup.
- [`app-catalog.css`](app-catalog.css): App library/detail presentation: bounded cards, passive artwork, accessible filters and theme-aware forms.
- [`app-detail.css`](app-detail.css): Scoped app detail hierarchy, permission disclosure, data and integration forms.
- [`app-studio-inspector.css`](app-studio-inspector.css): App Studio binding indicators, empty canvas and properties inspector.
- [`app-studio-panels.css`](app-studio-panels.css): App Studio model, connection, agent and version panels.
- [`app-studio-responsive.css`](app-studio-responsive.css): Responsive App Studio layouts and reduced-motion settings.
- [`app-studio.css`](app-studio.css): App Studio: restrained light canvas, compact control density and responsive palette/inspector workspaces.
- [`automation-lifecycle.css`](automation-lifecycle.css): Configuration workspace: readable definitions, clear selection and contextual actions.
- [`automation.css`](automation.css): Actual graph nodes and original rule forms use the Studio theme and independent responsive columns.
- [`catalog-editor.css`](catalog-editor.css): Visual editor and category workspace responsive styles.
- [`catalog.css`](catalog.css): Light, precise catalog workspace with accessible tables, focused detail panels and visual authoring.
- [`commerce-manager.css`](commerce-manager.css): commerce manager: Studio visual system and merchant operational layouts.
- [`company-settings.css`](company-settings.css): Company editor: structured addresses, visible scope inheritance and compact upload controls.
- [`forms.css`](forms.css): Studio-owned form primitives load at the composition root, independent of lazy workspace history.
- [`international-details.css`](international-details.css): Destination rates, translation jobs and responsive international workbench layout.
- [`international.css`](international.css): International commerce workbench: compact master/detail records, calm colour and clear field hierarchy.
- [`knowledge-evidence.css`](knowledge-evidence.css): Product evidence, retrieval excerpts, observed pairs and responsive knowledge layouts.
- [`knowledge-sources.css`](knowledge-sources.css): Knowledge source library/editor layouts: single-language forms and lifecycle controls.
- [`knowledge.css`](knowledge.css): Unified knowledge workspace: evidence-first hierarchy, accessible cards and theme-aware responsive layouts.
- [`markdown-editor.css`](markdown-editor.css): Shared visual/Markdown product editor treatment using existing Studio theme tokens.
- [`media-workspace.css`](media-workspace.css): Gallery workspace: airy tiles, focused image inspector and accessible upload surfaces using Studio theme tokens.
- [`operations.css`](operations.css): Operational screens share the studio's light surface and clear focus states.
- [`sales-channels.css`](sales-channels.css): Sales-channel cards, onboarding and scoped settings use the same responsive, accessible Studio design.
- [`settings.css`](settings.css): Independent settings navigation, grouped native forms and save feedback in Studio theme tokens.
- [`studio-sign-in.css`](studio-sign-in.css): Dedicated access surface: responsive Vendune login and native modal reauthentication.
- [`studio.css`](studio.css): Ordered studio stylesheet entry; domain rules live in the adjacent folder.
- [`variants.css`](variants.css): Variant family and review table share the catalog's responsive theme and focus treatment.
- [`workspace-polish.css`](workspace-polish.css): Consistent Studio density, readable hierarchy and independently scrollable navigation across workspaces.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.
