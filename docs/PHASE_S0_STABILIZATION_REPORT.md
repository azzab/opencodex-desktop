# Phase S0 Stabilization Report

Date: 2026-06-09

## Purpose

Phase S0 stabilized the already-built Phase 0-4 foundation before starting
Phase 4.5, Phase 5, or later roadmap work.

The pass focused on:

- reconciling README roadmap order with the saved phase prompts;
- cleaning up core product-facing OpenCodex branding strings;
- adding missing Phase 1 and Phase 4 verification reports;
- running fresh focused and full verification gates;
- preserving the existing dirty Phase 1-4 implementation work without
  broad refactors or unrelated rewrites.

## Changes

### Branding And Locale Cleanup

Updated primary product-facing English and Chinese strings from legacy
DeepSeek GUI identity to OpenCodex Desktop:

- `appName`;
- about menu title and message;
- open-at-login description;
- runtime offline hero title;
- Kun binary missing path guidance;
- image-preview restart guidance;
- schedule plugin title;
- phone connector wording;
- default main-process notification and startup error titles.

Arabic already used `OpenCodex Desktop` for the primary app strings. S0 added
a regression test to ensure English, Arabic, and Chinese primary locale files
contain the OpenCodex Desktop product identity.

Compatibility notes:

- Upstream attribution still correctly names DeepSeek GUI.
- DeepSeek provider references remain where they describe the default model
  provider/API key.
- Legacy fixture text, compatibility markers, package tests, and upstream docs
  were not blindly renamed.

### Roadmap Reconciliation

Updated the README roadmap to match `docs/prompts/`:

- Phase 3 is documented as implemented controlled subagents.
- Phase 3.5 is `/goal`, `/loop`, and automations.
- Phase 4 is browser/computer-control foundation.
- Phase 4.5 is remote relay and mobile access.
- Phase 5 is the Codex-like desktop workbench UX.
- Phase 6 is Git, worktrees, handoff, and review.
- Phase 7 is Skills, plugins, hooks, rules, and memory.
- Phase 8 is app-server, CLI bridge, and IDE bridge.
- Phase 9 is remote runners, SSH hosts, and optional cloud workers.
- Phase 10 is parity hardening, security, and release.

### Verification Reports

Added:

- `docs/PHASE_1_VERIFICATION_REPORT.md`
- `docs/PHASE_4_VERIFICATION_REPORT.md`

Updated those reports with fresh S0 verification results after the gate passed.

## Issues Found And Fixed During S0

| Issue | Root cause | Fix |
| --- | --- | --- |
| Root `npm test` initially failed in `MessageTimeline.initial-heatmap.test.ts` | The English offline hero locale changed from `DeepSeek-GUI is waking the local agent` to `OpenCodex Desktop is waking the local agent`, but the test expected the old string. | Updated the test assertion and reran the full root suite. |
| `npm --prefix kun run typecheck` initially failed in `kun/tests/loop.test.ts` | A boolean `Array.find()` predicate did not narrow the runtime-event union to `turn_failed`, so TypeScript could not prove `.message` exists. | Added an explicit `TurnLifecycleEvent` type guard and reran Kun typecheck and tests. |

## Verification Results

Fresh command results:

| Command | Result |
| --- | --- |
| `npm test -- src/main/product-brand.test.ts src/main/services/user-agent-stack-service.test.ts src/main/kun-process.test.ts src/shared/app-settings.test.ts src/renderer/src/components/settings-section-agents.test.ts` | PASS: 5 files, 79 tests |
| `npm --prefix kun test -- tests/automation-policy.test.ts tests/automation-tool-provider.test.ts` | PASS: 2 files, 10 tests |
| `npm --prefix kun run typecheck` | PASS |
| `npm --prefix kun test` | PASS: 45 files, 447 tests |
| `npm test` | PASS: 117 files, 728 tests |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |

## Remaining Gaps

- Arabic locale coverage is still much thinner than English and Chinese. The
  initial Arabic surface is present, but first-class Arabic UX still needs
  broader translation and RTL visual verification.
- Real browser automation sidecar behavior is not implemented or proven.
- Phase 3.5 still needs the full tool-free evaluator and `/loop` scheduler.
- Phase 4.5 remote/mobile architecture docs are still missing.
- Phase 5-10 are mostly roadmap/prompt-level work, with some earlier pieces
  built ahead of phase.
- The worktree remains intentionally dirty with broad Phase 1-4 implementation
  changes. S0 did not stage, commit, push, pull, rebase, clean, or revert
  unrelated files.

## Recommended Next Step

Commit or otherwise preserve the Phase 0-4 stabilization slice before starting
Phase 4.5 or Phase 5. If the next work remains local-only, run Phase 4.5 as a
docs-first remote/mobile architecture pass. If the immediate goal is a usable
desktop, run Phase 5 only after confirming which dirty Phase 1-4 files belong
in the baseline.

