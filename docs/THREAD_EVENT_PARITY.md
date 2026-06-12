# Thread/Event Parity — Desktop, CLI, IDE

Status: H9 protocol parity documentation.

All three surfaces (Electron desktop, opencodex CLI, VS Code extension) operate
on the same thread, turn, event, and approval model backed by Kun. This document
describes the parity guarantees.

## Core Principle

Every client is a **thin adapter**. No client owns threads, turns, approvals,
usage counters, skills, hooks, memory, MCP registries, or automation policies.
The Kun runtime is the single source of truth for all of these.

```text
┌─────────────┐  ┌──────────┐  ┌──────────────┐
│ Desktop     │  │ CLI      │  │ VS Code IDE  │
│ (Electron)  │  │ (Node)   │  │ (Extension)  │
└──────┬──────┘  └────┬─────┘  └──────┬───────┘
       │              │               │
       └──────────────┼───────────────┘
                      │  HTTP/SSE
               ┌──────┴──────┐
               │  Kun Runtime│
               │  (single    │
               │   source)   │
               └─────────────┘
```

## Thread Model — Identical Across All Surfaces

| Property         | Desktop          | CLI               | VS Code           |
|------------------|------------------|-------------------|-------------------|
| Thread ID        | `thr_*`          | `thr_*`           | `thr_*`           |
| Create path      | IPC → bridge     | `POST /v1/threads`| `POST /v1/threads`|
| List path        | IPC → bridge     | `GET /v1/threads` | `GET /v1/threads` |
| Workspace root   | Yes              | Yes               | Yes               |
| Model selection  | Yes              | Yes               | Yes               |
| Mode (agent/plan)| Yes              | Yes               | Yes               |
| Status lifecycle | idle/running     | idle/running      | idle/running      |

## Turn Model — Identical Across All Surfaces

| Property         | Desktop          | CLI               | VS Code           |
|------------------|------------------|-------------------|-------------------|
| Turn ID          | `turn_*`         | `turn_*`          | `turn_*`          |
| Send path        | IPC → bridge     | `POST /v1/threads/{id}/turns` | Same |
| Status (queued/running/completed/failed/aborted) | Full support | Full support | Full support |
| Streaming SSE    | Electron IPC → renderer | Node fetch → ReadableStream | Node fetch → ReadableStream |

## Event Stream — Identical SSE Protocol

All three surfaces consume the same SSE event stream from
`GET /v1/threads/{id}/events`.

### Event Kinds (Common)

| Kind                     | Desktop | CLI | VS Code | Description                    |
|--------------------------|---------|-----|---------|--------------------------------|
| `assistant_text_delta`   | ✓       | ✓   | ✓       | Streaming text chunk           |
| `turn_status`            | ✓       | ✓   | ✓       | Turn lifecycle change          |
| `tool_call`              | ✓       | ✓   | ✓       | Tool invocation                |
| `tool_result`            | ✓       | ✓   | ✓       | Tool output                    |
| `approval_required`      | ✓       | ✓   | ✓       | Tool needs approval            |
| `approval_resolved`      | ✓       | ✓   | ✓       | Approval decided               |
| `error`                  | ✓       | ✓   | ✓       | Turn error                     |
| `turn_completed`         | ✓       | ✓   | ✓       | Terminal marker                |
| `turn_failed`            | ✓       | ✓   | ✓       | Terminal failure marker        |

### Event Processing

- **Desktop**: Events arrive via Electron IPC main→renderer, dispatched to
  the transcript component which updates the React state in real time.
- **CLI**: Events arrive via Node `fetch` → `ReadableStream` → SSE parser.
  Each event is formatted to stdout (text deltas, tool calls, errors).
- **VS Code**: Events arrive via Node `fetch` → `ReadableStream` → SSE parser.
  Each event is posted to the webview as `{command: 'event', ...}` messages.
  The webview script appends streaming text deltas in real time.

## Approval Model — Identical Across All Surfaces

| Operation        | Desktop                | CLI                        | VS Code                 |
|------------------|------------------------|----------------------------|-------------------------|
| Receive approval | SSE event stream       | SSE event stream           | SSE event stream        |
| List pending     | Thread events view     | `opencodex approve list --thread <id>` | Sidebar polls events |
| Allow            | UI button              | `opencodex approve allow <id>` | QuickPick + button   |
| Deny             | UI button              | `opencodex approve deny <id>`  | QuickPick + button   |
| Endpoint         | `POST /v1/approvals/{id}` | Same                    | Same                    |

Approvals are thread-scoped and flow through the same event stream. The desktop
shows them inline in the transcript; the CLI formats them as `[APPROVAL ...]`;
the VS Code sidebar shows them in the approvals section with Allow/Deny buttons.

## Session/Thread Lifecycle

1. **Start**: Create a thread (`POST /v1/threads`), optionally with an initial prompt.
2. **Resume**: `POST /v1/sessions/{id}/resume-thread` (Kun session management).
3. **Fork**: `POST /v1/threads/{id}/fork` creates a branch with shared parent history.
4. **Steer**: `POST /v1/threads/{id}/turns/{turn}/steer` for mid-turn guidance.
5. **Compact**: `POST /v1/threads/{id}/compact` triggers context compaction.
6. **Events**: Long-lived SSE connection for real-time turn streaming.

## Protocol Version

All surfaces negotiate protocol v1 with the Kun runtime. The health endpoint
(`GET /health`) returns the protocol version. Clients should check compatibility.

## Testing Parity

```bash
# Desktop gate
npm run typecheck && npm run lint && npm test && npm --prefix kun run typecheck && npm --prefix kun run test && npm run build && git diff --check

# CLI smoke (proves protocol path)
node scripts/cli-smoke.cjs

# Kun runtime smoke (proves SSE streaming)
node scripts/kun-smoke.cjs

# Client unit tests
cd clients/cli && npm test
cd clients/vscode && npm test
```

## Gaps

- **Approval listing without threadId**: Approvals are surfaced through the
  thread event stream. The CLI `approve list` command requires a `--thread`
  flag because there is no global approvals listing endpoint in Kun.
- **VS Code streaming**: The VS Code sidebar streams events to the webview
  but does not persist transcript history between extension sessions. A
  `GET /v1/threads/{id}/turns/{turnId}` endpoint exists for replay.
- **Desktop ↔ CLI ↔ IDE session sharing**: Threads are accessible by ID from
  any client, but concurrent access to the same thread is not serialized
  (Kun handles one turn at a time per thread).

## Future

- **Standalone CLI binary**: Package as a single executable via `pkg` or
  `esbuild` bundle.
- **IDE context sync**: `src/shared/ide-bridge.ts` already defines the
  read-only IDE context stub (workspace root, active file, selections,
  diagnostics). Future integration would sync this context to improve
  prompts and evidence.
- **Browser/mobile access**: Requires a host-mediated relay for loopback-only
  auth. The `APP_SERVER_PROTOCOL.md` documents this boundary.
