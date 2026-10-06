# legal

Connected European-operation boundary; configuration is inherited through the
existing commerce settings system. `model.rs` owns bounded settings and public
policy fingerprints; `consent.rs` owns scoped receipts and transaction-level
processing admission; `checkout.rs` validates acknowledgement and snapshots
accepted documents into orders; `product.rs` validates translated safety/sector
facts; `requests.rs` owns idempotent declarations and private review/audit;
`capabilities.rs` reuses those handlers for permission-filtered MCP tools.
`mod.rs` only composes routes and exports.

Verify real behavior with the registered `legal_privacy`, `tenant_isolation` and
`email_tests` suites. The two pure admission decisions are extracted to Lean;
surrounding SQL, provider delivery and legal sufficiency are not proved.
See [configuration, architecture and limits](../../docs/european-operation.md).
