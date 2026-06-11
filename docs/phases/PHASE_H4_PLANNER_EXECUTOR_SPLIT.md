# Phase H4: Planner/Executor Split With Plan-Mode Tool Isolation

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-h4-planner` · worktree `../ocx-h4`
- Kernel + security-sensitive: tool gating inside the Kun loop.

## Goal
Turn the existing plan/goal concepts into a true planner/executor split: a
**plan mode** where the Kun loop can only use read-only tools, an explicit
user-approved transition into **execute mode**, and plan/task state that
survives app restart. This also ports the upstream Wave-8B "plan-mode tool
isolation" intent identified in the drift audit. After H4, planning can never
mutate the workspace.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md` (Wave 8B classification; review `upstream/develop` commits for the plan isolation approach before re-implementing)
3. `kun/src/services/thread-service.ts`, the Kun loop, and tool registration in `kun/src/adapters/tool/`
4. `docs/ENGINE_AUDIT_KUN.md` (checkpoint/permission gap notes)

## Scope
### Kun kernel
- Mode field on a turn/thread: `plan` | `execute`. In `plan` mode the tool
  registry exposes only read-only tools (read file, search, list, git status/
  diff read, MCP read-class tools); every mutating tool (write, edit, exec,
  delegate with mutation, automation) is absent or hard-denied with an audit
  event — enforced **in the kernel**, not by prompt text.
- Plan artifact: structured plan (steps, files, risks, verification) persisted
  with the thread; survives restart; updatable in later plan turns.
- Transition `plan → execute` requires an explicit approval event (existing
  approval policy machinery); the approved plan is attached to the executing
  turn context.

### Renderer
- Mode toggle on the composer (plan/execute) with clear state.
- Plan view: rendered plan artifact with approve-and-execute action.
- Todo/task state already in TodoPanel must reflect plan steps and persist.

## Surfaces to Build (REQUIRED)
- Kun contracts + loop enforcement + tests (attempted mutation in plan mode → denied + audited).
- `src/renderer/src/components/` plan mode toggle + plan artifact view (states: empty/drafting/ready/approved).
- IPC/app-server protocol additions so CLI/IDE clients (H9) inherit plan mode for free.

## UI rules (BLOCKING)
- i18n keys in en+zh+ar; RTL-safe.
- Kernel-enforced gating only — a system-prompt instruction is NOT isolation.
- Approval, budget, and audit paths reused, not duplicated.

## Out Of Scope
- Checkpoint/rewind (H5).
- Multi-plan branching/forks (H5 covers fork-from-checkpoint).
- Auto-execution without approval.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
```

## Stop Gates
- Kernel test: a plan-mode turn that calls a write/exec tool is denied with an audit event; the file system is untouched (assert by hash).
- Plan artifact survives full app restart (test via thread store reload).
- Transition without approval is impossible via API (test the app-server path too, not just the UI).
- Mode state is visible in thread events so all clients can render it.

## Git Commit Message
`feat(kun): planner/executor split with kernel-enforced plan-mode tool isolation and persistent plan artifacts`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H4_PLANNER_EXECUTOR_SPLIT.md. Implement plan/execute modes in the Kun kernel: plan mode exposes only read-only tools (enforced in the tool registry/loop, denied calls audited), structured plan artifact persisted with the thread across restarts, plan→execute transition gated by an explicit approval event, renderer mode toggle + plan view, protocol additions for non-UI clients. Prompt-level "please don't write" is NOT acceptable isolation. Run the full verification block; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, the denial test evidence, tests + results, and gaps.
