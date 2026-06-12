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

## M-Series — v0.4.0 Milestone (approved 2026-06-12)

H-series (above) is complete (`5ec9803`, version `0.3.0-rc`). The M-series
closes: Electron 42, provider auth/OAuth + model discovery, IDE-fork +
publishing prep, mobile companion, Windows/Linux packaging, remaining
upstream ports, and coding-loop quality. Same wave protocol and ledger.

| # | Phase | Actor | Model / flag | Session id | Worktree lane | Depends on | Advance gate |
|---|-------|-------|--------------|------------|---------------|------------|--------------|
| **Wave M-A — parallel ×2** | | | | | | | |
| M1 | [Electron 42 Retry](./PHASE_M1_ELECTRON_42_RETRY.md) | pidev | `--max` | `oc-m1-electron42` | `../ocx-m1` | H12 | corrected SSE smoke green on main first, then on Electron 42.x; full audit 0 |
| M2 | [Provider Auth & Model Discovery](./PHASE_M2_PROVIDER_AUTH_MODEL_DISCOVERY.md) | pidev | `--max` | `oc-m2-providers` | `../ocx-m2` | H12 | OAuth PKCE + safeStorage proofs; no key material outside encrypted store |
| **Wave M-A.5 — orchestrator checkpoint** | | | | | | | |
| M1.5 | Test Release Prep (0.3.1-beta) | orchestrator | gpt-5.5 high | — | main | M1 merged | release notes written; mac DMG artifacts built on Electron 42 (signed if `MAC_SIGN` creds present, else unsigned-beta with unquarantine notes); artifact paths reported to operator; NO upload/publish |
| **Wave M-B — parallel ×2** | | | | | | | |
| M3 | [IDE Everywhere](./PHASE_M3_IDE_EVERYWHERE.md) | pidev | `--thinking high` | `oc-m3-ide` | `../ocx-m3` | M1.5 done | .vsix installs in a real fork; cross-client session parity proven |
| M4a | [Mobile Pairing Host](./PHASE_M4A_MOBILE_PAIRING_HOST.md) | pidev | `--max` | `oc-m4a-pairing` | `../ocx-m4a` | M-A merged | default-off lsof proof; pairing/scope/revoke negative tests green |
| **Wave M-C — parallel ×2** | | | | | | | |
| M4b | [Mobile Companion App](./PHASE_M4B_MOBILE_APP.md) | pidev | `--thinking high` | `oc-m4b-mobile` | `../ocx-m4b` | M4a merged | device smoke: pair, stream, approve, revoke-kill |
| M5 | [Win/Linux Packaging](./PHASE_M5_WIN_LINUX_PACKAGING.md) | pidev | `--thinking high` | `oc-m5-packaging` | `../ocx-m5` | M-B merged | CI run green: NSIS + AppImage + per-platform smoke |
| **Wave M-D — sequential (both touch Kun core)** | | | | | | | |
| M6 | [Upstream 8E/8G/8H Ports](./PHASE_M6_UPSTREAM_8E_8H_PORTS.md) | pidev | `--thinking high` | `oc-m6-upstream` | `../ocx-m6` | M-C merged | gate green per lane; 8F verdict written |
| M7 | [Coding Harness Quality](./PHASE_M7_CODING_HARNESS_QUALITY.md) | pidev | `--max` | `oc-m7-quality` | `../ocx-m7` | M6 merged | baseline-then-improved eval scorecards; no eval-aware shortcuts |
| **Wave M-E — sequential** | | | | | | | |
| M8 | [v0.4.0 Release Readiness](./PHASE_M8_RELEASE_V040.md) | orchestrator + pidev `--max` | gpt-5.5 extra high | `oc-m8-release` | main | M7 | parity+security evidence; readiness report; 0.4.0-rc |

M-series conflict notes: M1 (electron tooling/scripts) and M2 (provider
settings/credentials) are disjoint. M3 (clients/vscode) and M4a (app-server
listener) are disjoint. M4b (clients/mobile) and M5 (packaging/CI) are
disjoint. M6 and M7 both touch Kun core — strictly sequential.

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
