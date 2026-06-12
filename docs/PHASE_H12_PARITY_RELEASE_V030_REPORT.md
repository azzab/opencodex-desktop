# Phase H12 Parity Release v0.3.0 Report

Date: 2026-06-12
Target: `0.3.0-rc`

## Summary

H12 re-audits the completed H-series harness milestone after H1-H11 merged on
`main`. The result is release-readiness evidence for a v0.3.0 release
candidate, not publish authorization.

Zero unpatched fix-now security findings remain. Remaining release work is
operator-controlled and listed in `docs/release/0.3.0-operator-runbook.md`.

## H-Series Evidence

| Phase | Merge | Evidence pointer |
| --- | --- | --- |
| H1 Arabic i18n | `dfe60ef` | `src/renderer/src/locales/locale-coverage.test.ts`; full Arabic key parity now enforced |
| H2 telemetry dashboard | `4c92769` | `src/renderer/src/components/UsagePanel.test.ts`; usage routes and live local usage proof in `docs/phases/OC_BUILD_LOG.md` |
| H3 terminal panel | `84f1fb4` | `src/renderer/src/components/terminal/TerminalPanel.test.ts`; `node-pty` smoke and packaged PTY proof in ledger |
| H3.5 Electron security | `29ae887` | `npm audit` evidence in ledger; packaged Electron `39.8.10` fallback accepted after 42.4.0 stop gate failed |
| H4 planner/executor split | `0ee4c19` | `kun/tests/plan-mode-isolation.test.ts`; plan artifact and approval gate coverage |
| H5 checkpoint rewind | `4bfe95f` | `kun/tests/checkpoint-service.test.ts`; `kun/tests/checkpoint-loop-integration.test.ts` |
| H6 browser sidecar | `82592a0` | Playwright sidecar tests and real smoke evidence in ledger |
| H7 hooks trust | `8f13b76` | hook trust/revocation/reload tests and managed-runtime bridge evidence |
| H8 goal scheduler | `5ac3826` | scheduler/store/routes tests and automation UI coverage |
| H9 CLI and IDE clients | `990e526` | CLI/VSIX package proof, CLI smoke, and client package tests in ledger |
| H10 SSH runner | `69438fd` | remote-runner service/IPCs/UI tests, no-secret greps, and redacted real-host smoke |
| H11 upstream Wave-8 ports | `4b66c10` | `H11_8D_READY_FOR_ORCHESTRATOR_REVIEW.md`; H4/H5/store/SSE targeted reruns |

## Updated Parity Matrix

| Capability | v0.3.0 status | Evidence | Honest gap |
| --- | --- | --- | --- |
| Projects and workspace roots | Implemented/proven | Git root discovery port in H11 (`src/main/services/git-discovery.test.ts`) and workspace settings tests | Manual multi-root packaged-app smoke remains operator work |
| Threads, turns, SSE | Implemented/proven | `src/renderer/src/agent/kun-runtime.test.ts`, `src/renderer/src/agent/kun-mapper.test.ts`, H11 SSE batching report | Live-provider smoke remains operator work |
| Approvals and user input | Implemented/proven | H4 approval transition tests, H10 remote approval tests, CLI approval smoke in H9 ledger | Publish approval remains manual |
| App-server, CLI, IDE | Implemented/proven | H9 CLI package tests, VS Code extension tests, app-server protocol tests | External marketplace publishing remains out of scope |
| Git, worktrees, review | Implemented/proven | H11 git discovery tests; checkpoint fork worktree tests | Cloud PR hosting/review automation is not claimed |
| Terminal and filesystem tools | Implemented/proven | H3 terminal tests, PTY smoke, sandbox policy tests | Operator must still choose sandbox settings for risky workspaces |
| Browser/computer control | Browser sidecar guarded | H6 allowlist/evidence tests and real Playwright smoke | General OS computer control is not implemented |
| Skills, plugins, hooks, memory | Implemented with trust controls | H7 hook trust/revocation tests; plugin/skill surfaces remain settings-bound | Public marketplace publishing is not implemented |
| MCP | Implemented locally, guarded remotely | MCP config tests and H10 data-egress policy | Exporting MCP secrets to remote runners remains forbidden |
| Automations and scheduling | Implemented/proven | H8 scheduler and loop store tests | Mobile push/relay is not implemented |
| Subagents | Partial | Delegation contracts and child-agent execution surfaces exist | Full cloud subagent fleet orchestration is not implemented |
| Model routing, providers, cost | Implemented/proven | H2 usage/cache telemetry and provider settings tests | Live-provider readiness requires operator smoke |
| Usage/token economy | Implemented/proven | Usage panel tests and H11 duplicate usage cleanup | Provider-billed totals depend on live provider smoke |
| Remote and mobile | SSH remote runner implemented; mobile protocol still gap | H10 outbound-only SSH runner tests and real-host smoke | Mobile relay/companion remains future work |
| Artifacts, write, export | Partial | Existing write/workbench modules and file preview tests | Tiptap rich write mode and image generation from upstream develop remain deferred |
| Localization | Implemented/proven for en/zh/ar keys | `src/renderer/src/locales/locale-coverage.test.ts` en/zh parity, Arabic full key parity, non-empty Arabic, untranslated-value checks | Manual RTL screenshot pass remains operator evidence |
| Packaging/updater | Local release candidate mechanics proven | `npm run smoke:release`, Electron Builder packaging scripts, H3.5 DMG proof | Signing, notarization, update-channel promotion, and rollback proof are manual |
| Release docs | Implemented | This report and `docs/release/0.3.0-operator-runbook.md` | Public release notes are not created until publish approval |

## Security Review

| Surface | Review result | Evidence | Finding status |
| --- | --- | --- | --- |
| Terminal panel | PTY cwd scoping, output observation, and orphan cleanup covered | `src/renderer/src/components/terminal/TerminalPanel.test.ts`; H3 node-pty smoke | No fix-now findings |
| Plan-mode isolation | Write/exec/MCP mutation attempts denied in plan mode | `kun/tests/plan-mode-isolation.test.ts`; H11 rerun 24/24 | No fix-now findings |
| Checkpoints | Code/conversation restore protects dirty user state and untracked files | `kun/tests/checkpoint-service.test.ts`; `kun/tests/checkpoint-loop-integration.test.ts` | No fix-now findings |
| Browser sidecar | Disabled-by-default, host allowlist, evidence capture, and no bundled browser artifacts reviewed | H6 ledger Playwright smoke 4/4 | No fix-now findings |
| Hooks | Trust records, timeout/kill switch, reload route, and revocation behavior reviewed | H7 merge evidence and managed-runtime hook bridge tests | No fix-now findings |
| Goal scheduler | Budget and approval boundaries preserved for looped work | H8 scheduler/store/route tests | No fix-now findings |
| CLI/IDE clients | Loopback-only server, approval round-trip, and package install tests passed | H9 CLI smoke and VSIX package evidence | No fix-now findings |
| SSH runner | Credential values not persisted in repo docs/tests; outbound-only, approval-gated execution, trust, reconnect/stop/resume reviewed | H10 no-secret grep, app-server/IPCs/UI tests, redacted real-host smoke | No fix-now findings |
| H11 upstream ports | OpenCodex sandbox default preserved; Kun remains the only runtime | `kun/src/contracts/policy.ts`; `kun/src/domain/thread.ts`; H11 report | No fix-now findings |

Documented risks that stay out of v0.3.0 scope: general computer control,
cloud worker fleets, mobile relay, marketplace publishing, Tiptap rich write,
SDD traceability, and image generation provider integration.

## Localization Reverification

Command evidence:

```bash
npm test -- src/renderer/src/locales/locale-coverage.test.ts
```

Expected/observed contract:

- English and Chinese keys match in every namespace.
- Arabic keys match English in every namespace.
- Arabic values are non-empty.
- Arabic values are not identical to English unless whitelisted as proper nouns,
  pure placeholders, or structural identifiers.

Manual RTL review remains in the operator runbook for the packaged app because
screenshots and first-run behavior are external/operator proof.

## Packaging And Readiness

H12 readiness command target:

```text
opencodex-desktop-v0.3.0-rc-release-readiness
```

Local gates added to `npm run release:readiness`:

- `package.json` version is `0.3.0-rc`.
- `docs/PHASE_H12_PARITY_RELEASE_V030_REPORT.md` exists.
- `docs/release/0.3.0-operator-runbook.md` exists.
- This report contains the new-surface security review completion marker.
- This report contains Arabic parity re-verification evidence.

The command remains read-only and redacted. It reports missing operator gates as
blockers in default mode but exits 0 unless `--strict` is used.

## H12 Verification

Final H12 verification commands and results:

| Command | Result |
| --- | --- |
| `npm test -- src/main/release-readiness.test.ts src/renderer/src/locales/locale-coverage.test.ts` | Passed: 2 files, 11 tests |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed: 0 errors, 7 existing hook-dependency warnings |
| `npm test` | Passed: 150 files, 1184 tests |
| `npm --prefix kun run typecheck` | Passed |
| `npm --prefix kun run test` | Passed: 58 files passed / 1 skipped, 658 tests passed / 4 skipped |
| `npm run build` | Passed |
| `npm run smoke:release` | Passed: `[release-smoke] ok renderer_loaded` and `[release-smoke-script] passed` |
| `npm run dist:mac:arm64:dmg` | Passed: produced `dist/OpenCodex-Desktop-0.3.0-rc-mac-arm64.dmg` and blockmap; signing/notarization skipped because operator credentials are absent |
| `npm run release:readiness` | Passed in default mode with local v0.3.0 gates OK and only manual operator blockers |
| `npm audit` | Passed: 0 vulnerabilities |
| `git diff --check` | Passed |

Final `npm run release:readiness -- --json` status:

```text
target: opencodex-desktop-v0.3.0-rc-release-readiness
status: blocked
local v0.3.0 gates: all ok
blockers: missing_operator_release_approval, missing_mac_signing_or_unsigned_beta_decision, missing_manual_packaged_app_smoke, missing_live_provider_smoke, missing_arabic_release_scope_decision, missing_update_rollback_notes, missing_publish_authorization
```

## Remaining Manual Operator Gates

No H12 release mutation was performed. The remaining manual gates are:

- macOS signing/notarization or explicit unsigned local-beta decision;
- manual packaged-app smoke over first run, settings, provider selection, chat,
  approvals, changed-file review, locale switch including Arabic RTL, restart,
  and packaged relaunch;
- live-provider smoke with redacted evidence if provider readiness is claimed;
- update-channel and rollback notes;
- publish authorization before any tag, GitHub release, R2 upload, or update
  channel promotion.
