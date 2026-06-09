# Phase 3 Prompt: Subagents And Swarm Workflows

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `high`
- Why: subagents multiply cost, tool access, context use, and safety risk. The
  phase needs strong budget enforcement and runtime-level controls.
- Cheap child model default in product: `gpt-5.4-mini`, reasoning `medium`.
- Cheap inventory lanes: `gpt-5.4-mini`, reasoning `low` or `medium`.

## Paste-Ready Goal

```text
/goal Phase 3: Subagents and Swarm Workflows

Run from the OpenCodex Desktop repository root.

Objective:
Enable Kun's existing delegate_task capability through safe settings and
budgeted workflow presets. Keep Kun as the only execution kernel. Add cheap
child model defaults, hard budgets, workflow presets, UI controls, and parent
usage aggregation.

Model:
Use gpt-5.5 with reasoning high. Default child-agent model in product settings
to a cheaper configured model such as gpt-5.4-mini medium when available.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/ENGINE_AUDIT_KUN.md
- docs/REFERENCE_INTAKE.md
- docs/PHASE_3_SUBAGENTS_SWARM_SPEC.md if present
- Phase 1 and Phase 2 specs/reports
- Kun delegation runtime, tool provider, usage telemetry, settings sync, and
  renderer event mapping code

Scope allowed:
- Kun subagent capabilities/config
- delegate_task provider/runtime enforcement
- Child usage/cost/cache rollups
- Settings schema/UI/locales
- Runtime events and diagnostics
- Focused tests and Phase 3 docs/report

Scope forbidden:
- Do not create an unbounded swarm.
- Do not bypass Kun permissions, tools, or usage telemetry.
- Do not run external child processes as a second runtime.
- Do not let renderer state enforce budgets by itself.
- Do not push unless explicitly requested.

Required behavior:
1. Add subagent enable/disable settings.
2. Add cheap child model default.
3. Add budgets: max parallel agents, max child runs, token cap, cost cap, and
   child timeout.
4. Add workflow presets: review swarm, implementation split, research split,
   and audit split.
5. Enforce budgets inside Kun before child dispatch.
6. Aggregate child-agent cost and usage into parent thread usage.
7. Show child lifecycle events and summaries in the UI.

Verification:
- Config parsing and settings normalization tests.
- Budget enforcement tests.
- delegate_task integration tests.
- Usage aggregation tests.
- Renderer event/settings tests.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- Subagents are opt-in, budgeted, visible, and accounted for.
- Child runs are useful workflow tools, not uncontrolled extra agents.
- Parent thread usage includes child cost and token impact.

