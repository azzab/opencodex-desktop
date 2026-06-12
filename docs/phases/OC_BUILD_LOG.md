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
| 3 | H3 Terminal Panel | `oc-h3-terminal` | dsv4-pro max | ✅ | $2.9423 / initial in 775,936 out 201,788 cache 98.9%; steering1 in 564,017 out 123,917 cache 97.6%; steering2 in 695,931 out 118,970 cache 98.4%; steering3 in 596,647 out 234,904 cache 98.5%; steering4 in 513,150 out 303,658 cache 98.0% | Merged to `main`; post-merge full gate green (root 932/932, Kun 451/451); production audit clean | `84f1fb4` | Added npm override forcing transitive `axios@1.17.0` for `@larksuiteoapi/node-sdk`; DMG dry-run and real `node-pty` smoke passed |
| 3.5 | H3.5 Electron Security Fixpack | `oc-h3-5-electron`; fallback `oc-h3-5-electron39` | dsv4-pro max | ✅ | 42.4.0 path: $1.3876 total / initial in 694,748 out 157,709 cache 97.8%; recovery1 in 569,638 out 115,332 cacheRead 18,827,264; recovery2 in 342,441 out 210,710 cache 98.6%; fallback $0.4538 / in 618,362 out 109,475 cacheRead 24,719,104 cache 97.6% | Fallback `39.8.10` merged; post-merge full gate green (root 932/932, Kun 451/451); `npm audit` 0 vulns; dev Kun turn completed; `smoke:release`; `dist:mac:arm64:dmg`; packaged Electron `39.8.10`; PTY proof; clean-room full gate green | `29ae887` | 42.4.0 remained not mergeable after recovery; authorized 39.8.10 fallback cleared audit and all H3.5 stop gates. Wave 2 unblocked |
| 4 | H4 Planner/Executor Split | `oc-h4-planner`; retry `oc-h4-planner-r2` | dsv4-pro max | ✅ | initial partial/unmergeable; retry $0.6559 / in 636,128 out 210,895 cacheRead 53,991,168 cache 98.8%; remediation1 $0.5834 / in 518,406 out 170,379 cacheRead 57,833,856 cache 99.1%; remediation2 $0.2463 / in 387,586 out 59,117 cacheRead 7,244,032 cache 94.9% | Merged to `main`; post-merge full gate green (root 932/932, Kun 487/487); H4 stop gates independently reviewed | `0ee4c19` | Plan-mode tool isolation, persistent plan artifacts, approval-only execute transition, renderer approve surface, en/zh/ar keys |
| 5 | H5 Checkpoint & Rewind | `oc-h5-checkpoint` | dsv4-pro max | ✅ | $3.2120 total: initial $0.5778 / in 544,726 out 204,438 cache 98.8%; remediation1 $1.0920 / in 1,059,997 out 270,774 cache 99.0%; remediation2 $0.3947 / in 512,758 out 116,583 cache 97.4%; remediation3 $0.4313 / in 392,276 out 195,973 cache 98.4%; remediation4 stopped $0.5351 / in 724,009 out 166,688 cache 96.6%; remediation5 $0.1811 / in 272,671 out 52,697 cache 94.4% | Merged to `main`; post-merge full gate green (root 932/932, Kun 525/525); H5 stop gates independently reviewed | `4bfe95f` | Safe checkpoint restore/fork semantics merged: code/conversation/both restore, full snapshot fork worktree, retention settings, audit events, visible timeline, en/zh/ar keys |
| 6 | H6 Browser Automation Sidecar | `oc-h6-browser` | dsv4-pro max | 🔵 | running | Dispatched in `../ocx-h6`; verification pending | — | Wave 3 dispatch log `/Users/mohamedazab/.pidev-orchestrator/oc-h6-browser/run-20260612T143245.log` |
| 7 | H7 Hooks Execution & Trust | `oc-h7-hooks` | dsv4-pro max | 🔵 | running | Dispatched in `../ocx-h7`; verification pending | — | Wave 3 dispatch log `/Users/mohamedazab/.pidev-orchestrator/oc-h7-hooks/run-20260612T143245.log` |
| 8 | H8 Goal & Loop Scheduler | `oc-h8-goal-loop` | dsv4-pro high | 🔵 | running | Dispatched in `../ocx-h8`; verification pending | — | Wave 3 dispatch log `/Users/mohamedazab/.pidev-orchestrator/oc-h8-goal-loop/run-20260612T143245.log` |
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
- 2026-06-12: H3 merged to `main` as `84f1fb4` after resolving Arabic locale
  conflicts by keeping the H1/H2-complete Arabic files and adding H3's 13
  `terminal*` common keys plus 3 terminal settings keys. The first post-merge
  `npm run typecheck` failed because `main`'s local `node_modules` did not yet
  contain H3's merged packages (`@xterm/xterm`, `@testing-library/react`, and
  related typings); `npm install` from the merged lockfile succeeded and changed
  no tracked files. Security stop: `npm audit --omit=dev` exits 1 with high
  production advisories through direct `@larksuiteoapi/node-sdk@1.64.0` ->
  `axios@1.13.6`; npm's listed fix is `@larksuiteoapi/node-sdk@1.56.1` marked
  semver-major. Human decision required before continuing the H3 main gate.
- 2026-06-12: H3 production audit blocker was remediated without downgrading the
  Lark SDK: added a top-level npm override for `axios@1.17.0`, leaving
  `@larksuiteoapi/node-sdk@1.64.0` in place while forcing its transitive axios
  copy to the patched 1.x line. Fresh post-merge H3 gate passed:
  `typecheck`, `lint` (7 warnings, exit 0), root tests 932/932, Kun
  typecheck/tests 451/451, `build`, `git diff --check`,
  `npm audit --omit=dev` (0 vulnerabilities), H3 surface/i18n greps,
  `dist:mac:arm64:dmg` (signing/notarization skipped as expected), and real
  `node-pty` cwd/output smoke. Full `npm audit` still exits 1 because
  dev/runtime `electron@34.5.8` has high advisories with npm's fix listed as
  `electron@42.4.0` semver-major. H4 dispatch is blocked pending a human
  Electron security decision.
- 2026-06-12: Rechecked the Electron blocker before H4 dispatch. `npm audit`
  still exits 1 on `electron@34.5.8` with the direct Electron advisory range
  `<=39.8.4`; the latest 34.x is `34.5.8`. A temporary package-lock sandbox
  showed `electron@38.8.6` still exits 1, while `electron@39.8.5`,
  `electron@39.8.10`, and npm's suggested `electron@42.4.0` exit 0. Wave 2
  remains blocked until a human approves an Electron major upgrade path or
  records a security exception/deferral.
- 2026-06-12: Fresh H4 resume check repeated the same blocker. Current main is
  `electron@34.5.8`; `npm audit --omit=dev --json` reports 0 vulnerabilities,
  but full `npm audit --json` exits 1 on the direct Electron advisory range
  `<=39.8.4` with npm's semver-major fix at `electron@42.4.0`. Latest 34.x is
  still `34.5.8`; first clean candidate by range remains `39.8.5`. No Wave 2
  dispatch until the Electron major-upgrade path or security deferral is
  explicitly approved.
- 2026-06-12: Operator decisions recorded. (1) Electron: approved major
  upgrade to `electron@42.4.0` via new Phase H3.5
  (`docs/phases/PHASE_H3_5_ELECTRON_SECURITY_FIXPACK.md`, session
  `oc-h3-5-electron`, lane `../ocx-h3-5`); fallback to `39.8.10` only if the
  42.4.0 gate cannot go green after recovery rules, with the reason recorded
  here. Wave 2 unblocks when H3.5 merges gate-green. (2) Release lanes: the
  standalone 0.2.8 publish is folded into v0.3.0 — no further 0.2.8 operator
  gates will be pursued; the 0.2.8 operator runbook and Wave 5–7 evidence
  carry forward into the H12 readiness report, and the H12 runbook
  (`docs/release/0.3.0-operator-runbook.md`) supersedes the 0.2.8 one.
- 2026-06-12: H3.5 dispatched after `pidev` preflight passed for
  `oc-h3-5-electron` in `../ocx-h3-5` (fresh session id, clean tree, no live
  pi worker at preflight). Dispatch used the H3.5 Short Launcher Prompt
  verbatim with `--max`. Initial report stream shows the worker researching
  Electron 42 compatibility; orchestrator verification is pending completion.
- 2026-06-12: H3.5 is blocked after the allowed recovery path. Initial worker
  cost was $0.5509 (in 694,748 out 157,709 cacheRead 30,764,032, cache 97.8%).
  First same-lane recovery cost was $0.4164 (in 569,638 out 115,332 cacheRead
  18,827,264) and was rejected because the worktree was left with
  `better-sqlite3` compiled for Electron ABI 146 while system Node required ABI
  147, and because `scripts/kun-smoke.cjs` still treated JSON/zero-event
  responses as acceptable. Second same-lane recovery cost was $0.4203 (in
  342,441 out 210,710 cacheRead 24,272,000, cache 98.6%). The second recovery
  got 11/12 gates reported green (`npm audit` 0 vulnerabilities, root/Kun
  typecheck/tests, build, `smoke:release`, DMG build with Electron 42.4.0,
  `git diff --check`, PTY proof, and Node ABI restored), but correctly ended
  `BLOCKED_FOR_ORCHESTRATOR` on the dev/Kun/SSE stop gate. Orchestrator
  independently reproduced the blocker with `node scripts/kun-smoke.cjs` inside
  `../ocx-h3-5`: Kun starts healthy and creates a thread, but the turn request
  returns HTTP 202 with `Content-Type: application/json; charset=utf-8` and 0
  SSE events, so the stop gate is not satisfied. Orchestrator also independently
  verified source-tree Node ABI loads for `better-sqlite3` and `node-pty`.
  A stale H3.5 worker `npm run dev` process (`47624`/`47627`) was terminated.
  Per the operator decision above, the `electron@42.4.0` lane is not mergeable;
  fallback to `39.8.10` is authorized only because 42.4.0 could not go green
  after recovery rules, with this reason recorded here. Wave 2 remains blocked
  until an approved Electron security lane merges gate-green.
- 2026-06-12: Added an explicit H3.5 fallback launcher to
  `PHASE_H3_5_ELECTRON_SECURITY_FIXPACK.md` and updated `PHASE_RUNNER.md` so
  the authorized `39.8.10` fallback can be dispatched from phase docs verbatim
  without asking a worker to self-elect the fallback. Created fresh fallback
  worktree `../ocx-h3-5-39` on `phase/h3-5-electron39` from main `506613e`.
  `pidev` preflight passed for `oc-h3-5-electron39` (fresh session id, clean
  tree, no live pi worker). Dispatched the Fallback Short Launcher Prompt
  verbatim with `--max`; worker pid `844`, log
  `/Users/mohamedazab/.pidev-orchestrator/oc-h3-5-electron39/run-20260612T115933.log`.
- 2026-06-12: H3.5 authorized fallback completed and merged. Worker
  `oc-h3-5-electron39` reported READY with cost `$0.4538` (in 618,362 / out
  109,475 / cacheRead 24,719,104 / cache 97.6%). Orchestrator independently
  verified: full gate green in the fallback worktree; `npm audit` exit 0;
  `npm run smoke:release`; `npm run dist:mac:arm64:dmg`; packaged Electron
  framework `CFBundleVersion` `39.8.10`; `node-pty` real spawn/output/reap
  proof; focused mounted `TerminalPanel`/`UsagePanel` tests; `node
  scripts/kun-smoke.cjs` received 3 SSE events and completed; live `npm run
  dev` started Electron 39/Kun on port 18999 and one dev Kun turn completed
  with 3 SSE events; clean-room `rm -rf node_modules kun/node_modules && npm
  ci && npm --prefix kun ci` followed by the full gate stayed green. Merged as
  `29ae887`; Wave 2 is now unblocked.
- 2026-06-12: H4 dispatched after H3.5 merged gate-green. Created fresh
  worktree `../ocx-h4` on `phase/h4-planner` from main `6340327`. `pidev`
  preflight passed for `oc-h4-planner` (fresh session id, clean tree, no live
  pi worker). Dispatched the H4 Short Launcher Prompt verbatim with `--max`;
  worker pid `61384`, log
  `/Users/mohamedazab/.pidev-orchestrator/oc-h4-planner/run-20260612T122052.log`.
- 2026-06-12: H5 dispatched in parallel Wave 2 lane. Created fresh worktree
  `../ocx-h5` on `phase/h5-checkpoint` from main `a3a9da1`. `pidev`
  preflight passed for `oc-h5-checkpoint`; it warned about live H4 worker
  `61384`, but confirmed per-tree isolation and a clean H5 tree. Dispatched
  the H5 Short Launcher Prompt verbatim with `--max`; worker pid `70550`, log
  `/Users/mohamedazab/.pidev-orchestrator/oc-h5-checkpoint/run-20260612T122315.log`.
- 2026-06-12: H4 initial lane `oc-h4-planner` was stopped as unmergeable
  during verification. The worker entered repeated `npm --prefix kun run test`
  hangs in `../ocx-h4`; orchestrator terminated only the stuck verification
  subprocesses first, then the original worker after same-session steering was
  unavailable because no pidev session file had been saved and an attempted
  `order` incorrectly created root-scope metadata. Orchestrator spot-review
  also found the partial H4 output did not satisfy stop gates: the API test
  allowed direct plan→execute mode changes without approval, the plan artifact
  persistence test was structural rather than proving reload survival, and no
  changed renderer files carried the required H4 visible surface. The dirty
  `../ocx-h4` worktree is retained for evidence. Fresh retry
  `oc-h4-planner-r2` was created in `../ocx-h4-r2` on
  `phase/h4-planner-r2` from main `d5cb9a0`; preflight passed and the H4
  Short Launcher Prompt was dispatched verbatim with `--max`, worker pid
  `25320`, log
  `/Users/mohamedazab/.pidev-orchestrator/oc-h4-planner-r2/run-20260612T124035.log`.
- 2026-06-12: H5 initial worker `oc-h5-checkpoint` reported READY with cost
  `$0.5778` (in 544,726 / out 204,438 / cacheRead 44,947,072 / cache 98.8%)
  but is held unmergeable pending H4 merge/rebase and same-lane remediation.
  The worker-listed gaps include missing automatic checkpoint creation before
  the first mutating tool call, no persistent checkpoint store, missing
  settings UI retention controls, and incomplete Phase 6 managed-worktree fork
  registration; those are phase-scope blockers, not accepted gaps.
- 2026-06-12: H4 retry `oc-h4-planner-r2` reported READY with cost `$0.6559`
  (in 636,128 / out 210,895 / cacheRead 53,991,168 / cache 98.8%).
  Orchestrator independently reran the full command gate in `../ocx-h4-r2`:
  `npm run typecheck`, `npm run lint`, `npm test`, `npm --prefix kun run
  typecheck`, `npm --prefix kun run test`, `npm run build`, and `git diff
  --check` all exited 0. The phase is still blocked and not mergeable because
  the H4 stop gates and visible-surface rule failed: no renderer files were
  changed and `src/renderer/src/components/plan/PlanPanel.tsx` has no
  approve-and-execute action wired to `POST /v1/threads/:id/plan/approve`;
  `kun/tests/plan-mode-isolation.test.ts` only exercises direct tool-host
  gating and does not prove filesystem hash unchanged after mutation denial,
  plan artifact survival across a full thread-store reload, or API/server
  denial of plan->execute transitions without the approval path. The API route
  exists, but `approvePlan` transitions mode directly in `ThreadService`
  without a renderer approval surface. Recovery rules are exhausted after the
  initial unmergeable lane plus fresh retry; Wave 2 is stopped before H4 merge,
  before H5 rebase/merge, and before any Wave 3 dispatch.
- 2026-06-12: H4 remediation was re-opened after goal continuation because the
  `pidev` wrapper still allowed an `order` on `oc-h4-planner-r2` against the
  same dirty retry worktree `../ocx-h4-r2`. The wrapper warned that no saved pi
  session file existed, so this order could not attach to the prior transcript
  and started a fresh pi conversation on the current dirty H4 worktree context.
  This is still same-tree remediation, not a merge or Codex implementation.
  Ordered scope is limited to the failed H4 stop gates: renderer
  approve-and-execute surface wired to `POST /v1/threads/:id/plan/approve`,
  en/zh/ar i18n and RTL-safe layout, hash-unchanged denial/audit proof,
  thread-store reload persistence proof, API/app-server transition denial
  proof, and mode-state event visibility. Worker pid `89757`, log
  `/Users/mohamedazab/.pidev-orchestrator/oc-h4-planner-r2/run-20260612T125734.log`.
- 2026-06-12: H4 remediation1 reported READY with cost `$0.5834` (in 518,406
  / out 170,379 / cacheRead 57,833,856 / cache 99.1%). Orchestrator reran the
  full command gate inside `../ocx-h4-r2`; it exited 0 (`npm run typecheck`,
  `npm run lint` with 7 warnings, root tests 932/932, Kun typecheck, Kun tests
  486/486, `npm run build`, `git diff --check`). Review accepted the new
  renderer approve surface, locale keys, API route, hash-unchanged denial test,
  and mode event surface, but rejected two stop-gate proofs as still too weak:
  the plan reload test explicitly used `InMemoryThreadStore` and was
  schema-only rather than a persistent store reload, and the API transition
  denial proof did not explicitly show `PATCH /v1/threads/:id` cannot switch a
  plan thread to agent mode. A second same-tree remediation order was issued
  on `oc-h4-planner-r2`; the wrapper again warned that no saved pi session file
  exists, so it started a fresh pi conversation against the current dirty H4
  worktree. Ordered scope: add persistent `HybridThreadStore`/`FileThreadStore`
  reload proof and explicit unauthorized mode-change API denial proof, then
  rerun the full gate. Worker log
  `/Users/mohamedazab/.pidev-orchestrator/oc-h4-planner-r2/run-20260612T132037.log`.
- 2026-06-12: H4 remediation2 reported READY with cost `$0.2463` (in 387,586
  / out 59,117 / cacheRead 7,244,032 / cache 94.9%). Orchestrator reran the
  full gate in `../ocx-h4-r2` and reviewed the corrected stop-gate tests:
  `kun/tests/thread-service.test.ts` now proves plan artifact persistence by
  reloading a new `FileThreadStore`/`ThreadService` from the same temp
  `dataDir`, and `kun/tests/http-server.test.ts` proves `PATCH
  /v1/threads/:id` with `{ mode: "agent" }` fails validation and leaves a plan
  thread in `plan` mode until `POST /v1/threads/:id/plan/approve` records
  `approval_resolved` and transitions to `agent`. H4 lane commit `2c6bea4`
  was merged to `main` as `0ee4c19`. Post-merge main gate exited 0:
  `npm run typecheck`, `npm run lint` (7 warnings), root tests 932/932, Kun
  typecheck, Kun tests 487/487, `npm run build`, and `git diff --check`.
  H5 is now unblocked for rebase/remediation on top of merged H4.
- 2026-06-12: H5 lane `../ocx-h5` was rebased onto merged H4/main
  (`6efdbd3`) with `git rebase --autostash main`; the worker's dirty H5
  changes were reapplied. Same-tree remediation was ordered on
  `oc-h5-checkpoint` with `--max` after rejecting the prior READY report's
  phase-scope gaps: missing automatic checkpoint before the first mutating
  execute-mode tool call, no persistent checkpoint store, no renderer settings
  retention controls, incomplete Phase 6 managed-worktree fork registration,
  and no plan-mode/read-only awareness. The wrapper warned that no saved pi
  session file exists, so the order started a fresh pi conversation against
  the existing dirty H5 worktree rather than attaching to the old transcript.
- 2026-06-12: H5 remediation1 was stopped by the orchestrator after repeated
  CPU-bound hangs in the worker-added
  `kun/tests/checkpoint-loop-integration.test.ts` focused Vitest runs. The
  orchestrator terminated only stuck Vitest subprocesses at first, then stopped
  the same H5 pidev run after the filtered `plan mode` test also hung. Cost:
  `$1.0920` (in 1,059,997 / out 270,774 / cacheRead 109,058,048 / cache
  99.0%). The dirty H5 worktree was retained. A second same-tree remediation
  order was issued on `oc-h5-checkpoint` with `--max`; the wrapper again
  warned that no saved pi session file exists, so it started a fresh pi
  conversation on the current dirty worktree. Ordered scope is to root-cause
  and replace the hanging loop-integration test design before completing the
  original H5 stop gates and full verification block.
- 2026-06-12: H5 remediation2 reported READY with cost `$0.3947` (in 512,758
  / out 116,583 / cacheRead 19,365,760 / cache 97.4%). The orchestrator
  independently ran the full H5 command gate in `../ocx-h5`; it exited 0:
  `npm run typecheck`, `npm run lint` (7 warnings), root tests 932/932, Kun
  typecheck, Kun tests 510/510, `npm run build`, and `git diff --check`.
  Stop-gate review rejected the lane despite the green command gate:
  `CheckpointService` captured only `HEAD^{tree}` plus untracked files, so
  pre-turn tracked/staged dirty state would not restore; code restore used
  `git stash` and `git reset --hard`; the "file-backed persistence" test used
  the same `InMemoryCheckpointStore`; fork worktrees were plain `git worktree
  add` without Phase 6 managed metadata/audit/handoff proof; and restore event
  proof was too weak. A third same-tree remediation order was issued on
  `oc-h5-checkpoint` with `--max`; the wrapper again warned that no saved pi
  session file exists, so it started a fresh pi conversation on the current
  dirty H5 worktree.
- 2026-06-12: H5 remediation3 reported READY with cost `$0.4313` (in 392,276
  / out 195,973 / cacheRead 24,880,128 / cache 98.4%). The orchestrator
  independently reran the full H5 command gate in `../ocx-h5`; it exited 0:
  `npm run typecheck`, `npm run lint` (7 warnings), root tests 932/932, Kun
  typecheck, Kun tests 520/520, `npm run build`, and `git diff --check`.
  Stop-gate review still rejected the lane: code restore still calls
  `git reset --hard`; post-checkpoint untracked mutations are blocked as dirty
  instead of being removed during restore; staged checkpoint state is only
  applied to the worktree, not restored as staged index state; fork worktrees
  are created from checkpoint `HEAD` only, so checkpoints containing staged,
  unstaged, or untracked pre-turn state do not produce a worktree matching the
  snapshot; and the dirty-state warning mentions explicit confirmation but
  the restore API has no confirmation override path. A fourth same-tree
  remediation order was issued on `oc-h5-checkpoint` with `--max`; the wrapper
  again warned that no saved pi session file exists, so it started a fresh pi
  conversation on the current dirty H5 worktree. Worker log:
  `/Users/mohamedazab/.pidev-orchestrator/oc-h5-checkpoint/run-20260612T141325.log`.
- 2026-06-12: H5 remediation4 was stopped by the orchestrator after it entered
  a high-output/low-progress state: the log grew past 540 MB, CPU stayed under
  2%, no files changed in the preceding two-minute check, and no READY/BLOCKED
  line or verification report was emitted. Cost: `$0.5351` (in 724,009 / out
  166,688 / cacheRead 20,716,800 / cache 96.6%). The wrapper report showed
  the worker was mid-fix and had identified a concrete restore bug: checkpoint
  data under `.chkpts/` was being treated as post-checkpoint untracked data and
  deleted before extraction. The dirty H5 worktree is retained, and a fifth
  same-tree recovery order was issued to continue and finish from that
  specific bug without expanding scope; the wrapper again warned that no saved
  pi session file exists, so it started a fresh pi conversation. Worker log:
  `/Users/mohamedazab/.pidev-orchestrator/oc-h5-checkpoint/run-20260612T142407.log`.
- 2026-06-12: H5 remediation5 reported no new tree edits but summarized the
  final `.chkpts` artifact-preservation fix from the existing dirty H5 tree.
  Cost: `$0.1811` (in 272,671 / out 52,697 / cacheRead 4,579,840 / cache
  94.4%). Orchestrator treated the report as suspect because it lacked the
  required READY sentinel and the wrapper warned `NO_TREE_CHANGES`; independent
  review and verification were therefore rerun from the actual worktree.
  The H5 lane commit `7d81947` was merged to `main` as `4bfe95f`. Post-merge
  main gate exited 0: `npm run typecheck`, `npm run lint` (7 warnings), root
  tests 932/932, Kun typecheck, Kun tests 525/525, `npm run build`, and
  `git diff --check`. Stop-gate review accepted the new tests for staged/index
  restore state, post-checkpoint untracked cleanup plus checkpoint untracked
  restoration, no stash/reset-hard restore proof, full dirty-snapshot fork
  worktree content/status with Phase 6 metadata/audit, code/conversation/both
  restore semantics, retention cleanup, visible timeline/settings surface, and
  en/zh/ar locale parity. The UI sends `confirmDirtyOverwrite` after its
  destructive restore confirmation; API callers still get a typed 409 dirty
  block unless they pass the explicit confirmation flag.
- 2026-06-12: Wave 3 worktrees were created from fresh `main` `5b63f30`:
  `../ocx-h6` on `phase/h6-browser`, `../ocx-h7` on `phase/h7-hooks`, and
  `../ocx-h8` on `phase/h8-goal-loop`. Preflight passed for `oc-h6-browser`,
  `oc-h7-hooks`, and `oc-h8-goal-loop`; H7/H8 noted live pi workers elsewhere
  but confirmed per-tree isolation and clean target trees. Dispatched H6 and
  H7 with `--max`, and H8 with `--thinking high`, each using the phase doc
  Short Launcher Prompt verbatim. Worker logs:
  `/Users/mohamedazab/.pidev-orchestrator/oc-h6-browser/run-20260612T143245.log`,
  `/Users/mohamedazab/.pidev-orchestrator/oc-h7-hooks/run-20260612T143245.log`,
  and `/Users/mohamedazab/.pidev-orchestrator/oc-h8-goal-loop/run-20260612T143245.log`.
