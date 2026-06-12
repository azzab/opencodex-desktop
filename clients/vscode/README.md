# OpenCodex VS Code Extension

A thin app-server protocol adapter for the Kun runtime. No business logic —
the extension calls Kun via HTTP/SSE and renders the response in VS Code.

## Build & Package Proof

```bash
cd clients/vscode
npm install        # one-time
npm run build      # → dist/extension.js + dist/client.js + dist/sidebar.js + dist/status.js
npm run package    # → opencodex-vscode-0.1.0.vsix
```

The `.vsix` is a valid VS Code extension package produced by `@vscode/vsce`.
It contains the compiled JavaScript, `package.json`, and the webview HTML sidebar.

### Verification

```bash
# TypeScript compiles cleanly
npm run typecheck
# → exit 0

# Tests pass (mocked protocol client against Kun HTTP contract)
npm test
# → all tests pass with mocked fetch

# Package is produced
ls -la opencodex-vscode-0.1.0.vsix
# → regular file, ~15-30KB
```

### Git cleanliness
- `dist/` → gitignored (clients/vscode/.gitignore)
- `*.vsix` → gitignored (clients/vscode/.gitignore)
- `node_modules/` → gitignored
- No generated files are tracked in source control

## Manual Smoke Test (Operator-Only)

**Prerequisite: A real VS Code instance is required.** If unavailable, this is an
operator-only gap — the extension has been built, packaged, and tested with
mocked protocol responses, but driving a live turn requires:

1. A running Kun server (`opencodex serve` or desktop app)
2. VS Code with the extension installed from the `.vsix`
3. A configured model with a valid API key

### Smoke procedure

1. **Start Kun**: `opencodex serve --port 18999 --data-dir /tmp/ocx-vscode-smoke --insecure`
2. **Install extension**: In VS Code, Extensions → `...` → "Install from VSIX..." → select `opencodex-vscode-0.1.0.vsix`
3. **Verify sidebar**: Open the OpenCodex sidebar from the activity bar → should show "Connected" status and thread list
4. **Create a thread**: Use the CLI or desktop app to create a thread, then refresh the sidebar
5. **Select thread**: Click a thread → transcript loads
6. **Send a turn**: Type a prompt and click "Send" → turn is sent via HTTP POST, SSE events stream live to the webview
7. **Status bar**: Bottom-right shows `✓ OpenCodex` (green check)
8. **Health command**: `Cmd+Shift+P` → "OpenCodex: Check Server Health" → shows protocol version
9. **Approvals**: If a pending approval exists, it appears in the Approvals section with Allow/Deny buttons
10. **Send Turn command**: `Cmd+Shift+P` → "OpenCodex: Send Turn" → enter thread ID and prompt

## Features

### Thread Sidebar
Open the OpenCodex sidebar from the activity bar. Shows:
- Thread list with status and mode
- Active thread transcript
- Pending approvals with Allow/Deny buttons
- Send prompt input

### Commands (Command Palette)

| Command                      | Description                    |
|------------------------------|--------------------------------|
| `OpenCodex: Show Threads`    | Pick a thread from the list    |
| `OpenCodex: Send Turn`       | Send a prompt to a thread      |
| `OpenCodex: Approve/Deny`    | Respond to pending approvals   |
| `OpenCodex: Check Server Health` | Verify server connection    |

### Status Bar
Shows connection status in the bottom-right status bar:
- `✓ OpenCodex` — connected
- `⊗ OpenCodex` — disconnected/error

### Configuration

| Setting              | Default       | Description        |
|----------------------|---------------|--------------------|
| `opencodex.host`     | `127.0.0.1`   | Kun server host    |
| `opencodex.port`     | `18999`       | Kun server port    |
| `opencodex.token`    | (empty)       | Local auth token   |

## Architecture

The extension is a thin adapter. It:
1. Reads connection config from VS Code settings
2. Makes HTTP/SSE calls to the Kun runtime (same protocol as CLI and desktop)
3. Renders results in the sidebar webview and status bar
4. Forwards user actions (send turn, approve/deny) as API calls

No business logic, no state management beyond what's needed for the UI.
Loopback-only; no outbound connections beyond localhost.

## Thread/Event Parity with CLI and Desktop

All three clients (desktop, CLI, VS Code) consume the same Kun SSE event stream
via `GET /v1/threads/{id}/events`. The event wire format is identical:

- `assistant_text_delta` — streaming text chunks
- `tool_call` — tool invocation
- `turn_completed` / `turn_failed` — terminal events
- `approval_required` — pending approval
- `approval_resolved` — approval decided

The VS Code sidebar webview parses SSE events identically to the CLI's
`streamSseEvents` function (same parser: split on `\n\n`, extract `data:` lines,
JSON-parse). The desktop renderer uses the same event bus via IPC bridge to the
same Kun server. All three clients are thin protocol adapters with zero business
logic — the event model is defined once in Kun and consumed uniformly.

## Tests

```bash
npm test
```

Tests cover the protocol client operations against mocked HTTP responses:
health checks, thread listing, turn sending, approval management.

## Limitations (MVP Scope)

- Read + turn only; no settings mutation from the IDE
- No inline completions
- No marketplace publishing
- Agent mode only (plan mode shown but not full workflow)
- Streaming events are not yet wired to live transcript updates
