# Local playground fixtures

`fixtures.py` contains translated native rules, one coupon, one sales channel and
an active provider-free order graph. It is data for `../playground.py`, not a
second commerce engine. The CLI authenticates a personal account and creates a
separate shop through the existing API; every definition is saved with revision
zero only when absent. Existing edits and installations survive repeated setup.

The state file contains the local origin, shop ID and optional account email;
passwords/session tokens remain in memory only. Files use mode 0600 and reject
symlinks. Setup rejects remote origins, bootstrap identities and saved shops
outside its playground namespace/current owner memberships.

The real HTTP integration in `../automation.py` invokes the CLI twice and verifies
both order branches, metadata and invoice generation. Credential/URL/file guards
also have negative tests in `../testing/tooling_tests.py`.

[Merchant walkthrough](../../docs/playground.md).
