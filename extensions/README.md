# Tenant extension examples

The working ABI is `approve(total_minor: i64, limit_minor: i64) -> i32`.
Amounts are integer EUR cents; zero rejects and any nonzero result allows.
The hook runs in the **actual B2B order transaction**, after authoritative
item + shipping totals and inventory checks, before any stock/order mutation.
B2C orders do not invoke this hook. No guest can rewrite prices or access data.

| Example | Business policy | Boundary example |
|---|---|---|
| [company-limit.wat](company-limit.wat) | Supplied company purchase budget | 100,000 cents allowed; 100,001 rejected |
| [budget-reserve.wat](budget-reserve.wat) | Preserve EUR 100 of that budget | At a EUR 1,000 budget, EUR 900 allowed; EUR 900.01 rejected |
| [minimum-order.wat](minimum-order.wat) | Minimum EUR 50, respecting the budget | EUR 49.99 rejected; EUR 50 allowed |
| [single-order-cap.wat](single-order-cap.wat) | At most EUR 250 per purchase, respecting the budget | EUR 250 allowed; EUR 250.01 rejected |

The current demo supplies a EUR 1,000 **per-purchase** budget. It is not a
monthly/remaining-credit ledger; purchases do not consume a company budget.
Policies are alternatives: activating one replaces the previous hook for the
selected tenant. They are not automatically composed.

## Activate a policy

An owner/administrator can call `POST /api/extensions/activate` with
`{"wat":"...contents of the selected example..."}`, personal bearer session,
and `x-tenant`. The server compiles and probes it before persisting source,
SHA-256 digest and revision. Checkout reuses compiled modules while creating
an isolated Store for each invocation. It reads the persisted policy inside
the transaction: changes from another application instance refresh a stale
local compiled module before purchase. Restarts restore the persisted source.

No host imports, WASI, filesystem, network or clocks are supplied. Guests have
10,000 fuel units, a 1 MiB linear-memory limit, a 256 KiB stack limit and a
32 KiB source limit. Traps fail closed and roll back the order transaction.
This is Wasmtime compilation of Wasm/WAT, **not PHP-to-Rust transpilation**.
Arbitrary existing Shopware plugins are not supported.

## Verify actual behavior

```sh
set -a; source .env; set +a
cargo test --locked sandbox
REPORT_PATH=.run/extensions.json python3 scripts/extensions.py
```

The HTTP check temporarily replaces the `workshop` demo policy, submits blocked
and allowed synthetic B2B purchases through the real cart/checkout API, checks
host-import/fuel/memory failures, and restores the exact previous policy even
on failure. It creates three simulated orders and changes synthetic inventory.
Use it against the local demo only. Set `TEST_TENANT` to another synthetic shop
containing the demo B2B buyer and template catalog if needed.

Adding hooks for discount rules, content or fulfillment requires a new typed
host contract, role authorization and transaction tests. A guest does not gain
those capabilities merely by exporting a function with that name.
