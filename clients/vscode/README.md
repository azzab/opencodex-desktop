# OpenCodex VS Code Extension

A Cline-class IDE agent surface — thin app-server protocol adapter for the Kun
runtime. No business logic — the extension calls Kun via HTTP/SSE and renders
the response in VS Code.

**Version 0.2.0** — M3 IDE Experience Parity.

## Features

### Chat Panel (Cline-class)
- **Streamed markdown** with live cursor during agent responses
- **Code blocks** with Copy and Insert at Cursor actions
- **Collapsible tool steps** — expand/collapse tool input/output inline
- **Inline approvals** with Allow/Deny buttons in the chat flow; REMOTE badge for non-local approvals
- **Plan/execute visibility** — plan mode indicator shows when the agent is in plan mode
- **Context chips** — active file, selection, and attached files shown before send
- **@-mention file picker** via command palette (Cmd+Shift+P → "OpenCodex: Pick File to Attach")
- **Mode selector** — switch between Agent and Plan modes in the composer

### Editor Integration
- **Native diff views** — changed-file events open VS Code diff editor with approve/revert routing through desktop approvals
- **Status bar** — shows connection state, current model, and active turn
- **Context menu** — right-click selection → Explain/Fix/Improve Code
- **Command palette** — 15 commands for all operations
- **Keybindings** — Cmd+Shift+O to attach selection

### Workspace Awareness
- Threads filtered to the opened folder
- New threads bound to the current workspace
- Multi-root workspace support
- Thread tabs for quick switching

## Build & Package Proof

```bash
cd clients/vscode
npm install        # one-time
npm run build      # → dist/
npm test           # → 40 tests
npm run package    # → opencodex-vscode-0.2.0.vsix
```

### Verification

```bash
# TypeScript compiles cleanly
npm run typecheck
# → exit 0

# Tests pass (mocked protocol client against Kun HTTP contract)
npm test
# → 40 tests pass (client, manifest, sidebar/SSE, workspace, context)

# Package is produced
ls -la opencodex-vscode-0.2.0.vsix
# → ~47KB .vsix (37 files)
```

## Manual Smoke Test (Operator-Only)

**Prerequisite: A real VS Code instance is required.** If unavailable, this is an
operator-only gap — the extension has been built, packaged, and tested with
mocked protocol responses, but driving a live turn requires:

1. A running Kun server (`opencodex serve` or desktop app)
2. VS Code with the extension installed from the `.vsix`
3. A configured model with a valid API key

### Smoke procedure

1. **Start Kun**: `opencodex serve --port 18999 --data-dir /tmp/ocx-vscode-smoke --insecure`
2. **Install extension**: VS Code → Extensions → `...` → "Install from VSIX..." → `opencodex-vscode-0.2.0.vsix`
3. **Open sidebar**: Activity bar OpenCodex icon → Chat panel opens
4. **Create thread**: Click `+` in the header → new thread bound to workspace
5. **Attach context**: Open a file, run "OpenCodex: Attach Active File" → chip appears
6. **Send turn**: Type prompt, press Enter → streamed markdown appears live
7. **Tool steps**: When agent runs tools, collapsible steps show in chat
8. **Approvals**: Pending approvals render inline with Allow/Deny buttons
9. **Diff view**: When file changes are proposed, "View Diff" opens native VS Code diff
10. **Status bar**: Shows connection state + current model
11. **Command palette**: `Cmd+Shift+P` → "OpenCodex: Explain Code" on a selection

## Commands

| Command | Description | When |
|---|---|---|
| `OpenCodex: New Thread` | Create a thread bound to workspace | Always |
| `OpenCodex: Open Chat Panel` | Focus the chat sidebar | Always |
| `OpenCodex: Show Threads` | Quick-pick from thread list | Always |
| `OpenCodex: Send Turn` | Send a prompt to a thread | Always |
| `OpenCodex: Attach Active File` | Add file to context chips | Editor open |
| `OpenCodex: Attach Selection` | Add selection to context chips | Has selection |
| `OpenCodex: Attach Terminal Output` | Guide for terminal context | Terminal open |
| `OpenCodex: Pick File to Attach (@)` | @-mention file picker | Always |
| `OpenCodex: Approve/Deny Pending` | Respond to pending approvals | Always |
| `OpenCodex: Diff — Approve Change` | Approve a changed-file diff | Always |
| `OpenCodex: Diff — Revert Change` | Revert a changed-file diff | Always |
| `OpenCodex: Check Server Health` | Verify server connection | Always |
| `OpenCodex: Explain Code` | Explain selected code | Has selection |
| `OpenCodex: Fix Code` | Fix selected code | Has selection |
| `OpenCodex: Improve Code` | Improve selected code | Has selection |

## Architecture

The extension is a thin adapter. It:
1. Reads connection config from VS Code settings
2. Makes HTTP/SSE calls to the Kun runtime (same protocol as CLI and desktop)
3. Renders results in the sidebar webview, status bar, and diff views
4. Forwards user actions (send turn, approve/deny, diff actions) as API calls

**No business logic, no state management beyond what's needed for the UI.**
Loopback-only; no outbound connections beyond localhost.

## Webview CSP

```
default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:
```

Strict CSP — no remote scripts, no external resources. Scripts served from a
local webview URI. Token never logged or sent to third parties.

## Fork Compatibility

| Platform | `engines.vscode` | Status |
|---|---|---|
| VS Code 1.85+ | `^1.85.0` | ✅ Supported |
| VSCodium 1.85+ | `^1.85.0` | ✅ Supported |
| Cursor | `^1.85.0` | ✅ Supported |
| Antigravity | `^1.85.0` | ⚠️ See PUBLISHING.md |

Antigravity extension host hang documented in PUBLISHING.md with root cause
analysis. Workaround: reload window after first activation (no code-level
settings shipped).

## Configuration

| Setting | Default | Description |
|---|---|---|
| `opencodex.host` | `127.0.0.1` | Kun server host |
| `opencodex.port` | `18999` | Kun server port |
| `opencodex.token` | (empty) | Local auth token |

## Tests

```bash
npm test
```

40 tests across 5 suites:
- **client.test.ts** (9 tests) — protocol client: health, threads, turns, approvals, file changes, model state
- **sidebar.test.ts** (20 tests) — SSE parser: all Kun event types including text deltas, tool calls, approvals, file changes, plan mode, errors
- **workspace.test.ts** (5 tests) — workspace filtering and labeling
- **manifest.test.ts** (1 test) — publisher identity validation
- **context.test.ts** (3 tests) — context gathering shape

## Limitations

- No inline completions/autocomplete (out of scope for M3)
- No JetBrains support
- Marketplace publishing is operator-only (tokens required)
- Antigravity has a known extension host incompatibility (documented in PUBLISHING.md)
