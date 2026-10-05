# Company identity, legal metadata and channel inheritance

Commerce Studio → Settings → Master data owns a company's factual identity,
structured address, contact and bank details, public brand text and logo. The
scope selector chooses the shared company basis or a configured sales channel.
Storefront and headless channels use the same resolver. Separate SaaS tenants
never inherit from each other.

![Structured company editor](screenshots/company-settings.jpg)

## Identity and address

`name` is the statutory company name. Address fields are `street`, `houseNumber`,
`additionalAddressLine1`, `additionalAddressLine2`, `postalCode`, `city`, `country`
and `countryStateId`. The searchable world/subdivision pickers use the tenant's
country catalogue, including custom countries and regions. A company's country
need not be enabled as a delivery destination. Structured addresses require a
city and valid country; a subdivision must belong to that country.

Legacy `address` remains readable and is preserved verbatim until a structured
street is supplied. The server then derives `address` from the individual fields
for compatibility and document printing. It never guesses how to split an old
address. House numbers and postal codes are strings, preserving `12A`, leading
zeroes and international postal formats.

Legal metadata includes `legalForm`, `registerType`, `registrationNumber`,
`registerCourt`, `managingDirectors`, `legalRepresentatives`, `contentResponsible`,
`contentResponsibleAddress`, `vatId`, `economicId`, `supervisoryAuthority`,
`professionalChamber`, `professionalTitle`, `professionalCountry`,
`professionalRulesUrl`, `shareCapital`, `outstandingCapital` and
`liquidationNotice`. Contact fields are `email`, `phoneNumber`, `website`;
internal document fields include `taxId`, `bankName`, `iban`, `bic`.

The field selection follows the conditional information categories of
[§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html) and the content
responsibility provisions of [§ 18 MStV](https://www.gesetze-bayern.de/Content/Document/MStV-18?view=Print).
These are optional fields because applicability differs by entity, activity and
jurisdiction. Their presence does not validate register entries, VAT numbers,
invoice compliance or the completeness of a shop's legal disclosures.

## Inheritance and translation

- Missing or `null` channel fields inherit from the shared basis.
- A string override replaces only that field; `""` explicitly clears an optional
  field, including suppressing a logo with `logoId: ""`.
- The restore control writes `null`; editing an inherited field creates a local
  override without copying other basis fields into the channel.
- `brandName`, `legalNotice` and `responsibilityScope` are locale maps. Channel
  locale entries merge over basis entries; missing/null entries inherit. The
  resolved map falls back per field to the shop's `mainLocale`. Empty text stays
  empty. The editor uses one enabled content language and never generates
  fictional translations when the language/scope changes.
- Statutory names, addresses, people, identifiers and bank numbers are factual
  values, not machine-translated legal identities. Interface labels ship in
  English, German, Spanish and French.

For example, the basis can contain one seller/address/logo while a second brand
changes only `brandName.de`, `email` and `logoId`. A different legal seller may
also override `name`, address and register details. Tax, shipping and payment
configuration remain the existing shop-wide commerce aggregate: company
identity overrides do not silently change tax calculation or provider accounts.
Other domains should adopt explicitly typed override contracts and connect their
actual consumers; a generic JSON settings bag is insufficient for those rules.

## HTTP and MCP contracts

| Endpoint | Purpose |
| --- | --- |
| `GET/PUT /api/settings/master-data` | Shared `{data, revision}` company basis |
| `GET/PUT /api/settings/master-data/channels/{id}` | Sparse `{data, revision, baseRevision, inherited, effective}` channel contract |
| `GET/PUT /api/merchant/receipts/settings` | Compatible alias for the same shared record, retaining document ACL |
| `POST /api/settings/company-logo` | Multipart `file`; validated private upload |
| `GET /api/settings/company-logo/{id}` | Settings-reader private JSON/data-URL preview |
| `GET /store-api/company` | Resolved public identity for `x-tenant` and `sw-sales-channel-id`; localized by `x-commerce-locale` |
| `GET /store-api/company-logo/{id}?shop=…&channel=…` | PNG bytes only for a logo currently linked to that public channel |
| MCP `merchant.company` / `merchant.company.save` | Same read/save functions, optionally scoped with `channelId` |

Writes require `settings.write`, reads require `settings.read`; company MCP tools
use the same tenant admission and permissions. Channel writes require both the
observed override revision and basis revision. Stale writes return 409 and leave
the client draft intact. Basis changes also validate all resulting dependent
channel addresses. The virtual `default` channel uses the shared basis;
configured channels have independent sparse overrides. Each update emits
`settings.master_data_changed` through the normal outbox.

## Logo and public identity

Images are decoded with size/allocation limits, stripped of embedded metadata and
normalized to PNG. Only PNG, JPEG and WebP are accepted, up to 2 MiB input/output
and 4096×4096 pixels; SVG, malformed/truncated images and foreign logo IDs are
rejected. Immutable bytes live in `company_logos` with a SHA-256 digest; at most
50 distinct uploads are retained per tenant. Uploads remain private until their
ID is saved into an effective company profile. Removing a logo unlinks it from
public delivery; stored bytes remain for identity history and reuse. A private
sandbox remains private even when an image URL supplies its shop query parameter.

Storefront navigation/footer use the effective brand/logo. `#legal` is directly
reachable from the footer and renders the explicit public projection. Domestic
tax number, bank details and arbitrary internal fields are not included. The
receipt issuer is resolved from the order's stored `salesChannelId` inside the
issuance transaction. Seller/address/register/representative/VAT data are frozen
in the document snapshot. Cancellation reuses the original invoice's seller.
The current PDF renderer prints text; logo bytes are not embedded in PDF output.

## Staging and implementation

A private environment clones the basis, overrides and immutable logo bytes.
`company` and `company-channel:{id}` are independent selectable release units.
Releases check stage digest and the live baseline, copy only the selected logo,
resolve duplicate image digests to owned live IDs, validate the final company
aggregate and emit an event atomically. The baseline records canonical published
IDs, so subsequent releases continue to compare against actual live state.

| File | Responsibility |
| --- | --- |
| `src/operations/company_model.rs` | Field whitelist, locale/country validation, sparse inheritance, address projection |
| `src/operations/master_data.rs` | Shared/channel persistence, revision/transaction boundaries and issuer resolution |
| `src/operations/company_logo.rs` | Decoder limits, immutable storage, authenticated preview and linked public bytes |
| `src/operations/company_public.rs` | Deliberate public projection without private banking/tax fields |
| `src/staging/company.rs` | Selective company/override/logo release and canonical baseline |
| `frontend/src/admin/settings/Company*.tsx` | Modular factual fields, logo, content-language editor |
| `frontend/src/storefront/shell/CompanyLegalPage.tsx` | Public channel legal view |
| `migrations/030-company-settings.sql` | Tenant/channel foreign keys, revisioned overrides and logo storage |

## Verification boundary

`scripts/company_settings.py` runs real HTTP/PostgreSQL checks for structured and
legacy addresses, tenant/custom subdivision validation, sparse two-channel and
Spanish-main-language inheritance, stale versions, concurrent writers, logo
admission/private publication, foreign IDs, channel checkout/issuer PDF,
immutable cancellation, MCP, private cloning and repeated selective releases
with digest deduplication. It is registered in the normal CI HTTP suite registry.

`frontend/tests/unit/company-settings.test.tsx` covers real sparse saves,
restore/scope-discard behavior, dynamic enabled languages, independent channel
and language fallback, and upload admission. Existing merchant operations,
customer account and staging suites continue to run. Rust unit tests exercise
address inheritance and decoded image admission.

The existing Lean policy suite, source review locks and negative mutation checks
remain mandatory. These new JSON/SQL/image/UI adapters are explicitly unproved;
green tests and reviewed hashes do not certify legal compliance or the whole core.
