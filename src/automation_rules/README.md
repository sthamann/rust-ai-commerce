# src/automation_rules

Ownership, executable contracts and explicit migration boundaries are described in [the automation guide](../../docs/automation.md). Each module owns one responsibility; HTTP and MCP delegate to the same tenant-bound operations.

- [comparison.rs](comparison.rs): Original comparison primitives plus literal wildcard/zip operators; no regex or executable expressions.
- [containers.rs](containers.rs): Source line wrappers, quantified goods and all-line containers retain one selected line scope.
- [evaluation.rs](evaluation.rs): Evaluate native rule scopes from authoritative JSON facts with precise line/container selection.
- [fields.rs](fields.rs): Source custom fields retain typed equality and selection intersection; purchase prices use private server facts.
- [mod.rs](mod.rs): Source-named rule registry and checked evaluation; absent required facts are errors, including under NOT.
- [tests.rs](tests.rs): Regression cases cover missing authority under NOT, original quantifiers, dates, metadata types and registry bounds.
- [time.rs](time.rs): Calendar comparisons use an explicit server clock, IANA zones and the original exclusive date-range end.
- [validation.rs](validation.rs): Bounded source payload validation against exported field/operator metadata and nested condition scopes.

[Full source inventory](../../docs/module-inventory.md) lists every module. Listings are not a claim of complete test coverage.
