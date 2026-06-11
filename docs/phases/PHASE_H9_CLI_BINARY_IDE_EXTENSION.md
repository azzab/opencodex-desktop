# Phase H9: Packaged CLI And VS Code Extension MVP

## Window And Model
- pi · `deepseek-v4-pro` · `--thinking high` · session `oc-h9-clients` · worktree `../ocx-h9`

## Goal
Turn the Phase 8 prototypes into real clients of the app-server protocol: an
installable `opencodex` CLI binary and a VS Code extension MVP. Both speak the
same protocol to the same Kun kernel (desktop app or headless Kun), proving
the one-protocol-many-clients architecture. Loopback + existing local auth
only.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/APP_SERVER_PROTOCOL.md` + `docs/PHASE_8_APP_SERVER_CLI_IDE_PROTOCOL_REPORT.md`
3. The Phase 8 CLI dispatcher prototype and IDE bridge stub
4. `kun/src/cli/serve.ts` (headless serving path)

## Scope
### CLI (`opencodex`)
- Package the dispatcher as a bin (workspace package or `kun`-adjacent
  package; `npm pack` installable; no global publish in this phase).
- Commands: `opencodex chat` (interactive turn loop with streamed events),
  `threads list/show`, `send`, `approve/deny` (pending approvals),
  `usage` (telemetry summary), `serve` (headless Kun), `--project <dir>`.
- Approval prompts render in-terminal; plan-mode state (H4) and goal status
  (H8) shown in stream output.
- Respects the local auth token; clear error when the app-server is absent.

### VS Code extension MVP (`clients/vscode/`)
- Sidebar webview: thread list + active thread transcript (streamed), send a
  turn, approve/deny approvals, open changed files from review events.
- Status bar item: connection + active turn state.
- Read+turn only; no settings mutation from the IDE in this phase.
- `vsce package` produces an installable `.vsix` (no marketplace publish).

## Surfaces to Build (REQUIRED)
- CLI package with tests (command parsing, protocol client, approval flow against a mocked/real local server).
- `clients/vscode/` extension with build + packaging script and minimal integration test (protocol client unit-tested; manual smoke documented).
- Docs: `docs/CLI.md` and `clients/vscode/README.md` (en; strings table ready for ar/zh later — CLI/IDE copy is exempt from the renderer locale test but must avoid hardcoded product claims).

## UI rules (BLOCKING)
- No business logic in clients — protocol calls only (thin adapters).
- No second runtime: CLI `serve` reuses Kun's existing serve entry.
- Auth token never logged; loopback only.

## Out Of Scope
- Marketplace/homebrew/npm publishing; auto-update for clients.
- Mobile/browser control surfaces (Phase 4.5 lane).
- IDE inline completions.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
# CLI smoke: pack, install to a temp prefix, run against a live headless serve
node -e "console.log('document CLI smoke commands actually run, with output, in the report')"
```

## Stop Gates
- End-to-end proof: `opencodex serve` (headless) + `opencodex chat` completes a real turn with streamed events and an approval round-trip.
- `.vsix` builds; manual smoke documented with the extension driving a turn against the running desktop app.
- Same thread visible from desktop UI, CLI, and IDE simultaneously (event parity).

## Git Commit Message
`feat(clients): packaged opencodex CLI and VS Code extension MVP over the app-server protocol`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H9_CLI_BINARY_IDE_EXTENSION.md. Build BOTH clients as thin app-server-protocol adapters: an installable opencodex CLI (chat/threads/send/approve/usage/serve, streamed events, in-terminal approvals, local auth) and a VS Code extension MVP under clients/vscode (thread sidebar, send turn, approvals, status bar, packaged .vsix). No business logic in clients; no new runtime; loopback only. Run the full verification block plus the documented CLI end-to-end smoke; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, smoke transcripts, tests + results, and gaps.
