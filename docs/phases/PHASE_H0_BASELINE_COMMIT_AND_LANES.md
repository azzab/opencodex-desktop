# Phase H0: Baseline Commit, Tooling Vendor, And Lane Setup

## Window And Model
- Actor: **orchestrator only** (Codex `gpt-5.5`, reasoning `high`, or Claude Code). No pidev worker — this phase is review, commit hygiene, and infrastructure.

## Goal
Land the ~62 in-flight modified files (Phase 10 hardening + Wave 3–4 upstream
ingestion, already test-green) as clean logical commits, tag the v0.2.8
baseline, vendor the pidev-dispatch wrapper into the repo, and prepare Wave 1
worktree lanes. After H0, `main` is a known-good launch pad for parallel work.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/PHASE_10_PARITY_HARDENING_RELEASE_REPORT.md`
3. `docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md`
4. `git status` + `git diff --stat` (review every hunk before committing)

## Scope
### Logical commit series (review each group, then commit separately)
- Kun model endpoint formats (`kun/src/contracts/model-endpoint-format.ts`, deepseek-compat client, config/CLI plumbing, tests).
- Feishu/Lark markdown + scheduled-task detector ports (`src/main/claw-*`).
- Composer changed-file review card (`FloatingComposer.*`).
- SDD draft store/restore persistence.
- Locale key additions + `locale-coverage.test.ts`.
- Release infrastructure (`scripts/release-*.cjs`, `release-smoke.ts`, readiness command).
- Documentation (Phase 10 report, Wave 3–7 reports, runbook, audits, this H-series pack).

### Baseline tag
- After all commits and a green full gate: `git tag baseline-v0.2.8-rc`.

### Vendor pidev-dispatch
- Copy `~/180x-skool/tools/pidev-dispatch/` → `tools/pidev-dispatch/` (wrapper
  script + SKILL.md). Strip any 180x-specific paths/config. Verify
  `tools/pidev-dispatch/scripts/pidev.sh list` runs.

### Wave 1 lanes
- `git worktree add ../ocx-h1 -b phase/h1-arabic`
- `git worktree add ../ocx-h2 -b phase/h2-telemetry`
- `git worktree add ../ocx-h3 -b phase/h3-terminal`

## Out Of Scope
- Any feature work, translation, or refactoring.
- Release publish, signing, or operator gates (those stay manual per Wave 6).

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
git status   # clean tree on main after commits
```

## Stop Gates
- No commit mixes unrelated groups (each commit message names one group).
- No secrets in any committed hunk (scan diffs for key/token/password patterns).
- Full gate green on `main` **after the final commit**, before tagging.
- Three worktrees exist and each starts from the tagged baseline.

## Git Commit Messages
Series of `feat:`/`chore:`/`docs:` commits per group above, ending with
`docs: add H-series harness phase pack and runner`.
