# OpenCodex Desktop — Harness Milestone Foundation (H-Series)

**Milestone:** v0.2.8 baseline → v0.3.0 "Complete Harness"
**Read this first in every orchestrator window. It is the keystone document.**

## Mission

Phases 0–10 plus Waves S0–W7 made OpenCodex Desktop engineering-complete as a
rebranded, multi-provider, safety-hardened DeepSeek GUI fork (841+ tests green,
unsigned packaging proven). The H-series closes the remaining gap to a
Codex / Gemini Antigravity–class agent harness:

| Gap (from Phase 10 parity matrix + engine audit) | H-phase |
|---|---|
| Arabic translation only ~11% complete | H1 |
| No cost/cache/usage telemetry pane in workbench | H2 |
| No terminal panel (Kun runs bash, UI shows nothing) | H3 |
| Planner/executor split is concept-only; no plan-mode tool isolation | H4 |
| No checkpoint-before-mutation, restore code/conversation, fork | H5 |
| Browser automation is a mock adapter; no real sidecar/evidence | H6 |
| Hooks are visible but never executed; no trust boundary | H7 |
| `/goal` evaluator + `/loop` scheduler unproven | H8 |
| CLI is a prototype dispatcher; IDE bridge is a read-only stub | H9 |
| SSH remote runner is schema/docs only | H10 |
| Upstream develop drift (Wave 8A/8C/8D) unported | H11 |
| Parity matrix, security review, v0.3.0 readiness | H12 |

## Orchestrator / Worker Model

- **Orchestrator:** Codex (`gpt-5.5`, reasoning `high`) or Claude Code. The
  orchestrator plans, dispatches, verifies, merges, commits, and updates the
  ledger. It does **not** build, except where a phase is marked
  `actor: orchestrator`.
- **Workers:** pidev (`pi`) sessions via the pidev-dispatch wrapper
  (vendor it from `~/180x-skool/tools/pidev-dispatch/` into
  `tools/pidev-dispatch/` during H0). Default worker model:
  **`deepseek-v4-pro`**, reasoning **medium**.

### Model routing (locked)

| Work | Flag |
|---|---|
| Default implementation | (none) — deepseek-v4-pro, medium |
| Kernel/Kun loop, security, hooks execution, browser sidecar, SSH, plan-mode isolation | `--max` |
| Renderer panes, schedulers, CLI/IDE clients | `--thinking high` |
| Mechanical key sweeps, formatting | `--cheap` (v4-flash) — **not** for Arabic translation quality |
| Building with Claude/Codex directly | **Never** (orchestrate/review only) |

### pidev lifecycle (per phase)

```bash
PIDEV="$(git rev-parse --show-toplevel)/tools/pidev-dispatch/scripts/pidev.sh"
"$PIDEV" preflight <session-id> <worktree-path>
"$PIDEV" dispatch  <session-id> "<Short Launcher Prompt from the phase doc>" --cwd <worktree-path> [--max|--thinking high|--cheap]
"$PIDEV" wait      <session-id> 3600        # run via background shell
"$PIDEV" diff      <session-id>             # never trust self-report
"$PIDEV" cost      <session-id>             # record in OC_BUILD_LOG.md
"$PIDEV" report    <session-id>
"$PIDEV" order     <session-id> "<correction>"   # same session, full context
```

- Session id convention: `oc-h<N>-<slug>` (e.g. `oc-h1-arabic`). Fresh attempt
  = fresh id; steering = `order` on the same id.
- `wait` exit 3 + `DIED_MID_RUN` → `order "<id>" "continue and finish; emit READY_FOR_ORCHESTRATOR_REVIEW"`.
- `wait` exit 3 + `EMPTY_OR_INSTANT_RUN` → retry once with fresh id, then stop.
- Every launcher prompt must require the worker to end with
  `READY_FOR_ORCHESTRATOR_REVIEW` plus: changed files, exact test commands and
  results, surfaces implemented, gaps, tree state.

### Parallelism (locked)

- **Never two workers in one tree.** Parallel lanes run in separate git
  worktrees on phase branches:

```bash
git worktree add ../ocx-h1 -b phase/h1-arabic
git worktree add ../ocx-h2 -b phase/h2-telemetry
```

- The orchestrator merges lanes back to `main` **sequentially**, running the
  full gate after each merge, then removes the worktree.
- Lanes in the same wave are chosen to touch disjoint surfaces; if a merge
  conflicts, the orchestrator resolves it — never a second worker in the tree.

## Locked Architecture Rules

1. **Kun is the only runtime.** New capabilities go through Kun contracts,
   config, adapters, and settings under `agents.kun`. No second agent loop.
2. **Shared services/contracts.** UI, CLI, IDE, MCP, and app-server surfaces
   call the same services — no duplicated business logic.
3. **Three first-class languages.** Every user-visible string is an i18n key
   present in `src/renderer/src/locales/{en,zh,ar}/`. The locale-coverage test
   must pass. RTL-safe logical CSS only (`text-start/end`, `ms-*`/`me-*`);
   `<bdi>` for mixed-direction text.
4. **Safety gates are non-negotiable.** Any new tool execution path (terminal,
   hooks, browser, SSH) must flow through approval policy, budgets, audit
   events, and sandbox/permission settings. Disabled-by-default for anything
   that touches the OS, network, or other apps.
5. **Loopback-only listeners** unless the phase doc explicitly authorizes
   otherwise (H10 is outbound-only SSH; still no public listener).
6. **No secrets** in code, docs, tests, fixtures, prompts, or transcripts.
   Redaction patterns from Phase 1 apply everywhere.
7. **Preserve upstream attribution** and the DeepSeek GUI sync path. No
   personal branding on product surfaces.

## Definition of Done (every phase)

All of the following, run inside the phase worktree, must pass before the
orchestrator merges:

```bash
npm run typecheck
npm run lint
npm test
npm --prefix kun run typecheck
npm --prefix kun run test
npm run build
git diff --check
```

Plus the phase doc's **Stop Gates** (content greps, behavior proofs). Gates
are failures: a nonzero exit is STOP, never "pre-existing".

## Ledger

`docs/phases/OC_BUILD_LOG.md` is the resumable state. After every phase the
orchestrator records: session id, model/reasoning, status, cost ($ / tokens /
cache-hit %), verification result, merge commit, notes. If context resets,
read this foundation doc + the ledger + `PHASE_RUNNER.md` and resume.

## Read-First Stack (for every worker prompt)

1. This document.
2. `docs/phases/PHASE_RUNNER.md` (where the phase sits).
3. The phase doc itself.
4. `docs/AGENTS.md`, `docs/kun-architecture.md`, `kun/README.md`.
5. Phase-specific specs listed in each doc's Read First section.
