# Customer account workspace

The native dialog gives shoppers six connected views: overview, orders, addresses,
downloads, personal details and security. Sign-in and account creation use distinct
forms. The account token is independent of Studio credentials and scoped to the shop.

| File                     | Responsibility                                                           |
| ------------------------ | ------------------------------------------------------------------------ |
| `CustomerAccount.tsx`    | Dialog, focus restoration, scroll lock and account navigation            |
| `CustomerSignIn.tsx`     | Separate auth modes, autofill and cart context creation/rotation         |
| `useCustomerAccount.ts`  | Parallel reads, guarded mutations, feedback and expired-session recovery |
| `account-types.ts`       | Shopper-safe response contracts                                          |
| `AccountOverview.tsx`    | Recent purchases, counts and default-address shortcuts                   |
| `AccountOrderList.tsx`   | Clickable purchase cards                                                 |
| `AccountOrderDetail.tsx` | Immutable purchase addresses, current statuses, tracking and receipts    |
| `AccountDownloads.tsx`   | Paid entitlements and authenticated binary retrieval                     |
| `AccountProfile.tsx`     | Contact/preferences and password rotation                                |
| `account-polish.css`     | Brand-aware orientation panel and small-screen interaction refinements   |
| `account.css`            | Dialog, navigation and responsive layout                                 |
| `account-fields.css`     | Authentication and shared address/profile form controls                  |
| `account-purchases.css`  | Purchase, delivery and document views                                    |

Shared `AddressBook` supplies revision-checked create/edit/delete and independent
billing/delivery defaults. All interface text lives in `shared/i18n/account-i18n.ts`
and existing shared vocabularies, with English, German, French and Spanish support.
Tracking links reuse the shared safe-URL renderer. Binary endpoints receive the
customer credential in headers; never in URLs. Internal merchant notes are absent
from account order responses.

Component tests exercise actual `shopApi` requests, sign-in without an existing
cart, registration, detail navigation, address defaults, PDF/download retrieval,
unsafe links and expired-session recovery. `scripts/customer_accounts.py` checks
real PostgreSQL ownership, immutable receipts and live delivery transitions.
`developer_documents.py` additionally verifies paid digital entitlements and
foreign/anonymous rejection. See [operations](../../../../docs/merchant-operations.md)
and [testing](../../../../docs/testing.md) for boundaries and commands.
