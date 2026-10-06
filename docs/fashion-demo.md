# Fashion demo: Nord Atelier

New merchant workspaces receive **Nord Atelier**, a fictional fashion collection, when demo data is requested. The standard template contains **12 parent products, 34 purchasable SKUs, seven categories, 136 product translations**, and **12 generated product photographs**. Names and descriptions are supplied in English, German, Spanish and French. Clothing uses S/M/L, sneakers use EU 38–42, and accessories use one-size options.

| Product | Demo price incl. tax |
| --- | ---: |
| Harbor Wool Coat | €249 |
| Cloud Knit | €119 |
| Daylight Poplin Shirt | €89 |
| Frame Tailored Trousers | €129 |
| Evening Midi Dress | €159 |
| Contour Blazer | €179 |
| Essential Heavy Tee | €39 |
| Raw Straight Jeans | €109 |
| Olive Midi Skirt | €99 |
| Studio Low Sneakers | €139 |
| Everyday Leather Tote | €169 |
| Soft Wool Scarf | €59 |

These products, prices, stocks, material descriptions and illustrative tax settings are synthetic demo facts. They do not represent a supplier catalog, a legal tax determination or available physical inventory. Photos are AI-generated, individually produced with the built-in image generator and visually checked. No real merchant catalog or customer data is copied. Image provenance is also stored on every demo product.

## Where the default lives

- `fixtures/fashion-catalog.json`: versioned product, variant, translation, category and brand data.
- `fixtures/fashion-artwork.json`: generation prompts, asset locations and SHA-256 checksums.
- `frontend/public/media/demo/fashion/`: 12 optimized 1000 × 1000 WebP photographs, approximately 500 KB total.
- `src/demo_catalog.rs`: tenant-scoped fixture insertion, category translations, idempotent built-in demo and fixture checks.
- `src/auth/provision.rs`: registration and additional-workspace provisioning use this template whenever `seed_catalog` is true. An empty catalog remains empty when demo data is explicitly declined.
- `src/knowledge/relations.rs`: curated styling and use-case links for the fashion set. Curated links are labeled and are not learned customer behavior.
- `scripts/fashion_demo.py`: real PostgreSQL/HTTP checks for the shipped default, translations, categories, variant checkout, cross-shop stock isolation, assets and fresh-process persistence.

`DEMO_CATALOG=fashion` is the default for new shops. `DEMO_CATALOG=legacy-furniture` remains available for explicitly selected compatibility fixtures and the existing differential suite; it is not the shipping default. Unknown template names fail instead of silently choosing an unrelated catalog.

When `SEED_DEMO` is enabled, a separate `nord-atelier` built-in demo is created once. The frontend opens this demo when no shop is selected. Existing `atelier` and `workshop` compatibility shops stay available by their explicit shop IDs. Restarting never overwrites a merchant's prices, inventory or orders. `SEED_DEMO=false` suppresses built-in demo tenants and demo customer accounts; the onboarding choice of whether to insert a demo **product** catalog is a separate explicit setting.

## Private Experience integration

The private Experience app imports the public commerce catalog through the Store API. Its demo choice inherits this same fashion template; no private Storyfront source belongs in this repository. Generated pages use the catalog's real image URLs, product IDs and sizes. Money, shipping, stock and checkout remain authoritative in Vendune. Public deployments must ship both the updated Rust service and its generated frontend assets.

## Verify

Run the registered `fashion_demo` suite in a disposable database after building the backend and frontend. It uses local services and simulated payments, never a live PSP charge or paid model call. The larger integration suite explicitly retains the previous furniture fixture for its existing price and order reference cases.
