# admin/catalog

Central product editing, translations, assets, rich descriptions and product-scoped review publication. Writes carry API revisions and permission checks remain on the server.

Files and their individual responsibilities are listed in [the generated source inventory](../../../../docs/module-inventory.md). Each file starts with its contract summary.

## Modules

- [`AiImageStudio.tsx`](AiImageStudio.tsx): Optional image-provider jobs create private previews; applying a reviewed image is explicit and revision checked.
- [`CategoriesWorkspace.tsx`](CategoriesWorkspace.tsx): Localized category tree editor; parent moves and revisions are validated in the API.
- [`CategoryFactQuery.tsx`](CategoryFactQuery.tsx): Single-language saved fact predicate in the existing category revision, source and staging path; browsing calls no model.
- [`EditorBuffer.ts`](../../shared/content/editor/EditorBuffer.ts): Unsaved Markdown source participates in the aggregate's save/navigation guard without becoming product content.
- [`MarkdownSource.tsx`](../../shared/content/editor/MarkdownSource.tsx): Live Markdown buffer updates the same structured product document; no raw HTML is rendered or persisted.
- [`MediaDropzone.tsx`](MediaDropzone.tsx): Accessible multi-file upload with drag/drop, visible progress and the same validated asset API as attachments.
- [`PairFields.tsx`](PairFields.tsx): Accessible key/value rows for product properties, specifications and variant options.
- [`ProductAssets.tsx`](ProductAssets.tsx): Bounded upload and explicit digest-bound publication of attachments and paid files.
- [`ProductDataView.tsx`](ProductDataView.tsx): Central catalog workspace: server-filtered cursor list, product details and hierarchical categories.
- [`ProductEditor.tsx`](ProductEditor.tsx): Revision-aware product aggregate editor: one save, translation tabs and product-scoped linked capabilities.
- [`ProductEditorNav.tsx`](ProductEditorNav.tsx): Core product tabs and installed app submenus share one accessible navigation.
- [`ProductLocalizedContent.tsx`](ProductLocalizedContent.tsx): Consistent main-language inheritance for product rich documents, specification groups and individual SEO fields.
- [`ProductMediaWorkspace.tsx`](ProductMediaWorkspace.tsx): One product-media workspace: cover, ordered gallery, multilingual image metadata, drag/drop and optional reviewed AI drafts.
- [`ProductPanels.tsx`](ProductPanels.tsx): Native commerce, media, translated SEO/specifications and category panels for one editable product.
- [`ProductTextFields.tsx`](ProductTextFields.tsx): Product text uses the shared single-language editor and field inheritance; product number stays language independent.
- [`ProductVariants.tsx`](ProductVariants.tsx): Native variant family browser with cursor pagination, explicit editing and a bounded creation wizard.
- [`ReferencePriceFields.tsx`](ReferencePriceFields.tsx): Native reference-unit inputs feed the same server-calculated unit price displayed on product pages.
- [`RelatedProducts.tsx`](RelatedProducts.tsx): Search-backed related-product selection, avoiding comma-separated opaque IDs.
- [`ReviewModeration.tsx`](ReviewModeration.tsx): Product-scoped review publication; authoritative authorization stays in the API.
- [`RichEditor.tsx`](../../shared/content/editor/RichEditor.tsx): Actual Tiptap WYSIWYG editor with structured safe content, media, formatting and per-language drafts.
- [`TaxClassSelect.tsx`](TaxClassSelect.tsx): Assign a product to an actual tenant tax class; legacy standard/reduced mapping remains explicit.
- [`VariantGenerator.tsx`](VariantGenerator.tsx): Reviewable, bounded batch creation uses saved parent data and keeps successful rows on partial failure.
- [`catalog-i18n.ts`](../../shared/i18n/catalog-i18n.ts): Complete four-language catalog workspace vocabulary, separate from commerce data translations.
- [`catalog-model.ts`](catalog-model.ts): Editable native product aggregate and defaults shared by creation, detail and variant workflows.
- [`editor-document.ts`](../../shared/content/editor/editor-document.ts): Canonical transport drops editor-only null attributes; description headings remain within the native H2/H3 contract.
- [`editor-i18n.ts`](../../shared/content/editor/editor-i18n.ts): Four-language controls for visual/Markdown editing without changing content-language inheritance.
- [`markdown-content.ts`](../../shared/content/editor/markdown-content.ts): Markdown admission shares the public rich-document node/URL boundary; rich-only features never silently disappear.
- [`media-model.ts`](media-model.ts): Pure gallery operations preserve order, explicit alt translations and upload bounds without fabricating language values.
- [`rich-conversion.ts`](../../shared/content/editor/rich-conversion.ts): Lossless import of legacy blocks into structured WYSIWYG content, preserving inline emphasis.
- [`variant-family.ts`](variant-family.ts): Cursor-based family lookup for duplicate review, bounded independently of the 50-row creation limit.
- [`variant-i18n.ts`](variant-i18n.ts): Guided variant creation and editing vocabulary; content still follows shop language inheritance.
- [`variant-model.ts`](variant-model.ts): Bounded option combinations and metadata-free child payloads shared by the guided variant creator.

## Verification

Run `npm run build`, `npm test`, `npm run test:coverage` and `npm run architecture` from `frontend/`. Coverage includes untested source files; a module in this folder is not automatically fully tested. See the root [testing guide](../../../../docs/testing.md) for backend integration and coverage limits.

`ProductTextFields.tsx` edits nullable per-field names/descriptions.
`ProductLocalizedContent.tsx` owns main-language rich/specification/SEO inheritance;
`TaxClassSelect.tsx` loads assignable native tax classes. Product/category languages
come from shop configuration. No inherited text is fabricated on save.

`ProductEditorNav.tsx` joins core editor sections with registered, authorized app-owned product tabs. General settings render registered contextual sections; no arbitrary app code executes in the core renderer.

`MarkdownSource`, `markdown-content` and `EditorBuffer` implement an explicit, guarded Markdown source buffer over the same safe TipTap document. `variant-model`, `variant-family` and `VariantGenerator` provide bounded combination review, current-SKU defaults, existing-family lookup and partial-failure retry. `ProductVariants` handles family cursor pagination and child option editing. Tests: `studio-product-upgrades.test.tsx` plus the real `catalog_management` suite.
