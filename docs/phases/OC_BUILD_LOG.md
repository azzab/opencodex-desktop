# OC Harness Build Log (H-Series Ledger)

Live resumable state for the v0.3.0 Harness milestone. The orchestrator
updates this after **every** phase action (dispatch, merge, block). If your
context resets: read `_OC_HARNESS_FOUNDATION.md`, then this file, then
`PHASE_RUNNER.md`, and resume from the first non-✅ row.

Status legend: ✅ merged · 🟡 in progress · 🔵 dispatched · ❌ blocked · ⬜ not started

| # | Phase | Session id | Model / flag | Status | Cost ($ / tokens / cache %) | Verified | Merge commit | Notes |
|---|-------|------------|--------------|--------|------------------------------|----------|--------------|-------|
| 0 | H0 Baseline Commit & Lanes | — (orchestrator) | gpt-5.5 high | ✅ | — | Full H0 gate green on final baseline; wrapper selftest/list green | `776e571` (`d37daee` wrapper metadata hardening) | Logical commits landed, `pidev-dispatch` vendored, Wave 1 lanes prepared; `baseline-v0.2.8-rc` pushed |
| 1 | H1 Arabic i18n Completion | `oc-h1-arabic` | dsv4-pro medium | ✅ | $0.4015 / in 340,885 out 224,620 cache 97.9% | Merged to `main`; post-merge full gate green (root 844/844, Kun 451/451) | `dfe60ef` | Missing-key counts 0/0; dummy future en key makes locale test fail, then passes after removal |
| 2 | H2 Telemetry Dashboard | `oc-h2-telemetry` | dsv4-pro high | ✅ | $1.0178 / initial in 582,858 out 229,486 cache 98.8%; retry in 400,257 out 183,581 cache 97.4% | Merged to `main`; post-merge full gate green (root 870/870, Kun 451/451); live dev usage proof passed | `4c92769` | Resolved Arabic locale conflict by preserving H1 parity and adding 50 H2 usage keys; live proof thread `thr_rlt445z1` reported 14,482 tokens / $0.00631533 |
| 3 | H3 Terminal Panel | `oc-h3-terminal` | dsv4-pro max | 🟡 | $2.9423 / initial in 775,936 out 201,788 cache 98.9%; steering1 in 564,017 out 123,917 cache 97.6%; steering2 in 695,931 out 118,970 cache 98.4%; steering3 in 596,647 out 234,904 cache 98.5%; steering4 in 513,150 out 303,658 cache 98.0% | Branch commit `d315287` verified; full H3 gate green; mounted renderer tests and real `node-pty` smoke passed | — | Wave 1 merge pending; `dist:mac:arm64:dmg` green with signing/notarization skipped as expected |
| 4 | H4 Planner/Executor Split | `oc-h4-planner` | dsv4-pro max | ⬜ | — | — | — | Merge before H5 (thread-service overlap) |
| 5 | H5 Checkpoint & Rewind | `oc-h5-checkpoint` | dsv4-pro max | ⬜ | — | — | — | Rebase on H4 before merge |
| 6 | H6 Browser Automation Sidecar | `oc-h6-browser` | dsv4-pro max | ⬜ | — | — | — | |
| 7 | H7 Hooks Execution & Trust | `oc-h7-hooks` | dsv4-pro max | ⬜ | — | — | — | |
| 8 | H8 Goal & Loop Scheduler | `oc-h8-goal-loop` | dsv4-pro high | ⬜ | — | — | — | |
| 9 | H9 CLI Binary & IDE Extension | `oc-h9-clients` | dsv4-pro high | ⬜ | — | — | — | |
| 10 | H10 SSH Remote Runner | `oc-h10-ssh` | dsv4-pro max | ⬜ | — | — | — | |
| 11 | H11 Upstream Wave-8 Ports | `oc-h11-upstream` | dsv4-pro high | ⬜ | — | — | — | 8A → 8C → 8D order |
| 12 | H12 Parity Audit & v0.3.0 | `oc-h12-parity` | gpt-5.5 xhigh + dsv4-pro max | ⬜ | — | — | — | Operator gates remain manual |

## Decisions & Incidents

- 2026-06-12: H0 logical commit series landed on `main`; `pidev-dispatch`
  vendored from `/Users/mohamedazab/180x-skool/tools/pidev-dispatch/` and
  stripped of repo-specific examples. Wrapper `selftest` and `list` exited 0.
  `baseline-v0.2.8-rc` is moved to the final H0 main commit after the final gate.
- 2026-06-12: Wave 1 detached `dispatch` attempts for `oc-h1-arabic`,
  `oc-h2-telemetry`, and `oc-h3-terminal` exited early after reading docs. The
  wrapper had also recorded a stale session JSONL from an unrelated live worker
  because of an unsafe "newest session after launch" fallback. Cleared the bad
  metadata, removed that fallback, and resumed the same session ids with
  foreground `order` recovery.
- 2026-06-12: H1 worker recovery completed and the orchestrator independently
  verified the full gate, 0/0 missing Arabic keys, placeholder parity, a
  30-key Arabic sample, and the future-key locale failure proof. Branch commit
  `ee54d66` is ready to merge after Wave 1 sequencing.
- 2026-06-12: H2 initial worker output passed the full command gate but failed
  the H2 stop-gate review because `UsagePanel.test.ts` did not cover loading,
  empty, error, or success states. Ordered the same H2 lane to add those tests.
- 2026-06-12: H2 same-id steering completed. The orchestrator independently
  reran the full H2 verification block and reviewed the expanded
  `UsagePanel.test.ts` coverage. Branch commit `19c60f1` is ready for live-dev
  manual proof and Wave 1 merge sequencing.
- 2026-06-12: H3 initial worker output passed the reported command gate but
  failed the H3 stop-gate review because PTY output was not streamed back to
  the renderer, so the user terminal proof could not pass. Ordered the same H3
  lane to wire output streaming and repeat the packaging dry-run.
- 2026-06-12: H3 second review found remaining security/contract gaps: the
  renderer never called `terminalAgentExecObserved`, the agent-activity tab
  used unproven raw SSE shape assumptions, cwd containment was string-based
  rather than symlink-safe, and the spawn schema still required `cwd` despite a
  claimed project-dir default. A misissued root-scope `order` was killed before
  edits; the corrected same-id order was reissued with `--cwd ../ocx-h3`.
- 2026-06-12: H3 third worker pass made the root command gate green
  (`typecheck`, `lint`, root tests 899/899, Kun typecheck/tests 451/451,
  build, `git diff --check`, and `dist:mac:arm64:dmg`), but orchestrator
  review rejected the lane because `TerminalPanel.test.ts` used SSR-only tests
  for effects-driven behavior. Ordered same-id steering for mounted tests that
  prove settings, SSE subscription, audit dedup, and PTY/xterm behavior.
- 2026-06-12: H3 mounted-test steering completed. The orchestrator reran the
  full verification gate (`typecheck`, `lint`, root tests 903/903, Kun
  typecheck/tests 451/451, build, `git diff --check`), repeated
  `dist:mac:arm64:dmg`, reviewed mounted `TerminalPanel` coverage, and ran a
  real `node-pty` cwd/output/reap smoke. Branch commit `d315287` is ready for
  Wave 1 merge sequencing.
- 2026-06-12: H1 merged to `main` as `dfe60ef`. Post-merge gate passed:
  `typecheck`, `lint` (7 warnings, exit 0), root tests 844/844, Kun
  typecheck/tests 451/451, `build`, and `git diff --check`.
- 2026-06-12: H2 merged to `main` as `4c92769` after resolving the single
  Arabic `common.json` locale conflict by keeping H1's completed file and
  adding the 50 missing H2 `usage*` keys. Post-merge gate passed:
  `typecheck`, `lint` (7 warnings, exit 0), root tests 870/870, Kun
  typecheck/tests 451/451, `build`, `git diff --check`, and
  `rg -n "UsagePanel" src/renderer/src/components | head`. Live dev proof used
  local insecure Kun at `127.0.0.1:18999`: thread `thr_rlt445z1` completed one
  turn and `/v1/usage?group_by=thread`, `group_by=day`, and `group_by=model`
  all reported the same 14,482-token / $0.00631533 usage sample.
