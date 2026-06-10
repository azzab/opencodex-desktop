# OpenCodex App-Server Protocol

Status: Phase 8 internal protocol contract.

This protocol is an adapter layer over Kun. It does not create a second session
store, approval system, usage counter, skill runtime, hook runtime, memory store,
or MCP registry. Electron, CLI, IDE, browser, mobile, and future relay clients
must enter through the same Kun-owned thread, turn, event, approval, attachment,
memory, skill, MCP, usage, and automation boundaries.

## Boundary

```text
external client
  -> app-server protocol adapter
  -> Electron main / trusted host service
  -> Kun HTTP/SSE
  -> Kun stores, loop, tools, approvals, usage, Skills, MCP, memory
```

The adapter may translate names, validate auth, and redact notifications. It
must not execute tools, own approvals, or persist a parallel thread model.

## Auth Model

- Clients are loopback-only in this phase.
- A local token is required when configured.
- Non-loopback clients are rejected before any Kun request.
- Browser, mobile, and remote-relay clients remain future compatibility clients;
  they must use an explicit host-mediated relay design before network exposure.

## Protocol Objects

`src/shared/app-server-protocol.ts` defines versioned objects for:

- project;
- thread;
- turn;
- item;
- tool call;
- approval;
- artifact;
- usage;
- goal;
- loop;
- subagent;
- automation event;
- streamed notification.

Notifications support opt-out categories and default to metadata redaction.
Thread event streaming maps to Kun SSE through `/v1/threads/{id}/events`.

## Bridge Operations

`src/main/services/app-server-bridge.ts` maps Phase 8 operations to existing Kun
routes:

| App-server operation | Kun owner |
|---|---|
| `health` | `/health` |
| `projects` | Electron host workspace metadata |
| `threads` | `GET /v1/threads` |
| `start` | `POST /v1/threads`, optional `POST /v1/threads/{id}/turns` |
| `resume` | `POST /v1/sessions/{id}/resume-thread` |
| `fork` | `POST /v1/threads/{id}/fork` |
| `steer` | `POST /v1/threads/{id}/turns/{turn}/steer` |
| `notifications` | `GET /v1/threads/{id}/events` |

## CLI Bridge

`src/main/services/app-server-cli.ts` is a prototype command dispatcher. It
parses commands and returns structured JSON:

```bash
health
projects
threads --limit 20 --search phase
start --workspace /repo --title "Phase 8" --mode agent --prompt "Start work"
resume --session sess_123 --workspace /repo
steer --thread thr_123 --turn turn_123 --text "Narrow the scope"
```

Packaging this as an executable is a later product decision. The dispatcher is
kept as a tested service so it can be reused by Electron, a bundled CLI, or an
IDE extension host without adding another runtime.

## IDE Bridge

`src/shared/ide-bridge.ts` defines a read-only IDE context sync stub:

- workspace root;
- IDE surface id;
- active file;
- open files;
- selections;
- diagnostics digest.

The Phase 8 stub explicitly cannot mutate files or execute IDE commands.
Future IDE integrations should use this context to improve prompts and evidence,
then route all thread actions through the app-server bridge.

## Compatibility Notes

- Electron: already has typed IPC and Kun runtime request forwarding.
- CLI: uses the service dispatcher and local token/loopback auth.
- IDE: can sync context later without direct mutation rights.
- Browser/mobile: should consume metadata and approval/steering commands only
  through a future host-mediated relay.
- Remote relay: must preserve host-owned approvals, usage, Skills, MCP, memory,
  hooks, and automation permissions.

## Verification

Run:

```bash
npm test -- src/shared/app-server-protocol.test.ts src/main/services/app-server-bridge.test.ts src/main/services/app-server-cli.test.ts src/shared/ide-bridge.test.ts
npm run typecheck
npm test
npm run build
git diff --check
```
