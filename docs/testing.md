# Testing, coverage and maintenance contracts

The prototype has automated behavior checks, actual PostgreSQL/AGE integration,
original Shopware comparisons and partial Lean contracts. **It is not fully tested
at 100%, and neither coverage nor the Lean subset proves the entire system bug-free.**

## Source architecture

- Rust: 251 source modules, each with a responsibility header, at most 320 lines; `main.rs` at most 120. Existing domain folders remain independent of extension app implementations.
- Frontend: separate `admin/`, `storefront/`, `platform/` and `shared/` ownership. Views/controllers and styles are limited to 400 lines; locale data has a documented 700-line allowance. Runtime cycles, unresolved local imports, crossing application boundaries, missing folder contracts and undocumented source files fail CI.
- Independent Python services, app examples and browser SDKs remain under `extensions/`; test tooling lives under `scripts/`. [The generated inventory](module-inventory.md) covers all these sources and is checked for drift.
- Studio workspaces load lazily. Root application routing is isolated in `frontend/src/application/`; error boundaries keep workspace failures inside the current view and provide reload recovery for rejected cached module imports. The removed `CommerceManager` had no call site and duplicated old operational UI. Order state management remains in `admin/orders/OrderWorkflow.tsx`; product review moderation lives in `admin/catalog/ReviewModeration.tsx`.

`frontend/tests/architecture.mjs` also inserts deliberately broken synthetic imports,
a cycle, an oversized file and absent documentation into temporary directories;
it verifies that the architecture checker actually rejects each defect.

## Repeatable checks

From the repository root:

```sh
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo build --locked --bins
npm --prefix frontend ci
npm --prefix frontend run format:check
npm --prefix frontend run build
npm --prefix frontend run architecture
npm --prefix frontend run localization
npm --prefix frontend run test:coverage
python3 scripts/formal.py
python3 scripts/formal/mutations.py
python3 scripts/verify_integration.py
```

Local integration creates and removes its own uniquely named synthetic database;
existing shops remain outside that run. The default database container is
`vendune-postgres-1`; override it with `--container`. It uses `DATABASE_URL`
from the process or the local `.env`. CI alone passes `--existing-database` for its
already-disposable database. Failures remain failures, and child processes stop
before database cleanup. SIGINT flushes optional Rust coverage profiles.

`testing/suites.json` is the single registry for 29 HTTP suites, four local
provider/connector suites, four browser contracts and verification-tool tests.
The local server uses an offline model URL; live model checks are separate, opt-in
checks. Credentials, payments, mail and Slack are exercised against loopback
protocol fixtures. Passing these does not demonstrate a real provider account.

The original-PHP comparisons and reflected automation catalog checks are:

```sh
python3 scripts/differential.py
python3 scripts/context_differential.py
python3 scripts/delivery_differential.py
python3 scripts/rule_differential.py
python3 scripts/automation_registry.py
python3 scripts/automation_differential.py
```

The automation suite also executes `scripts/playground.py` as documented: a new
owner-owned shop, repeat setup after an edited rule, both checkout branches and
actual invoice records. `tooling_tests.py` has 12 tests, including refusal of
remote credential destinations and unsafe state-file symlinks. See
[the manual tour](playground.md) for the corresponding browser steps.

## Component regressions

`frontend/tests/unit/` uses real components/hooks/transports, synthetic domain
fixtures, jsdom and Testing Library. Fetches fail by default unless explicitly
supplied by a test. Cases include:

- merchant authentication, chat failures, language changes, uploads and separate live/staging transports;
- navigation through all 14 lazy Studio workspaces and a signed-out login path;
- catalogue filtering, cursor pages, stale responses, customer-session expiry and forbidden operation replay;
- independent default addresses, linked customer/order/product back paths, configured translated groups, lazy history and confirmed revision-bound restoration with retained failed drafts;
- opt-in personalization, ranking, consent withdrawal and failed signals;
- product gallery, variants, normalized purchase quantities, tier prices, SEO, reviews and public source-backed product questions;
- delayed product answers after navigation and product-specific moderation with rejected writes;
- connected flow branches/deletion, frozen execution traces, incomplete JSON drafts and source condition round-trips in four languages;
- SMTP/Resend/SendGrid fields, saved secrets, read-only settings, translated templates and explicit dry-run test calls.

## Coverage collection

Frontend coverage includes **every** `src/**/*.ts` and `src/**/*.tsx`, including
modules never imported by a test. HTML, JSON, LCOV and summaries go to
`frontend/coverage/`. Styles and independent guest app bundles are outside that
statement metric and explicitly listed as separate scopes.

For Rust install `cargo-llvm-cov` 0.9.1 and `llvm-tools-preview`. Use the same
instrumented binaries for units, original-PHP comparisons and the actual HTTP
integration run:

```sh
export CARGO_LLVM_COV_TARGET_DIR="$PWD/target"
cargo llvm-cov clean --workspace
eval "$(cargo llvm-cov show-env --sh)"
cargo test --locked
cargo build --locked --bins
# Run the integration and comparison commands above, then:
mkdir -p artifacts/coverage
cargo llvm-cov report --json --output-path artifacts/coverage/rust.json
cargo llvm-cov report --html --output-dir artifacts/coverage/rust
```

Mutation variants write profiles outside the real-core report directory; deliberately broken code cannot inflate the production coverage metric.

The Rust report measures lines, functions and regions, not branch coverage. The
JSON preserves every module in this instrumented scope. Do not call covered
regions exhaustive branch coverage.

Python instrumentation is a development dependency, not a production service
dependency. It collects subprocesses and includes untouched namespace modules:

```sh
python3 -m pip install -r scripts/testing/requirements.txt
COVERAGE_PROCESS_START="$PWD/scripts/testing/.coveragerc" PYTHONPATH="$PWD/scripts/testing" python3 scripts/verify_integration.py
python3 -m coverage combine --rcfile=scripts/testing/.coveragerc
python3 -m coverage json --rcfile=scripts/testing/.coveragerc
python3 -m coverage html --rcfile=scripts/testing/.coveragerc
python3 scripts/testing/coverage_report.py
```

The report covers Python app/service sources and verification tools, so its
percentage must not be presented as coverage of the Python services alone.
Before a fresh standalone Python measurement, remove only the prior synthetic
`artifacts/.coverage*` data, to avoid mixing historical executions.

CI uploads complete reports and lists zero-hit modules and unmeasured scopes.
`coverage-policy.json` locks the measured regression floors; Studio transport, server-health and workspace-boundary
modules require 100% lines, branches, functions and statements.
Adding a source file counts in the denominator. Raising those floors is an
explicit reviewed change; do not silently lower them to obtain a green check.

## Explicit 100% audit and open work

```sh
npm --prefix frontend run test:coverage:full
python3 scripts/testing/coverage_report.py --require-full
```

These commands **currently fail**, as they should. The second also rejects a full
system claim while browser SDK/example-app JavaScript and Wasm instruction coverage
remain unmeasured. CSS requires visual behavior checks; live OAuth credentials,
external inference and production deployment need their own verification.

The initial measured snapshot is in [quality-baseline.json](quality-baseline.json).
The largest remaining frontend gaps include order-detail edits/documents,
customer/address edge cases, full operator workflows, app iframe errors and
complex rule/flow interactions. Coverage HTML shows individual missed statements
and branches, not only totals. Future changes must add behavior regressions in
these owning modules and increase coverage; a passing threshold is not completion
of the 100% objective.

Lean source review locks and mutation checks continue in CI unchanged in scope;
see [formal verification](formal-verification.md) for precisely what is proved.

The account composition regression exercises both login and registration through
`CustomerAccount → CustomerSignIn → shopApi`. The simulated transport rejects
protected profile/address/order reads unless the form persisted the exact
tenant session key. This reproduces the former React-reserved `key` prop bug;
backend address/customer isolation is separately exercised over real HTTP.

Studio session regressions reproduce a product 401 after a previously loaded
overview, verify that all private controller state is cleared, and reconnect with
a renewed token. Shared merchant calls and focus revalidation exercise the same
path. Negative cases cover 403/5xx, customer/provider/operator errors, invalid
login attempts, old-token replies after reauthentication, coalesced reads, hidden
tabs, overlapping checks and timer/listener cleanup. Browser verification uses
the existing personal test account; no expiry bypass or new privileges are added.

## International configuration regression scope (2026-10-05)

New PostgreSQL suites cover complete bundled geography, custom countries/regions,
US destination taxes in actual product/cart/order paths, saved-rule conditions,
non-English main-language inheritance and stale/foreign configuration rejection.
Translation fixtures cover Ollama/OpenAI/Claude wire formats, durable full-catalogue
drafts, cold restart, stale apply, repeated apply and permission/tenant denial.
They perform no paid model calls. React tests exercise keyboard/group country
selection, missing-field inheritance and a shared settings draft across navigation.
UI screenshots supplement these tests; neither replaces whole-source coverage.

## Recorded international-commerce verification

[CI run 37285967720](https://github.com/sthamann/vendune/actions/runs/37285967720)
verified the international-commerce tree merged as `852f3d1` on 5 October 2026:
67 Rust unit tests, 90 frontend tests and the registered 25 HTTP / 3 provider /
4 browser-contract suites. The complete measured report, including untouched
modules and unmeasured scopes, is checked into [quality-baseline.json](quality-baseline.json).

| Scope | Lines | Other measured metrics |
|---|---|---|
| Rust | 81.00% | Functions 78.41%; regions 77.84% |
| Frontend | 42.28% | Branches 36.34%; functions 32.49% |
| Python | 74.11% | Branches 52.78% |

These percentages retain the separate source scopes above and do not establish
100% coverage or whole-system correctness. Regression floors were preserved.

Company profile HTTP/database checks run in the suite registry as `company_settings`; the scope, decoder/ACL, issuer snapshot, translation and selective release cases are detailed in [company settings](company-settings.md). They use synthetic tenants and local image bytes, with no external payment/model/OAuth traffic.

## Channel settings and media workspaces (2026-10-05)

See [the settings/media guide](settings-media.md) for the current single-language editor, field-level checkout overrides, dependency-safe method removal, gallery and optional private image jobs. These are native prototype extensions; they do not establish additional full Shopware API/DAL parity, current tax law, paid-provider quality or whole-system formal certification.

## App library regression scope (2026-10-05)

Eight component regressions exercise translated search, categories/status/discovery,
installation followed by the real detail page, cancellation and failed activation,
viewer restrictions, registered native interfaces, locale inheritance and
independent artwork failure fallbacks. The isolated PostgreSQL app suite checks
metadata round trips, tenant separation, immutable same-version digests, unsafe
artwork refusal and the actual shop main language. Strict model-schema regression
keeps optional presentation compatible with both provider request formats.

The app-library clean frontend run passed 137 tests: 50.16% statements, 43.76% branches,
41.35% functions and 50.98% lines across all included source. These measurements
are not whole-system 100% coverage. Actual browser checks supplement component
tests with desktop and 375px layouts. The affected apps, app surfaces, App Studio
and developer-document HTTP suites pass using local fixtures, without paid calls.

## Connected knowledge workspace (2026-10-05)

The current clean frontend run passes 151 tests across 26 test files, including
ten knowledge regressions: whole-shop census, a single inherited-language editor,
explicit empty values, non-English main language, guarded publication, viewers,
retrieval scope, failed edits, actual product navigation and recommendation review.
Across all included source the run measures 52.16% statements, 45.88% branches,
43.10% functions and 52.99% lines. This is a measured frontend scope, not a
whole-system coverage update or a 100% claim.

84 Rust unit tests, strict lint/format, the extraction/Lean gates and negative
mutations pass. The affected isolated PostgreSQL/AGE suites (`knowledge_workspace`,
`developer_documents`, `apps`, `staging`, `connected_apps`, `automation`) exercise source hashes,
public/private/archive fences, enabled-language retrieval, >50-source pagination,
optimistic revisions, graph reassignment, granular HTTP/MCP access and selective
release. Local provider fixtures prove private document passages reach the actual
merchant model prompt and disappear after archive. No paid provider calls are used.

The knowledge suite also follows source ingestion through a product-scoped event
rule into a durable completed flow without an order. Four UI regressions retain
the stable trigger IDs while translating their labels EN/DE/FR/ES.

Browser checks cover inherited source creation in App Studio Lab, private customer
exclusion versus merchant retrieval, the real product preview, desktop and 375px
layouts. See [the knowledge guide](knowledge-workspace.md) for source ownership,
HTTP/MCP contracts, screenshots and the fixed-model/causality boundaries.

## Adversarial tenant isolation

The registered `tenant_isolation` HTTP suite uses two synthetic workspaces, real
merchant/customer sessions, direct MCP/UCP calls, foreign IDs, forged scope
headers, same-ID app records and revoked one-workspace integration keys. It
re-reads victim state after denied mutations. The database helper tests all 22
new composite foreign keys with own/foreign controls, scans tenant foreign keys
for missing scoped counterparts, and tests forced app RLS under a restricted
role including context reset on the same connection. It runs automatically via
the existing CI integration registry, with zero provider calls.

[Exact scope and remaining core-RLS boundary](tenant-isolation.md). Grouped
checks are behavioral evidence, not 100% endpoint/authorization coverage.

## Checkout verification (6 October 2026)

The checkout change passes 226 frontend tests across 34 files (including twelve
checkout regressions) and 96 Rust unit tests. The preceding `75bd24a` whole-source
frontend coverage snapshot measured lines 60.78%, statements 59.70%, branches
53.50% and functions 49.32%. These figures are
frontend-only and do not replace the older full-stack baseline report.

Real isolated SQL/HTTP suites verify review admission (five checks), native payment
wire behavior (ten checks) and tenant isolation (38 checks). The browser saved a
synthetic order after explicit review; 390-pixel emulation had no checkout content
overflow. No paid model/PSP calls were used. The public Studio's origin fix was
verified separately with allowed-origin 200, foreign-origin 403 and a fresh
merchant-owned test shop with products, eight discoverable apps and browser MCP.
