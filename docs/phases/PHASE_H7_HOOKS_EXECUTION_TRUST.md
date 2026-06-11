# Phase H7: Hook Execution With Trust Boundary

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-h7-hooks` · worktree `../ocx-h7`
- Security-sensitive: executing user-supplied code on lifecycle events.

## Goal
Phase 7 made hooks *visible*; H7 makes them *run* — safely. Execute lifecycle
hooks (pre-tool, post-tool, permission-request, user-prompt-submit, session
start/end) only after explicit per-hook trust review with content pinning,
with timeouts, audit, and a kill switch. This unlocks Claude-Code-style hook
automation without silent dotfile execution.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/PHASE_7_SKILLS_PLUGINS_HOOKS_MEMORY_REPORT.md` (hook lifecycle model + deferred trust audit)
3. Hook discovery/diagnostics services from Phase 7
4. Phase 1 redaction utilities

## Scope
### Trust model
- A hook is **untrusted** until the user reviews its source in-app and
  approves it; approval pins a content hash. If the file changes, trust is
  revoked automatically and the hook is disabled until re-reviewed (audited).
- Trust decisions are per-scope (user vs project) and stored under
  `agents.kun.hooks`; project hooks can never silently gain user-scope trust.
- Master kill switch: disable all hook execution instantly (setting + audit).

### Execution
- Hook runner in the main process / Kun host: spawn with the documented JSON
  stdin/stdout convention, hard timeout (configurable, default ~10s),
  captured output size limit, working dir = project, env filtered through
  redaction-aware allowlist (no raw provider keys).
- Hook results can: annotate context, allow/deny the gated action
  (permission-request and pre-tool hooks), or be informational. Deny-by-hook
  is audited with the hook id.
- Every execution emits an audit event (hook id, event, duration, exit code).

### Renderer
- Extend the Phase 7 hooks browser: trust state, review-source dialog with
  approve/revoke, last-run status, kill switch.

## Surfaces to Build (REQUIRED)
- Hook trust store + runner + contracts + tests (including hash-revocation test).
- IPC additions.
- Hooks browser UI extensions (review dialog, trust badges, kill switch) with all states.

## UI rules (BLOCKING)
- i18n en+zh+ar; RTL-safe; source viewer is LTR monospace.
- Untrusted or hash-mismatched hooks must be provably inert (kernel-level skip, not UI hiding).
- No hook output is ever fed to the model without the redaction pass.

## Out Of Scope
- Plugin code execution beyond hooks; marketplace/distribution.
- Sandboxed interpreters (document as future hardening).

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
```

## Stop Gates
- Test: untrusted hook never executes; trusted hook executes; edited trusted hook is auto-revoked and does not execute.
- Test: pre-tool deny hook blocks the tool call with audit trail.
- Test: runaway hook (sleep > timeout) is killed; turn continues with a warning event.
- Kill switch proof: with hooks mid-config, master switch off → zero executions.
- Manual proof: review dialog shows real source; approve → runs; revoke → stops.

## Git Commit Message
`feat(hooks): executable lifecycle hooks behind per-hook trust review with hash pinning, timeouts, audit, and kill switch`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H7_HOOKS_EXECUTION_TRUST.md. Implement hook execution for the Phase 7 lifecycle events behind a trust boundary: per-hook user review with content-hash pinning and auto-revocation on change, scope-separated trust under agents.kun.hooks, hard timeouts and output limits, redaction-filtered env, allow/deny semantics for pre-tool and permission-request hooks, audit on every run, master kill switch, and the hooks-browser UI extensions. Untrusted hooks must be kernel-inert. Run the full verification block; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, the revocation/timeout/kill-switch test evidence, tests + results, and gaps.
