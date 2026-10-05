# admin/catalog

Central product editing, translations, assets, rich descriptions and product-scoped review publication. Writes carry API revisions and permission checks remain on the server.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- `ProductDataView.tsx`: server-filtered list, cursor pages and integrated product/category navigation.
- `ProductEditor.tsx`, `catalog-model.ts`: aggregate defaults, revision-bound creation/editing, language selection and unsaved-draft guards.
- `ProductPanels.tsx`, `ReferencePriceFields.tsx`, `PairFields.tsx`: names, pricing, inventory, specifications, metadata, categories and channel controls.
- `RichEditor.tsx`, `rich-conversion.ts`: safe TipTap JSON editing and legacy-content conversion.
- `ProductMediaWorkspace.tsx`, `MediaDropzone.tsx`, `media-model.ts`: cover/gallery inspector, single-language alt inheritance and drag/drop digest-published byte uploads.
- `AiImageStudio.tsx`: optional durable private image generation/edit previews with explicit revision-checked apply.
- `ProductVariants.tsx`, `RelatedProducts.tsx`: native SKU management and searchable cross-selling selection.
- `CategoriesWorkspace.tsx`: translated hierarchical category administration.
- `catalog-i18n.ts`: English, German, French and Spanish UI labels.
- `ProductAssets.tsx`, `ReviewModeration.tsx`: product-scoped assets/downloads and review moderation.
- `DocumentsManager.tsx`: knowledge-source document management, independently available through Shop knowledge.

[Feature contracts and remaining upstream gaps](../../../../docs/product-management.md).

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.

`ProductTextFields.tsx` edits nullable per-field names/descriptions.
`ProductLocalizedContent.tsx` owns main-language rich/specification/SEO inheritance;
`TaxClassSelect.tsx` loads assignable native tax classes. Product/category languages
come from shop configuration. No inherited text is fabricated on save.
