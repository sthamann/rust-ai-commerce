# App Studio

A visual workbench over the **same versioned Manifest** consumed by the Rust runtime, HTTP APIs and coding-agent imports. The browser compiles data bindings into existing authorized actions; the Rust server validates every installed package independently.

- `DeveloperView.tsx`: workspace, tab navigation, one content-language scope and sandbox selection.
- `app-model.ts`: pure schema edits, action binding, dependency cleanup and bounded undo/redo.
- `AppCanvas.tsx`: accessible click-to-add/select/order/remove components.
- `AppInspector.tsx`: app/view/block properties with inherited translations.
- `AppDataEditor.tsx`: typed managed data fields and public-read settings.
- `AppConnections.tsx`: HTTP routes, AI grounding/tools and Flow Builder opt-in.
- `AppAgentPanel.tsx`: current-manifest prompting, Codex/Claude task export, authoritative schema download and agent JSON round-trip.
- `useAppStudio.ts`: immutable build lifecycle and exact saved-snapshot checks.
- `AppVersions.tsx`: version inspection, digest-approved staging and selective package release.
- `SandboxPreview.tsx`: authoritative installed-registry resolution, including rejection of a stale preview version.

The actual renderer is in `shared/apps/native/`, shared by the sandbox preview and released admin/storefront views. Freely executable app services retain the isolated iframe/service path; the native builder does not execute scripts or start a shell.

Run frontend build, tests, coverage, localization and architecture checks. See [App Studio guide](../../../../docs/app-studio.md) and [testing boundaries](../../../../docs/testing.md). Test presence is not 100% whole-codebase coverage.

- `AppLibrary.tsx`: clickable saved app cards with explicit edit/delete, confirmation and restore; opens the latest build as a new editable version. Both library and version-list editing return to the design workspace.

- `AppAssistant.tsx`, `assistant-model.ts`: nine guided types compiled into the shared versioned contract.
- `AppFieldOptions.tsx`, `AppContextBinding.tsx`: owned core references, translated choices and host context.
- `AppActionAccess.tsx`: independent team scopes and MCP flags.
- `AppAutomation.tsx`: declared service events, UTC cron and signed ingress.
- `AppViewTabs.tsx`: view navigation and creation.
- `SandboxContextPicker.tsx`: bounded selection of real sandbox products/customers/orders.

[Guided apps, provider boundaries and verification](../../../../docs/app-assistants.md).
