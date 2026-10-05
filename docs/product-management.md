# Product management and category navigation

Vendune Studio now owns one **Products** workspace. The **Products** tab provides a server-filtered, cursor-paginated list; **Categories** provides the translated category tree. Select a product to edit the complete native aggregate, or choose **Create product**. A new product starts inactive. Set its number, name, price, stock and assignments, then save. Activation makes it available through the same Store API consumed by the storefront.

The interface and content editor support English, German, French and Spanish. Change **Content language** to edit the corresponding name, short description, rich description, specifications and SEO fields. Empty translated names initially use the entered name as a fallback; this is not an AI translation. Existing rich descriptions remain language-specific. Changing the Studio interface language keeps the selected product, content language and unsaved draft open; switching shops or environments starts a separate scoped workspace.

## Product detail workspace

- **General:** name, unique shop-local product number, short description, visual rich description, manufacturer identity, manufacturer number, EAN/GTIN, digital product and free-shipping flags.
- **Prices & stock:** gross base price, tax rate, stock, quantity minimum/steps/maximum, delivery days, list/regulation price, reference units and rule-bound discount tiers.
- **Media:** ordered gallery, cover image, external HTTPS image URLs and actual PNG/JPEG/WebP uploads for saved products. Uploaded bytes start private and the gallery action explicitly publishes the selected digest.
- **Variants:** list native child SKUs; create a child with its own number, option values, prices and stock; open its independent editor. This does not generate Cartesian variant combinations.
- **Categories & channels:** multiple category assignments and per-product sales-channel visibility. Existing channel-level explicit product lists can restrict this further; an empty channel-level list means the whole catalog. With no custom channels, the default storefront is controlled by product activation.
- **Specifications:** translated specifications, generic product properties and native automation metadata including dimensions/weight.
- **SEO:** translated title, description and slug metadata. This does not implement complete original Shopware SEO URL generation.
- **Cross-selling:** search and select products from this tenant.
- **Attachments & downloads / Reviews:** existing product-scoped asset publication, digital entitlement and review moderation capabilities inside the same workspace.

The TipTap editor writes a bounded JSON document, not arbitrary HTML. Supported formatting includes bold, italic, underline, headings, lists, links, images, video and undo/redo. Server admission validates document node types, marks, attributes, URL schemes, depth and size; the public React renderer uses explicit safe elements. Unsupported pasted HTML cannot become executable product content.

One product save atomically writes translations, priced fields, metadata, categories, channel overrides, knowledge-graph synchronization and a `product.created` or `product.updated` outbox event. Revision conflicts retain the browser draft and require a deliberate reload/review. Creation and updates share this operation with MCP. Durable flows can subscribe to the committed product events.

## Categories: source-faithful bounded port

Reference: Shopware **6.7.14.2**, commit [`29535190246fcaf0b091d7bdf02dd16358c943c4`](https://github.com/shopware/shopware/blob/29535190246fcaf0b091d7bdf02dd16358c943c4/src/Core/Content/Category/CategoryDefinition.php), and the official [category guide](https://docs.shopware.com/en/shopware-6-en/catalogues/categories) / [product guide](https://docs.shopware.com/en/shopware-6-en/catalogues/products).

| Shopware behavior | Native implementation | Exact scope |
|---|---|---|
| Parent/child category tree, position, translations | `categories/admin.rs`; migration 026; `CategoriesWorkspace.tsx` | Four languages, revision checks, same-tenant parent FK, ancestor/cycle validation and shop-local edit lock |
| Page / folder / external-link category types | Category data and public navigation renderer | `page`, `folder`, HTTPS `link`; legacy `structuring` remains readable |
| Multiple product-category associations | `product_categories`; `categories::assignments` | Tenant-bound many-to-many links, at most 100 assignments per product |
| Parent listing includes descendant assignments | `categories/listing.sql` | Active subtree, enabled by default; `displayNestedProducts=false` limits the listing to direct assignments |
| Active and visible are different | `categories/navigation.rs` | Inactive branches are inaccessible; invisible branches disappear from navigation but active category listings remain directly addressable |
| Sales-channel navigation root | `marketing/channels.rs`, `categories/navigation.rs`, channel settings form | Independent `navigationCategoryId` per storefront/headless channel; default root is `catalog-root` |
| Storefront navigation and category listing | `/store-api/navigation`, `/store-api/product` with `categoryId`; `CatalogNavigation.tsx` | Localized tree and real product filtering before pagination; no hard-coded category names |
| Catalog content staging | `staging/categories.rs`, `clone.rs`, `release.rs` | Category and product units can publish selectively in one transaction; dependency order, staged digest and live baseline checks; live stock stays live-owned |

This is a behavioral port to native APIs and storage, not original DAL/UUID/wire-schema compatibility. Missing upstream features include product streams/dynamic product groups, complete CMS category layouts, breadcrumbs/deep category routes, service/footer navigation roots, arbitrary language/currency context, manufacturer/property-group entities, Cartesian variant generation, full inheritance masks, bulk import/export and deletion workflows. Automatic authenticated image previews inside private staging editors are not yet implemented; private source URLs do not become publicly accessible. Category navigation is deliberately bounded to 2,000 nodes per channel; large product catalogs remain cursor-paginated and are not loaded into the browser.

## APIs and MCP

| Operation | HTTP | MCP tool |
|---|---|---|
| Search/filter products | `GET /api/merchant/products?search=...&active=true&categoryId=...&lowStock=true&limit=25&after=...` | `merchant.products` |
| Read one editor aggregate | `GET /api/merchant/products/{id}` | `merchant.product.content` |
| Create | `POST /api/merchant/products` | `merchant.product.create` (`product` object) |
| Update | `PUT /api/merchant/products/{id}` | `merchant.product.save` (`id`, `product`) |
| List category tree | `GET /api/merchant/categories` | `merchant.categories` |
| Create/update category | `POST /api/merchant/categories`; `PUT /api/merchant/categories/{id}` | `merchant.category.create`; `merchant.category.save` |
| Public tree/listing | `POST /store-api/navigation`; `POST /store-api/product` with `{ "categoryId": "..." }` | Public Store API |

Reads require `catalog.read`; writes require `catalog.write`. Native product queries accept limits 1–100 (Studio uses 25), filter before limiting and return `nextCursor`; there is no expensive whole-catalog total. Category search/stock/status filters are server-side. Product numbers have a tenant-specific unique index; translated name/product-number search uses trigram indexes. Asset `?shop=` scope allows ordinary image requests to identify their tenant without authentication headers; private environments still require authorized access. The header tenant wins if explicitly supplied.

## Verification and boundaries

`python3 scripts/catalog_management.py` creates isolated synthetic tenants and runs actual HTTP/PostgreSQL/MCP/worker tests: creation, translations, formatting, duplicate numbers, cursor pages, active/channel admission, parent-category listings, nested listing control, hidden ancestry, cycles, tenant isolation, unsafe document rejection, uploaded byte delivery, event consumption and selective release of new products/categories. Existing commerce, account/marketing, merchant operations, protocol and scalability suites cover shared consumers. `frontend/tests/unit/catalog-management.test.tsx` exercises the actual list/editor, save conflicts and safe rich renderer; the browser check creates and reloads a real synthetic product.

These tests are regressions, not 100% coverage or complete Shopware equivalence. New SQL, asynchronous adapters and editor code are recorded as unproved in the formal manifest; the existing extracted Lean policy contracts remain unchanged.

New product pages without uploaded media render an explicit translated empty-image
state, rather than a broken image or a fictitious product photo. Public detail and
purchase views display the merchant's product number; the internal product ID
continues to identify carts, associations and API routes.
