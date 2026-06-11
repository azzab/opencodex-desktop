# Phase H2: Workbench Usage, Cost, And Cache Telemetry Dashboard

## Window And Model
- pi · `deepseek-v4-pro` · `--thinking high` · session `oc-h2-telemetry` · worktree `../ocx-h2`

## Goal
Surface the telemetry Kun already records (tokens, cost, cache hit/miss,
per-model spend, subagent rollups) as a first-class workbench pane and
per-thread summary, so operators see spend and cache behavior without leaving
the app. Read-only: this phase adds no new accounting logic.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/PHASE_2_MULTI_PROVIDER_MODEL_RUNTIME_SPEC.md` (usage/cost/cache contracts)
3. `docs/PHASE_3_SUBAGENTS_SWARM_SPEC.md` (child-usage rollup into parent)
4. `kun/src/contracts/` usage/telemetry types; `docs/kun-cache-optimization.md`
5. `src/renderer/src/components/Workbench.tsx` (pane layout conventions)

## Scope
### Usage pane
- Per-thread: input/output/cache-read tokens, cost estimate, cache hit rate,
  model(s) used, subagent child cost rolled up with a parent/child breakdown.
- Per-project/session aggregate: total spend, spend by model, spend by
  provider, cache savings estimate.
- **Unknown-cache honesty rule (existing product rule):** when a provider does
  not report cache data, display an explicit "unknown" state — never 0%.
**Surface:** new `src/renderer/src/components/usage/UsagePanel.tsx` (+ small
per-thread summary strip in the thread header), reachable from the Workbench.

### Data path
- If a query endpoint for aggregated usage does not already exist, add a
  **read-only** Kun contract + thread-service query and expose it through the
  existing main-process IPC schema (`src/main/ipc/app-ipc-schemas.ts`). No new
  runtime process, no write paths.

## Surfaces to Build (REQUIRED)
- `src/renderer/src/components/usage/UsagePanel.tsx` — pane with loading/empty/error/success states.
- Thread header summary strip (tokens + cost + cache state).
- IPC/contract additions if needed, with tests mirroring existing schema tests.

## UI rules (BLOCKING)
- All strings via i18n keys added to **en, zh, and ar** (locale-coverage test must pass; if H1 already merged, ar parity is enforced).
- Logical CSS only; pane must render correctly in RTL.
- Numbers/currency formatted via `Intl` with the active locale.
- No hardcoded provider pricing in the renderer — values come from Kun contracts.

## Out Of Scope
- Billing, quotas, budget editing (Phase 3 settings already own budgets).
- Historical charting beyond the current session/project scope.
- New providers.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
rg -n "UsagePanel" src/renderer/src/components | head   # surface exists and is mounted
```

## Stop Gates
- Pane shows real data from a live dev-mode thread (manual proof: run `npm run dev`, send one turn, observe tokens/cost).
- Unknown cache telemetry renders as "unknown", not 0%.
- Subagent child usage appears under its parent thread rollup.
- Component tests cover loading/empty/error/success + unknown-cache state.

## Git Commit Message
`feat(workbench): add usage/cost/cache telemetry pane with per-thread rollups`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H2_WORKBENCH_TELEMETRY_DASHBOARD.md. Build ALL REQUIRED surfaces: UsagePanel pane + thread summary strip rendering Kun's existing usage/cost/cache telemetry with subagent rollups, read-only contracts/IPC only, unknown cache state shown as unknown (never 0%). All strings via i18n keys in en+zh+ar; RTL-safe logical CSS. Run the full verification block; nonzero exits are failures. A service/contract without its visible pane = FAILED phase. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, tests run + results, surfaces implemented, and gaps.
