# Phase 3.5 Prompt: Goal, Loop, And Automations

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `extra high`
- Why: `/goal` and `/loop` affect autonomous continuation, scheduling,
  interruption, restart behavior, cost caps, and safety. This needs deep kernel
  reasoning and careful state-machine design.
- Cheap evaluator model in product: configurable cheap model such as
  `gpt-5.4-mini`, reasoning `low` or `medium`, for goal-completion checks only
  when tool-free evaluation is safe.

## Paste-Ready Goal

```text
/goal Phase 3.5: Goal, Loop, and Automations

Run from the OpenCodex Desktop repository root.

Objective:
Add independent OpenCodex equivalents of Codex/Claude-style /goal and /loop.
/goal is condition-driven continuation until a measurable done condition is
met or a budget/stop gate triggers. /loop is scheduled recurring prompts, not
infinite continuation. Add thread automations that can reuse these primitives.

Model:
Use gpt-5.5 with reasoning extra high. Use a cheap configured evaluator model
only for tool-free goal-completion judgment after each turn.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/ENGINE_AUDIT_KUN.md
- docs/DESKTOP_UX_BENCHMARK.md
- docs/PHASE_3_SUBAGENTS_SWARM_SPEC.md
- current Kun loop, steering queue, session/event store, usage, approvals, and
  Electron schedule runtime code

Scope allowed:
- Kun contracts/events for goals, loops, and scheduled automations
- Goal state persistence and evaluator adapter
- Loop scheduler state and list/cancel controls
- Settings/UI/locale controls
- Tests and Phase 3.5 docs/report

Scope forbidden:
- Do not implement /loop as raw infinite continuation.
- Do not allow scheduled tasks to bypass permissions or budgets.
- Do not run tools from the goal evaluator.
- Do not silently resume expired or canceled tasks.
- Do not push unless explicitly requested.

Required behavior:
1. Add one active goal per thread/session with condition text, status, budget,
   evaluator result, and continuation count.
2. After each turn, run a small tool-free evaluator that decides done/not done
   from transcript evidence and emits a reason.
3. Continue automatically only when the goal is not done, budgets allow it, and
   no stop gate is active.
4. Add /loop scheduling with interval, prompt, next run, expiry, list, cancel,
   and pause behavior.
5. Support default loop prompt from .opencodex/loop.md or user config when
   present.
6. Add thread automations that can wake the same thread or run a standalone
   project task with explicit execution mode.
7. Track usage and cost for continued and scheduled turns.

Verification:
- Goal state/evaluator tests.
- Continuation budget and stop-gate tests.
- Scheduler list/cancel/expiry tests.
- Resume/restart persistence tests.
- Permission and approval tests for scheduled prompts.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- `/goal` can keep working toward a measurable condition without becoming an
  uncontrolled loop.
- `/loop` schedules recurring prompts and can be listed, canceled, resumed, and
  expired.
- Automations are visible, budgeted, and permission-aware.

