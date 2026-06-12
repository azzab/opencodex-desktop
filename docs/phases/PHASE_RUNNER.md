# OpenCodex Desktop — H-Series Phase Runner

Execution manifest for the v0.3.0 Harness milestone. Phases run in waves;
phases inside a wave run **in parallel, one worker per git worktree**. The
orchestrator merges lanes back to `main` sequentially with the full gate
between merges, then starts the next wave.

Keystone: [_OC_HARNESS_FOUNDATION.md](./_OC_HARNESS_FOUNDATION.md)
Ledger: [OC_BUILD_LOG.md](./OC_BUILD_LOG.md)

## Execution Order

| # | Phase | Actor | Model / flag | Session id | Worktree lane | Depends on | Advance gate |
|---|-------|-------|--------------|------------|---------------|------------|--------------|
| 0 | [H0 Baseline Commit & Lanes](./PHASE_H0_BASELINE_COMMIT_AND_LANES.md) | orchestrator | gpt-5.5 high | — | main | clean state | full gate green on main; baseline tag pushed |
| **Wave 1 — parallel ×3** | | | | | | | |
| 1 | [H1 Arabic i18n Completion](./PHASE_H1_ARABIC_I18N_COMPLETION.md) | pidev | deepseek-v4-pro medium | `oc-h1-arabic` | `../ocx-h1` | 0 | locale-coverage test enforces full ar parity |
| 2 | [H2 Telemetry Dashboard](./PHASE_H2_WORKBENCH_TELEMETRY_DASHBOARD.md) | pidev | `--thinking high` | `oc-h2-telemetry` | `../ocx-h2` | 0 | usage pane renders real Kun telemetry incl. unknown-cache state |
| 3 | [H3 Terminal Panel](./PHASE_H3_TERMINAL_PANEL.md) | pidev | `--max` | `oc-h3-terminal` | `../ocx-h3` | 0 | PTY sessions gated by approvals + audited |
| **Wave 1.5 — sequential ×1 (security fixpack)** | | | | | | | |
| 3.5 | [H3.5 Electron Security Fixpack](./PHASE_H3_5_ELECTRON_SECURITY_FIXPACK.md) | pidev | `--max` | `oc-h3-5-electron` (fallback: `oc-h3-5-electron39`) | `../ocx-h3-5` (fallback: `../ocx-h3-5-39`) | 1–3 merged | full `npm audit` exit 0; dev boot + DMG dry-run + node-pty ABI proof on Electron 42.4.0, or authorized 39.8.10 fallback if the 42.4.0 recovery path is ledger-blocked |
| **Wave 2 — parallel ×2** | | | | | | | |
| 4 | [H4 Planner/Executor Split](./PHASE_H4_PLANNER_EXECUTOR_SPLIT.md) | pidev | `--max` | `oc-h4-planner` | `../ocx-h4` | 3.5 merged | plan mode provably read-only; transition requires approval |
| 5 | [H5 Checkpoint & Rewind](./PHASE_H5_CHECKPOINT_REWIND.md) | pidev | `--max` | `oc-h5-checkpoint` | `../ocx-h5` | 3.5 merged | restore code-only / conversation-only / fork all proven by tests |
| **Wave 3 — parallel ×3** | | | | | | | |
| 6 | [H6 Browser Automation Sidecar](./PHASE_H6_BROWSER_AUTOMATION_SIDECAR.md) | pidev | `--max` | `oc-h6-browser` | `../ocx-h6` | 4–5 merged | real Playwright actions behind Phase 4 gates; evidence captured |
| 7 | [H7 Hooks Execution & Trust](./PHASE_H7_HOOKS_EXECUTION_TRUST.md) | pidev | `--max` | `oc-h7-hooks` | `../ocx-h7` | 4–5 merged | only trusted+pinned hooks run; kill switch works |
| 8 | [H8 Goal & Loop Scheduler](./PHASE_H8_GOAL_LOOP_SCHEDULER.md) | pidev | `--thinking high` | `oc-h8-goal-loop` | `../ocx-h8` | 4–5 merged | tool-free budgeted evaluator; loop list/cancel/expiry/resume proven |
| **Wave 4 — parallel ×2** | | | | | | | |
| 9 | [H9 CLI Binary & IDE Extension](./PHASE_H9_CLI_BINARY_IDE_EXTENSION.md) | pidev | `--thinking high` | `oc-h9-clients` | `../ocx-h9` | 6–8 merged | packaged CLI + VS Code MVP drive a real thread over app-server protocol |
| 10 | [H10 SSH Remote Runner](./PHASE_H10_SSH_REMOTE_RUNNER.md) | pidev | `--max` | `oc-h10-ssh` | `../ocx-h10` | 6–8 merged | outbound-only SSH run with handshake, redaction, stop/resume |
| **Wave 5 — sequential** | | | | | | | |
| 11 | [H11 Upstream Wave-8 Ports](./PHASE_H11_UPSTREAM_WAVE8_PORTS.md) | pidev | `--thinking high` | `oc-h11-upstream` | `../ocx-h11` | 9–10 merged | 8A/8C/8D ported; guardrail skips documented |
| 12 | [H12 Parity Audit & v0.3.0 Release](./PHASE_H12_PARITY_RELEASE_V030.md) | orchestrator + pidev `--max` | gpt-5.5 extra high | `oc-h12-parity` | main | 11 | evidence-backed parity matrix; security review; readiness report |

## Wave Protocol

For each wave:

1. `git worktree add ../ocx-h<N> -b phase/h<N>-<slug>` per lane (from fresh `main`).
2. `preflight` → `dispatch` each lane with its phase doc's Short Launcher Prompt.
3. `wait` all lanes (background shells); on exit 3 follow the foundation doc's recovery rules.
4. Per lane: `diff`, run the full Definition-of-Done gate **inside the worktree**, read key files, check Stop Gates.
5. Merge lanes to `main` one at a time; rerun the full gate after each merge; resolve conflicts as orchestrator.
6. `cost` each session; update `OC_BUILD_LOG.md`; remove worktrees; start next wave.

## Conflict Map (why these lanes can run in parallel)

- Wave 1: H1 touches only `locales/ar/*` + coverage test; H2 touches renderer
  usage pane + a read-only Kun usage endpoint; H3 touches main-process PTY
  service + a new renderer pane. Disjoint.
- Wave 2: H4 lives in Kun loop/tool-gating + plan UI; H5 lives in thread
  service/snapshots + timeline UI. Shared file risk: `kun/src/services/thread-service.ts`
  — orchestrator merges H4 first, then rebases H5 lane before its merge.
- Wave 3: H6 = automation sidecar adapter; H7 = hooks runtime; H8 = scheduler.
  Disjoint except contracts index — trivial merge.
- Wave 4: H9 = clients on top of frozen app-server protocol; H10 = remote
  runner protocol implementation. Disjoint.
