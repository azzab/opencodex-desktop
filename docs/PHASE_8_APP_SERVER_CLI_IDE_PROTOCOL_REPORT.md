# Phase 8 App Server, CLI Bridge, And IDE Bridge Report

Date: 2026-06-10

## Source Prompt

- `docs/prompts/PHASE_8_APP_SERVER_CLI_IDE_PROTOCOL.md`

## Implemented In This Slice

- Added the shared app-server protocol schema set in
  `src/shared/app-server-protocol.ts`.
- Added typed protocol objects for project, thread, turn, item, tool call,
  approval, artifact, usage, goal, loop, subagent, automation event, and
  streamed notification envelopes.
- Added notification category filtering with opt-out categories and metadata
  redaction defaults.
- Added a main-process app-server bridge adapter in
  `src/main/services/app-server-bridge.ts`.
- The adapter maps health, projects, threads, start, resume, fork, steer, and
  notification subscription operations onto existing Kun HTTP/SSE routes.
- Added local app-server client auth in
  `src/main/services/app-server-auth.ts` with loopback-only enforcement and
  optional local token checks.
- Added a CLI bridge prototype in `src/main/services/app-server-cli.ts` for
  health, projects, threads, start, resume, and steer commands.
- Added a read-only IDE bridge context stub in `src/shared/ide-bridge.ts` for
  future open-file and selection sync.
- Documented the protocol boundary and compatibility notes in
  `docs/APP_SERVER_PROTOCOL.md`.

## Boundary Decisions

- Kun remains the single kernel. Sessions, approvals, usage, Skills, plugins,
  hooks, rules, memory, MCP, attachments, and automation policy are not moved
  into the adapter.
- No public websocket or public app-server listener was added.
- The CLI bridge is a tested dispatcher, not a packaged binary yet.
- The IDE bridge is read-only and cannot mutate files or execute IDE commands.

## Verification

- `npm test -- src/shared/app-server-protocol.test.ts src/main/services/app-server-bridge.test.ts src/main/services/app-server-cli.test.ts src/shared/ide-bridge.test.ts`
  - PASS: 4 files, 12 tests.
- `npm run typecheck`
  - PASS: exit 0.
- `npm test`
  - PASS: 129 files, 788 tests.
- `npm run build`
  - PASS: Kun build and Electron Vite main/preload/renderer build completed.
- `git diff --check`
  - PASS: exit 0.
