# Archived connector comparison reference

This is the previous Python/SQLite standard-service implementation. It is retained
only for differential tests and offline migration investigation, not deployed or
started by the normal launcher. Production uses `src/connectors/` and migration 049.
The test suites import this reference deliberately; their actual checkout consumer
and multi-process runtime tests launch the compiled Rust connector.
