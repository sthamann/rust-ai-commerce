# frontend/src/admin/automation

Ownership, executable contracts and explicit migration boundaries are described in [the automation guide](../../../../docs/automation.md). Each module owns one responsibility; HTTP and MCP delegate to the same tenant-bound operations.

- [AutomationEditor.tsx](AutomationEditor.tsx): AutomationEditor: focused form view with explicit typed inputs and callbacks.
- [AutomationView.tsx](AutomationView.tsx): Typed merchant rule/campaign/flow/channel forms with exact JSON available for advanced review.
- [CustomFieldCondition.tsx](CustomFieldCondition.tsx): Typed custom field conditions support text, numeric, Boolean and date values using original field payload names.
- [FlowActionFields.tsx](FlowActionFields.tsx): Focused source action forms expose only supported native parameters; app service dispatch stays in the app gateway.
- [FlowBuilder.tsx](FlowBuilder.tsx): Graphical event → condition tree → action pipeline, including installed app actions.
- [FlowCanvas.tsx](FlowCanvas.tsx): Branching flow canvas edits the actual server graph, including true/false edges, reusable actions and durable delays.
- [FlowExecution.tsx](FlowExecution.tsx): Actual persisted execution traces show branch decisions, confirmed steps and the scheduled continuation.
- [FlowInputs.tsx](FlowInputs.tsx): Schema-derived flow parameters; runtime-bound event fields are intentionally supplied by the server.
- [FlowTopology.tsx](FlowTopology.tsx): Readable connected overview of the persisted graph; selecting a node opens its matching editor card.
- [JsonField.tsx](JsonField.tsx): JSON editing retains incomplete input and invalidates the actual payload instead of silently saving the last valid value.
- [RuleBuilder.tsx](RuleBuilder.tsx): Visual recursive rule tree: AND/OR/NOT groups, typed facts and editable leaf conditions.
- [SourceRuleFields.tsx](SourceRuleFields.tsx): Original metadata drives typed condition inputs, including nested source scopes; unsupported runtimes stay visibly disabled.
- [automation-types.ts](automation-types.ts): Automation editor contracts and supported language codes.
- [pipeline-types.ts](pipeline-types.ts): Stable graph data mirrors the Rust pipeline contract, with explicit true/false edges and persistent node identifiers.
- [source-rules.ts](source-rules.ts): Convert source condition nodes for the graphical editor without losing original payload fields.

[Full source inventory](../../../../docs/module-inventory.md) lists every module. Listings are not a claim of complete test coverage.
