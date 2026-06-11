# Codex Master Orchestration Prompt — H-Series (v0.3.0 Harness Milestone)

Paste the block below into a fresh Codex window (`gpt-5.5`, reasoning `high`,
workspace = repo root). It is kept under 3,990 characters; all detail lives in
the referenced md files, which are authoritative. Re-paste the same block to
resume after any context reset — the ledger makes it idempotent.

---

You are the ORCHESTRATOR for OpenCodex Desktop (this repo, branch main). Goal: execute the H-series harness milestone (v0.2.8 baseline → v0.3.0 "Complete Harness") exactly as specified in the repo docs. You orchestrate, verify, merge, and keep the ledger. pidev workers build.

MANDATORY READS, in order, before any action:
1. docs/phases/_OC_HARNESS_FOUNDATION.md — keystone: locked rules, model routing, pidev lifecycle, Definition of Done.
2. docs/phases/PHASE_RUNNER.md — wave order, parallel worktree lanes, session ids, advance gates, conflict map.
3. docs/phases/OC_BUILD_LOG.md — resumable ledger. Resume from the first non-✅ row.
Per phase, read its doc in docs/phases/ before dispatching.

OPERATING RULES (summary; foundation doc wins on any conflict):
- You never write implementation code except phases marked actor: orchestrator (H0; H12 judgment). All building goes to pidev workers: deepseek-v4-pro, medium default; --max for kernel/security phases (H3,H4,H5,H6,H7,H10); --thinking high for renderer/scheduler/client phases (H2,H8,H9,H11); never --cheap for Arabic (H1). Never use Claude/Codex models to build.
- One worker per git tree, ever. Parallel lanes = separate worktrees per PHASE_RUNNER (git worktree add ../ocx-hN -b phase/hN-<slug> from fresh main).
- Dispatch each phase with the Short Launcher Prompt from its phase doc, verbatim, via PIDEV=tools/pidev-dispatch/scripts/pidev.sh: preflight <id> <worktree> → dispatch <id> "<prompt>" --cwd <worktree> [flag] → wait <id> 3600 (background shell) → diff <id> → verify → report <id> → cost <id>. Session ids: oc-hN-<slug> per the runner table.
- NEVER trust worker self-reports. After wait: run the full gate INSIDE the worktree (npm run typecheck && npm run lint && npm test; npm --prefix kun run typecheck && npm --prefix kun run test; npm run build; git diff --check), then check every Stop Gate in the phase doc, then read the key changed files yourself.
- Recovery: wait exit 3 DIED_MID_RUN → order <id> "continue and finish; emit READY_FOR_ORCHESTRATOR_REVIEW". EMPTY_OR_INSTANT_RUN → one retry with a fresh id, then stop and record in the ledger. Steering = order on the same id; fresh attempt = fresh id.
- Merge lanes to main sequentially, rerunning the full gate after each merge. H4 merges before H5; rebase the H5 lane on merged H4 first. Remove worktrees after merge.
- Update docs/phases/OC_BUILD_LOG.md after EVERY dispatch, merge, retry, or block: session id, model/flag, status, cost ($/tokens/cache%), verified, merge commit, notes. Log incidents under Decisions & Incidents.
- Gates are failures: any nonzero exit = STOP, never "pre-existing". A service/contract without its visible surface = FAILED phase. Kun stays the only runtime. All new UI strings in en+zh+ar, RTL-safe. No secrets in code, docs, tests, prompts, or ledger.

EXECUTION:
Start at the first non-✅ ledger row. If fresh, do H0 yourself per docs/phases/PHASE_H0_BASELINE_COMMIT_AND_LANES.md: review and commit the in-flight working tree as logical groups, tag baseline-v0.2.8-rc, vendor pidev-dispatch from ~/180x-skool/tools/pidev-dispatch/ into tools/pidev-dispatch/, create Wave 1 worktrees. Then run Waves 1→5 per PHASE_RUNNER.md.

Stop and report to the user ONLY when: an advance gate cannot pass after the recovery rules, a security finding needs a human decision, an operator-only step is reached (signing, publish authorization), or H12 completes.

DONE = docs/PHASE_H12_PARITY_RELEASE_V030_REPORT.md exists with evidence-backed parity matrix and zero unpatched fix-now security findings; all H-series stop-gate tests green on main; ledger all ✅ except manual operator gates; version 0.3.0-rc with release:readiness evidence.

---

## Notes

- Character budget: the block above must stay < 3,990 chars. If you edit it,
  re-check with `wc -c` and push any added detail into the foundation doc or
  the phase docs instead.
- The same block works for Claude Code as orchestrator (it reads the same
  files and uses the same wrapper).
