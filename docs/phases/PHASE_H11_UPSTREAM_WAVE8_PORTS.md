# Phase H11: Upstream Wave-8 Ports (8A, 8C, 8D)

## Window And Model
- pi · `deepseek-v4-pro` · `--thinking high` · session `oc-h11-upstream` · worktree `../ocx-h11`

## Goal
Port the three upstream `upstream/develop` lanes the Wave 7 drift audit
classified as safe-and-valuable, in order: **8A** (git root discovery +
duplicate usage cleanup), **8C** (Kun per-turn sandbox + stuck-turn
finalization), **8D** (Kun store I/O + startup readiness + SSE batching).
Skip 8B (superseded by H4), 8E–8H (deferred per audit). Every port preserves
OpenCodex guardrails and branding.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md` (lane classification + commit list)
3. `docs/WAVE_3_4_UPSTREAM_PARITY_RELEASE_PREP.md` (porting discipline: what gets skipped and why)
4. `git log upstream/develop` for the classified commits

## Scope
### 8A — Git discovery + usage cleanup
- `.git` root walk-up discovery; duplicate usage-event cleanup. Low risk;
  cherry-pick where clean, re-implement where conflicted.

### 8C — Kun per-turn sandbox + stuck-turn finalization
- Per-turn sandbox semantics in the Kun loop and stuck-turn finalization
  (turns that die mid-run get finalized, not zombied). Central runtime change:
  port carefully, keep OpenCodex approval/budget semantics authoritative where
  upstream defaults are looser (Wave 3-4 precedent: we skipped upstream
  sandbox-default loosening — keep that skip).
- Note overlap with H4/H5: re-run their stop-gate tests after this port.

### 8D — Store I/O + startup readiness + SSE batching
- Kun store I/O performance, startup readiness signal, SSE event batching.
  Performance-sensitive: capture before/after numbers (startup ms, events/sec
  on a replayed transcript) in the report.

### Per-port discipline
- One lane per commit series (`port(8A): ...` etc.), each lane fully gated
  before starting the next; intentional skips documented inline in the
  commit message and in the phase report.

## Out Of Scope
- 8B plan-mode isolation (H4 owns it — verify no regression instead).
- 8E Write perf, 8F Tiptap, 8G SDD traceability, 8H imagegen (future waves).
- Any upstream branding/identity changes.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
```

## Stop Gates
- Full gate green after EACH lane (8A, then 8C, then 8D), not just at the end.
- H4 plan-mode denial test and H5 restore tests still green after 8C.
- 8D before/after performance numbers recorded in the report.
- Skip list documented (which upstream commits were not taken and why).

## Git Commit Message
Series: `port(8A): git root discovery and usage cleanup from upstream develop`, `port(8C): kun per-turn sandbox and stuck-turn finalization (opencodex guardrails preserved)`, `port(8D): kun store i/o, startup readiness, and sse batching`.

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md, docs/phases/PHASE_H11_UPSTREAM_WAVE8_PORTS.md, and docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md. Port upstream develop lanes in strict order 8A → 8C → 8D with the full verification gate green after each lane; preserve OpenCodex approval/budget/sandbox guardrails over looser upstream defaults; re-run H4 plan-mode and H5 checkpoint stop-gate tests after 8C; record 8D before/after performance numbers; document every skipped upstream commit with a reason. Nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing per-lane commits, skip list, performance numbers, tests + results, and gaps.
