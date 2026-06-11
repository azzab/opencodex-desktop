# Phase H3: Managed Terminal Panel

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-h3-terminal` · worktree `../ocx-h3`
- Security-sensitive: command execution surface.

## Goal
Give the workbench a real terminal surface: show the commands Kun's local tool
host runs (live output streaming), and let the user open their own managed PTY
sessions in the project directory. Everything flows through the existing
approval/sandbox policy and emits audit events. After H3, "what is the agent
running right now" is visible instead of invisible.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `kun/src/adapters/tool/local-tool-host.ts` (how exec works today)
3. `docs/PHASE_4_BROWSER_AUTOMATION_SECURITY_SPEC.md` (permission/audit pattern to mirror)
4. `src/main/ipc/app-ipc-schemas.ts` (IPC schema conventions)

## Scope
### Agent command visibility
- Stream stdout/stderr of Kun tool-host executions into a terminal-style view
  per thread (read-only view of agent activity; no injection into agent shells).

### User PTY sessions
- Main-process PTY service: spawn/list/write/resize/kill managed PTY sessions
  scoped to the active project directory. Prefer `node-pty`; if adding the
  native dep breaks packaging, fall back to `child_process` + pipe mode and
  document the limitation.
- Renderer terminal pane using `@xterm/xterm`.
- Sessions are user-initiated only; the agent cannot read or write user PTY
  sessions in this phase.

### Safety
- PTY availability behind a setting under `agents.kun.terminal`
  (default ON for user sessions, OFF for any future agent access).
- Every session spawn/kill and every agent exec rendered emits an audit event.
- No shell execution outside the project working directory by default;
  honor existing sandbox mode.

## Surfaces to Build (REQUIRED)
- `src/main/services/terminal-service.ts` + tests (spawn/list/write/kill, scoping).
- IPC schema additions + preload bridge entries.
- `src/renderer/src/components/terminal/TerminalPanel.tsx` — tabs for agent-activity view + user sessions; loading/empty/error states.
- Settings toggle in `settings-section-agents.tsx` area.

## UI rules (BLOCKING)
- All strings via i18n keys in en+zh+ar; RTL-safe chrome (terminal content itself stays LTR).
- No second runtime: agent exec stays inside Kun; this panel only observes it.
- No secrets echoed into logs/audit payloads (reuse Phase 1 redaction patterns for env display).

## Out Of Scope
- Agent-driven interactive terminal control.
- Remote/SSH terminals (H10).
- Shell profile management.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
rg -n "TerminalPanel" src/renderer/src/components | head
```

## Stop Gates
- Manual proof in `npm run dev`: open a user PTY, run `pwd`, see project dir; agent turn that runs a command shows live output in the agent-activity tab.
- Killing the app reaps all PTY children (no orphan processes — prove with `ps`).
- Audit events recorded for spawn/kill.
- If `node-pty` was used: `npm run dist:mac:arm64:dmg` packaging dry-run still succeeds.

## Git Commit Message
`feat(workbench): add managed terminal panel with agent activity view and audited user PTY sessions`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H3_TERMINAL_PANEL.md. Build ALL REQUIRED surfaces: main-process terminal service (project-scoped, audited, behind agents.kun.terminal setting), IPC + preload bridge, renderer TerminalPanel with agent-activity streaming tab and user PTY tabs, settings toggle. Agent exec stays inside Kun — observe only. i18n keys in en+zh+ar; RTL-safe. Run the full verification block including packaging dry-run if you add node-pty; nonzero exits are failures. Service without the visible panel = FAILED phase. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, tests + results, orphan-process proof, and gaps.
