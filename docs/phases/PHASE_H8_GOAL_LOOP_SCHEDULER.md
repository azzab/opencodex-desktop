# Phase H8: Goal Evaluator And Loop Scheduler Completion

## Window And Model
- pi · `deepseek-v4-pro` · `--thinking high` · session `oc-h8-goal-loop` · worktree `../ocx-h8`

## Goal
Finish Phase 3.5: a **tool-free, budgeted goal evaluator** that drives
condition-based continuation toward a measurable done state, and a **loop
scheduler** for recurring prompts with list/cancel/expiry/resume and usage
accounting. Automations must never bypass permissions, budgets, approvals, or
audit. After H8, `/goal` and `/loop` are proven features, not concepts.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/prompts/PHASE_3_5_GOAL_LOOP_AUTOMATIONS.md` (original requirements)
3. Existing goal-style continuation in the Kun loop; scheduled-task detector (`src/main/claw-scheduled-task-detector.ts`)
4. Phase 3 budget machinery (token/cost caps)

## Scope
### Goal evaluator
- Goal = measurable done condition attached to a thread. After each turn, a
  **tool-free** evaluator call (cheap model from Phase 3 child-model setting)
  judges: done / continue / blocked, with reason. Evaluator has its own
  token/cost budget and max-iteration cap; exceeding either stops continuation
  with an audited event and a user-visible "needs attention" state.
- Continuation turns are normal turns: all approval/sandbox/budget rules apply.

### Loop scheduler
- Recurring prompt schedule: interval or cron-like spec, scoped to a project +
  thread template. Persisted; survives restart; respects app-not-running
  (catch-up policy: skip, never burst).
- Management: list, pause, cancel, expiry (end date / max runs), per-loop
  usage accounting rolled into telemetry (H2 pane shows it).
- Loops never run while another turn is active on the thread (queue or skip,
  configurable).

### Renderer
- Goal status chip on thread (active/evaluating/done/blocked + budget meter).
- Loops manager view: list with next-run, last result, usage, pause/cancel.

## Surfaces to Build (REQUIRED)
- Kun contracts + evaluator + scheduler services + persistence + tests.
- IPC/app-server protocol additions.
- Goal chip + Loops manager UI (all states), settings under `agents.kun.automations`.

## UI rules (BLOCKING)
- i18n en+zh+ar; RTL-safe.
- Evaluator is tool-free by construction (no tool registry passed) — test-asserted.
- No automation may mutate without the same approval gates as a live user turn.

## Out Of Scope
- External triggers (webhooks, email) — connector work is a later milestone.
- Remote/relay execution of loops.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
```

## Stop Gates
- Test: goal continues until a fake evaluator returns done; iteration cap and budget cap each stop continuation with audit.
- Test: evaluator invocation has no tools available (assert empty registry).
- Test: loop fires on schedule (fake timers), persists across simulated restart, respects expiry and cancel, accounts usage.
- Manual proof in dev app: create a loop, see it listed with next-run; cancel works.

## Git Commit Message
`feat(automations): tool-free budgeted goal evaluator and persistent loop scheduler with usage accounting`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H8_GOAL_LOOP_SCHEDULER.md. Implement the tool-free budgeted goal evaluator (done/continue/blocked with iteration + token/cost caps, audited stops) and the persistent loop scheduler (interval/cron spec, list/pause/cancel/expiry/resume, skip-not-burst catch-up, per-loop usage accounting), plus goal status chip and loops manager UI, settings under agents.kun.automations, and protocol additions. Automations must pass through the same approval/budget/audit gates as user turns. Run the full verification block; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, cap/persistence test evidence, tests + results, and gaps.
