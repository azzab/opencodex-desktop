# IDE Extension UX Reference Evidence

Built for M3 IDE Experience Parity on 2026-06-13.

## Local Install Proof

VS Code `1.124.2` on macOS arm64 has the reference extensions installed:

| Extension | Version | Installed id |
|---|---:|---|
| Cline | 3.89.2 | `saoudrizwan.claude-dev` |
| Kilo Code | 7.3.45 | `kilocode.kilo-code` |
| Roo Code | 3.54.0 | `RooVeterinaryInc.roo-cline` |
| Continue | 1.2.22 | `Continue.continue` |
| OpenCodex | 0.1.0 | `opencodex.opencodex-vscode` |

Screenshot proof: `vscode--reference-extensions-installed--01.png`.

Local VS Code webview capture was limited by extension host/window focus during this run, so this pack uses installed manifests for command/view inventory plus official docs for behavior. No paid provider login was performed.

## Local Manifest Inventory

| Extension | Main view | Useful commands observed locally |
|---|---|---|
| Cline | `claude-dev.SidebarProvider` | New Task, MCP Servers, History, Account, Settings, Add to Cline, Add Terminal Output to Cline, Focus Chat Input |
| Kilo Code | `kilo-code.SidebarProvider` | New Task, Agent Manager, KiloClaw, Marketplace, History, Profile, Settings |
| Roo Code | `roo-cline.SidebarProvider` | New Task, History, Open in Editor/New Tab, Settings, Explain/Fix/Improve Code, Add to Context, Terminal Add to Context/Fix Command |
| Continue | `continue.continueGUIView` | Apply code from chat, Accept Diff, Reject Diff, Add to Edit, Add Highlighted Code to Context, Debug Terminal, Open Settings, Toggle Autocomplete |

## Evidence Matrix

| Feature | Reference app | Behavior notes (flow, states, edge cases) | Screenshot | Source | Priority |
|---|---|---|---|---|---|
| Persistent IDE chat panel | Cline / Kilo / Roo / Continue | All four contribute a dedicated VS Code webview/sidebar. The OpenCodex extension should not be a generic command wrapper; it needs a persistent chat surface. | `vscode--reference-extensions-installed--01.png` | Local manifests; https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev; https://marketplace.visualstudio.com/items?itemName=Continue.continue | P1 |
| New task flow | Cline / Kilo / Roo | Each provides a first-class New Task command. M3 should expose a visible new-thread/new-task action tied to the current VS Code workspace. | `vscode--reference-extensions-installed--01.png` | Local manifests | P1 |
| Workspace-aware context attach | Cline | Cline supports `@` mentions and drag/drop to add files/folders/images into chat; the `+` button can browse files/images. | `vscode--reference-extensions-installed--01.png` | https://docs.cline.bot/core-workflows/working-with-files | P1 |
| Context providers / @ menu | Continue | Continue docs describe `@` context providers that show a dropdown of context sources and include highlighted code, active files, and configured providers. | `vscode--reference-extensions-installed--01.png` | https://docs.continue.dev/customize/custom-providers; https://docs.continue.dev/ide-extensions/chat/context-selection | P1 |
| Add selection to chat/edit | Continue | Local manifest exposes commands for adding highlighted code to chat and edit. M3 should support selection/file context from VS Code into OpenCodex thread prompts. | `vscode--reference-extensions-installed--01.png` | Local manifest; https://docs.continue.dev/ide-extensions/chat/context-selection | P1 |
| Diff apply / accept / reject | Continue | Continue contributes explicit `acceptDiff`, `rejectDiff`, and vertical-diff accept/reject commands. M3 should add reviewable diffs instead of blind edits. | `vscode--reference-extensions-installed--01.png` | Local manifest; https://docs.continue.dev/ide-extensions/edit/how-it-works; https://docs.continue.dev/customize/model-roles/apply | P1 |
| Explain/fix/improve code commands | Roo Code | Roo manifest exposes editor commands for explain, fix, improve, and add-to-context. M3 should expose selected-code actions through context menus or command palette. | `vscode--reference-extensions-installed--01.png` | Local manifest | P1 |
| Terminal output as context | Cline / Roo | Cline and Roo expose terminal-output-to-chat commands. OpenCodex should support terminal/context handoff where available without leaking secrets. | `vscode--reference-extensions-installed--01.png` | Local manifests | P1 |
| Mode/model controls in chat | Kilo / Roo / Continue | Reference tools expose agent/mode/model concepts in the chat or settings surface. M3 should surface current model/mode in the IDE, not only in desktop settings. | `vscode--reference-extensions-installed--01.png` | https://github.com/kilo-org/kilocode; https://docs.roocode.com/advanced-usage/available-tools/switch-mode; https://docs.continue.dev/reference | P1 |
| Approvals/status bar | Continue / Kilo / Roo | Continue has accept/reject diff commands; Kilo/Roo docs discuss auto-approval and approval settings. M3 should show approval state and pending actions visibly. | `vscode--reference-extensions-installed--01.png` | https://docs.roocode.com/faq; https://kilo.ai/docs/getting-started/settings | P1 |
| Extension publishing identity | All | Marketplace identifiers are valid `<publisher>.<name>` ids. OpenCodex must keep a valid publisher/name and avoid `undefined_publisher.*`. | `vscode--reference-extensions-installed--01.png` | https://code.visualstudio.com/docs/configure/extensions/extension-marketplace | P1 |
| Antigravity/fork compatibility | Cline docs | Cline docs explicitly name VS Code-like IDEs including Cursor, VSCodium, Windsurf, and Antigravity. M3 must root-cause the Antigravity extension-host hang without modifying the user's existing Antigravity settings. | `vscode--reference-extensions-installed--01.png` | https://docs.cline.bot/getting-started/installing-cline | P1 |
| MCP server surface | Cline / Kilo / Roo | Cline has MCP Servers command; Kilo has marketplace controls; Roo docs mention MCP and project-level MCP config. OpenCodex should expose MCP status/capabilities only when backed by desktop runtime. | `vscode--reference-extensions-installed--01.png` | Local manifests; https://docs.roocode.com/update-notes/v2.2; https://docs.roocode.com/update-notes/v3.11 | P2 |
| Popout/editor tab | Roo Code | Roo exposes open-in-editor/new-tab commands. Useful but not required if OpenCodex provides a robust sidebar first. | `vscode--reference-extensions-installed--01.png` | Local manifest | P2 |
| Autocomplete | Kilo / Continue | Kilo and Continue market autocomplete. OpenCodex M3 should not add autocomplete unless explicitly scoped; preserve as future work. | `vscode--reference-extensions-installed--01.png` | https://marketplace.visualstudio.com/items?itemName=kilocode.Kilo-Code; https://marketplace.visualstudio.com/items?itemName=Continue.continue | P3 |

## P1 Implementation Expectations For M3

| P1 behavior | Required OpenCodex mapping |
|---|---|
| Persistent chat panel | Dedicated OpenCodex VS Code sidebar with existing threads and new-thread action. |
| Workspace awareness | Threads filter/bind to the currently opened VS Code folder and show the active workspace. |
| Context attach | File/folder/selection/terminal context can be attached to a thread with visible chips or rows. |
| Diff review | Proposed edits use VS Code-native diff/review affordances with accept/reject, not silent writes. |
| Approval state | Pending desktop approvals and IDE-side approval actions are visible in panel/status. |
| Model/mode display | Current model/provider/mode is shown and can be changed or delegated to desktop settings. |
| Fork compatibility | VS Code, Cursor, and Antigravity behavior is tested or the exact blocker is documented. |

## What We Will NOT Copy

- Do not copy reference extension icons, names, activity bar artwork, marketing copy, or prompt text.
- Do not embed reference-extension assets in the OpenCodex extension.
- Do not create hidden provider logins or paid account flows.
- Do not mutate the user's Antigravity profile or settings during compatibility testing.
- Do not implement autocomplete in M3 unless a later phase explicitly scopes it.
