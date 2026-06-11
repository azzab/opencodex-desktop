# Wave 3-4 Upstream Parity And Release Prep

Date: 2026-06-10

Follow-up: `docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md` records the
later release-candidate smoke harness, macOS arm64 unsigned package dry-run,
repo-local Electron Builder cache fix, and the remaining operator-only release
decision phase.

Follow-up: `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md` records the
release-readiness command and refreshed upstream `develop` drift after the
original Wave 3/4 fetch.

## Scope

This report covers the Wave 3 and Wave 4 follow-up after the initial DeepSeek
GUI upstream ingestion waves.

- Wave 3: prove remaining safe upstream parity surfaces and close targeted
  regression gaps.
- Wave 4: record release-prep evidence, intentional skips, and remaining
  operator proof before any beta or public release decision.

No release was published. No tag was created. No upstream push was attempted.

## Source Of Truth

Local repo:

```text
/Users/mohamedazab/opencodex-desktop
```

Upstream:

```text
upstream https://github.com/XingYu-Zhong/DeepSeek-GUI.git
```

Fetched state after `git fetch upstream --tags --prune`:

| Ref | Commit | Status |
| --- | --- | --- |
| `upstream/master` | `f1f8d1b` | Tagged `v0.2.8` |
| `upstream/develop` | `e7e8252` | Unreleased drift after `v0.2.8`; future-lane audit candidate |

`git rev-list --left-right --count upstream/master...upstream/develop` returned:

```text
12 17
```

Interpretation: after the Wave 6 refresh, `upstream/master` remains the
`v0.2.8` release baseline, but `upstream/develop` has 17 commits not in that
baseline. `upstream/master` also has 12 commits not in `develop`, so this is
branch drift, not a clean fast-forward. The `develop` commits should be treated
as a future-lane upstream audit unless the operator explicitly approves
pre-release `develop` ingestion.

## Guardrails Applied

- Kun remains the only live runtime/kernel.
- Electron remains the shell and renderer surface.
- Renderer code does not gain direct shell, filesystem, provider, or credential
  authority.
- Existing dirty and untracked user/worktree changes are preserved.
- English, Arabic, and Chinese locale support is preserved.
- OpenCodex branding and non-affiliation posture stay intact.
- Upstream behavior that weakens OpenCodex safety defaults is documented, not
  silently merged.

## Ported And Verified Upstream Surfaces

| Area | Local status | Evidence |
| --- | --- | --- |
| Linux Wayland IME switches | Ported | `src/main/app-command-line.ts`, `src/main/app-command-line.test.ts`, call in `src/main/index.ts` |
| Scheduled-task detector endpoint formats | Ported | `src/main/claw-scheduled-task-detector.ts`, `src/main/claw-scheduled-task-detector.test.ts` |
| Composer changed-file review card | Ported and wired | `src/renderer/src/lib/composer-change-summary.ts`, `src/renderer/src/components/chat/FloatingComposer.tsx`, `src/renderer/src/components/Workbench.tsx` |
| Composer editability while startup/thread creation is pending | Ported | `src/renderer/src/components/chat/FloatingComposer.test.ts` |
| Feishu/Lark markdown replies | Ported | `src/main/claw-runtime.ts`, `src/main/claw-runtime.test.ts` |
| Feishu/Lark pending `OnIt` reaction | Ported | `src/main/claw-runtime.ts`, `src/main/claw-runtime.test.ts` |
| Feishu/Lark read receipt no-op | Ported and unit-tested in Wave 3 | `registerFeishuReadReceiptNoop()` in `src/main/claw-runtime.ts` |
| Workspace PATCH schema regression | Ported | `src/shared/update-thread-request.test.ts` |
| Runtime idle wait | Already present | `src/main/runtime/managed-runtime-idle.ts`, `src/main/runtime/managed-runtime-idle.test.ts` |
| Runtime scheduler/store regressions | Already present | `src/renderer/src/store/chat-store-runtime*.test.ts`, `src/renderer/src/store/chat-store-schedulers.test.ts` |
| Turn-section derivation regressions | Already present with OpenCodex link adjustment | `src/renderer/src/components/chat/derive-turn-sections.test.ts` |

## Intentional Skips

| Upstream surface | Decision | Reason |
| --- | --- | --- |
| Default sandbox mode `danger-full-access` | Skipped | Conflicts with OpenCodex desktop-agent safety posture. OpenCodex keeps safer defaults unless the user explicitly opts in. |
| Visible composer execution-access picker | Skipped | Upstream also has a test asserting execution controls stay hidden in the composer footer. OpenCodex keeps execution policy in settings/mission-control surfaces instead of exposing a risky footer shortcut. |
| DeepSeek GUI branding/source strings | Skipped | OpenCodex is an independent fork. Compatibility references may remain where needed, but public product branding must remain OpenCodex. |
| Second live runtime or provider switcher outside Kun | Skipped | `docs/AGENTS.md` requires one live runtime: Kun. |
| Unrestricted computer control | Skipped | Privileged automation must stay behind sidecar/native-safe boundaries and policy gates. |
| Remote/mobile executor behavior | Skipped | Current remote/mobile work is protocol/docs only; no executor should be implied or shipped without a separate threat model and approval path. |

## Wave 3 Automated UI/Runtime Proof

Wave 3 used automated renderer and runtime tests instead of launching Electron in
this dirty integration checkout:

- `FloatingComposer.test.ts` proves the changed-file review card renders above
  the input, preview/review labels render, execution controls remain hidden, and
  the composer stays editable while runtime/thread creation is pending.
- `composer-change-summary.test.ts` proves file-change tool blocks are collected
  and aggregated before `Workbench` passes them to the composer.
- `claw-runtime.test.ts` proves markdown replies, fallback retries, pending
  reactions, read-receipt no-op registration, and no pending reaction for local
  IM commands.
- Production build remains the renderer bundle proof.

Manual Electron screenshots are still useful release evidence, but they are not
treated as stronger proof than these tests for this integration wave.

## Wave 4 Release-Prep Checklist

Local integration proof required before calling the waves complete:

- Focused Wave 3-4 regression tests.
- Root TypeScript typecheck.
- Kun TypeScript typecheck.
- Root Vitest suite.
- Kun Vitest suite.
- Production build.
- `git diff --check`.

Operator proof still required before a beta or public release decision:

- Manual Electron smoke for first-run, settings, provider selection, chat,
  approvals, changed-file review card, locale switch, and app restart.
- Packaging dry-run evidence is recorded in
  `docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md`; signed/notarized macOS
  build proof or an explicit unsigned local-beta decision is still required.
- Update-channel and rollback notes.
- Arabic completion or an explicit partial-Arabic beta statement.
- Live-provider smoke with redacted evidence if release notes claim provider
  readiness beyond local tests.
- Separate trust-boundary review for plugin/skill/hook execution surfaces before
  any broad automation claim.

## Current Release Interpretation

Wave 3 and Wave 4 are integration-readiness waves, not release authorization.

The local tree can be considered upstream-parity-hardened for the selected safe
DeepSeek GUI `v0.2.8` surfaces once the verification commands in this report
pass on the final worktree. Public release still requires the operator proof
listed above.
