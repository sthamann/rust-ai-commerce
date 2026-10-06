# Vendune identity and compatibility

**Product:** Vendune. **Merchant workspace:** Vendune Studio.
**Operator console:** Vendune Platform.
**Canonical repository:** https://github.com/sthamann/vendune.
**Documentation:** https://sthamann.github.io/vendune/docs/.

The V mark combines a folded V with a dune contour, using azure `#2459ef` and
cyan `#18b9d9`. The mark is a small, dependency-free SVG. UI and site favicons use
identical copies checked by `scripts/branding.py`; the wordmark includes light
and dark variants. [Mark](brand/vendune-mark.svg), [wordmark](brand/vendune-logo.svg),
[dark wordmark](brand/vendune-logo-dark.svg). `shared/ui/Brand.tsx` owns the UI
identity. Tenant-owned company logos and merchant shop names are independent.

The [repository header](brand/vendune-readme.svg) uses the same mark, blue/cyan
palette and dune contours. Its connected Storefront/Studio/Apps/Agents diagram
is authored brand artwork, not a browser screenshot or a performance claim.
README product images remain unedited captures of the actual English prototype.

## Package and deployment naming

The Rust crate and HTTP binary are `vendune`; Rust imports use `vendune::`.
The frontend package is `vendune-experience`. The application image uses `vendune`; fresh local database/search containers use
standard PostgreSQL and Qdrant images. The legacy `vendune-db` image is retained
for existing AGE/pgvector conversions. Fresh local installations use Compose project `vendune` and
container `vendune-postgres-1`. Start and worker commands, differential runners,
MCP examples, deployment files and CI use these names consistently.

Existing checkouts can stay in their original folder. `scripts/dev.sh` detects
an existing legacy Compose project and reuses its data volume. An explicit
`COMPOSE_PROJECT_NAME` takes precedence. Integration verification propagates its
selected container to every child suite, so both new and existing instances can
be checked. To stop an older installation use its actual Compose project name;
never delete its database volume to perform a rename.

## Deliberately stable contracts and historical records

- Existing `atelier` / `workshop` tenant IDs are data identities. User-created
  shop names, company brands, documents and orders are preserved.
- Browser `rac-*` session/cart/customer keys and internal `x-rac-*` principal
  headers retain their existing security behavior; renaming them is unnecessary
  and would invalidate sessions or integrations. Client principal headers remain
  untrusted and cannot grant access.
- Applied SQL migrations retain their exact bytes and checksum. No destructive
  data rewrite is part of branding.
- Dated verification/benchmark records and old recordings retain their original
  names, paths and measured evidence. Historical images are evidence, not a
  representation of the current interface. README screenshots are recaptured
  from Vendune. Historic GitHub repository links redirect after the repo rename;
  new links use the canonical Vendune URL.

`python3 scripts/branding.py` checks package/runtime paths, current public
identity, shared SVG assets, source ownership and the absence of stale platform
branding in the current frontend, website and README. It does not assert a
trademark clearance or production readiness.
