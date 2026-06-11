# Phase 10 Parity Hardening And Release Report

Date: 2026-06-10

Follow-up: `docs/WAVE_3_4_UPSTREAM_PARITY_RELEASE_PREP.md` records later
Wave 2-4 upstream ingestion. Where this Phase 10 report marks endpoint-format,
composer, SDD draft recovery, Feishu/Lark, or chat UI fixes as deferred, the
Wave 3/4 report is the newer source of truth for what was subsequently ported
or intentionally skipped.

Follow-up: `docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md` records later
release-candidate smoke and packaging evidence. Where this Phase 10 report
marks packaging dry-run as blocked, the Wave 5 report is the newer source of
truth.

Follow-up: `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md` records the
redacted release-readiness command, refreshed upstream `develop` drift, and the
remaining operator-only release authorization gates.

Prompt source: `docs/prompts/PHASE_10_PARITY_HARDENING_RELEASE.md`

## Summary

Phase 10 is a hardening and readiness slice, not a release. This pass audited
the current OpenCodex Desktop tree after Phase 9, fetched the latest upstream
DeepSeek GUI branch from GitHub, ported narrow low-risk fixes, added regression
tests, and documented the remaining blockers for a deliberate beta decision.

The app is not release-ready as a full English, Arabic, and Chinese product.
English and Chinese locale keys now have parity checks. Arabic is wired as a
supported RTL locale and its keys are valid fallback keys, but the Arabic files
do not yet fully cover the product surface.

## Implemented In This Slice

- Hardened the Phase 9 remote-runner data policy so fixed secret and host-local
  data classes cannot be relayed even if a runner omits them from `never`.
- Added a focused regression for remote-runner egress policy bypass attempts.
- Moved the OpenCodex managed Kun default away from the upstream DeepSeek GUI
  default port:
  - OpenCodex Kun default: `127.0.0.1:18999`
  - upstream DeepSeek GUI Kun legacy default: `127.0.0.1:8899`
  - legacy settings using `8899` are upgraded to `18999` unless the user has a
    clearly custom non-default port.
- Updated Kun docs and example config to use `~/.opencodex/kun` and port
  `18999`.
- Added a managed-runtime idle wait before restart/update paths stop the local
  runtime, reducing the chance of interrupting active turns.
- Ported the upstream custom provider persistence fix by preserving provider
  profiles during legacy settings migration.
- Batched model provider profile updates with active-provider changes so add and
  remove flows commit a coherent single settings patch.
- Added locale key coverage tests:
  - English and Chinese must have matching `common` and `settings` key sets.
  - Arabic may be partial, but Arabic keys may not point to missing English
    fallback keys.

## Direct Phase 9 Review

Phase 9 remains a schema and documentation foundation only. It defines runner
handshakes, SSH host references, data egress policy, credential redaction,
budgets, approvals, audit requirements, and stop/resume/reconnect messages.

No SSH execution, cloud worker, public listener, remote filesystem mutation, or
remote command path is present in this tree.

The main issue found in the Phase 9 review was that the data policy treated
`policy.never` as runner-supplied policy. A malicious or buggy future runner
could omit `api_keys`, `env_values`, or similar classes from `never` and then
place them in `defaultAllowed` or `consentRequired`. The fix makes those data
classes host-fixed and non-relayable regardless of runner input.

## Upstream DeepSeek GUI Review

Remote:

```text
upstream https://github.com/XingYu-Zhong/DeepSeek-GUI.git
```

Fetched state:

- `upstream/master`: `f1f8d1b`, tag `v0.2.8`
- `upstream/develop`: `f00d610`
- Compared from fork base `a6c71d0` to `upstream/master`
- Delta size: 72 files, 4660 insertions, 294 deletions

Notable upstream changes reviewed:

| Upstream area | Decision | Reason |
| --- | --- | --- |
| Runtime idle wait before restart | Ported in scoped form | Directly protects active turns during managed Kun restarts. |
| Custom model providers lost on restart | Ported | Matches current provider settings model and prevents user config loss. |
| Add provider no-response fix | Ported in scoped form | Batching provider and active-provider updates removes inconsistent intermediate state. |
| Locale key parity for MCP config labels | Ported | Prevents Arabic-only extra keys and restores en/zh fallback parity. |
| Configurable endpoint formats | Deferred | Larger provider/client contract change that needs a separate design and tests. |
| Default sandbox to `danger-full-access` | Rejected for this fork | Conflicts with OpenCodex hardening and permission posture. |
| Composer, SDD draft recovery, Feishu/Lark, and chat UI fixes | Deferred | Useful candidates, but too broad for this release-readiness pass. |

No broad upstream merge was performed.

## Parity Matrix

| Capability | Current status | Evidence and gap |
| --- | --- | --- |
| Projects and workspace roots | Implemented/proven | Existing workspace path services, project sidebar, and settings tests are present. Release still needs manual multi-root smoke. |
| Threads, turns, and SSE | Implemented/proven | Kun HTTP/SSE contract, runtime adapter tests, and managed idle wait tests cover local thread lifecycle. |
| Approvals and user input | Implemented/proven locally | Kun approval contracts exist. Remote approval semantics are Phase 9 schema only. |
| App-server, CLI, and IDE bridge | Partial | Phase 8 app-server protocol bridge exists. External CLI/IDE bridge needs operator smoke before parity claims. |
| Git, worktrees, and review | Partial | Local tools and workbench surfaces exist. Release report keeps PR/review workflow as a manual smoke item. |
| Terminal and filesystem tools | Implemented locally | Kun local tool host and sandbox mode are present. Security posture depends on settings and approval policy. |
| Browser and computer control | Partial and guarded | Dev-preview URL allowlisting and webview hardening are present. Unrestricted computer control is not implemented. |
| Skills, plugins, hooks, memory | Partial | Skills/plugin surfaces exist. Hook execution and trust boundaries need full security review before release messaging. |
| MCP | Partial | MCP config UI strings and schema-backed settings exist. Remote MCP credential handling remains non-execution protocol only. |
| Automations, schedule, phone | Partial | Schedule and phone connector surfaces exist, but live operator proof is outside this pass. |
| Subagents | Partial | Review/delegate semantics exist in earlier phases. Full parallel subagent orchestration remains a parity gap. |
| Model routing, provider catalog, and cost | Implemented/partial | DeepSeek and OpenRouter settings, provider profiles, and usage surfaces exist. Endpoint format variants from upstream are deferred. |
| Usage and token economy | Implemented/proven | Kun usage and cache telemetry tests exist. Release still needs live-model smoke with redacted evidence. |
| Remote and mobile | Protocol-only | Phase 9 remote runner and companion docs exist. No remote executor or mobile relay is implemented. |
| Artifacts, write, and export | Partial | Write/retrieval and inline completion modules exist. Export artifact workflows require release smoke. |
| Localization | Blocked for full release | English/Chinese key parity is tested. Arabic RTL wiring exists, but Arabic translation coverage is incomplete. |
| Packaging and updater | Partial | Packaging/updater tests exist. Signed, notarized, and channel-specific update proof is still needed. |
| Release docs | Partial | This report is release-readiness evidence, not a release note or publish approval. |

## Security Review

| Area | Current status | Notes |
| --- | --- | --- |
| Renderer isolation and CSP | Good local posture | CSP is self-only for scripts, limited image/font sources, and inline style allowance. BrowserWindow uses context isolation and sandbox. |
| Preload and IPC | Good local posture | IPC payloads are schema-backed. External URL opening is protocol-limited. |
| Secrets and redaction | Improved | Phase 9 fixed never-relayed classes now include API keys, OAuth tokens, MCP credentials, environment values, and keychain material. |
| MCP | Guarded/partial | MCP settings exist, but remote credential export remains forbidden at schema level. Live connector trust review remains pending. |
| Browser/computer control | Guarded/partial | Webview permissions are constrained and navigation is allowlisted for dev preview. Full computer control is intentionally absent. |
| Remote/mobile | Protocol-only | No remote executor exists. Future implementation must keep host approval and audit requirements mandatory. |
| Hooks, plugins, and skills | Needs full release review | Plugin and skill surfaces should receive a dedicated trust-boundary audit before public beta claims. |
| Updater and packaging | Needs operator proof | Tests cover config behavior, but signed/notarized update-channel proof is still required. |
| Ports and data dirs | Improved | OpenCodex managed Kun now defaults to `18999` and `~/.opencodex/kun`, avoiding the upstream DeepSeek GUI default. |

## Localization Review

Locale behavior present in code:

- Supported locale values: `en`, `zh`, `ar`
- Arabic document locale: `<html lang="ar" dir="rtl">`
- English and Chinese fallback resources are loaded directly.
- Arabic falls back to English for missing strings.

Coverage after this slice:

| Namespace | English keys | Chinese keys | Arabic keys | Arabic missing keys | Arabic extra keys |
| --- | ---: | ---: | ---: | ---: | ---: |
| `common` | 1400 | 1400 | 189 | 1211 | 0 |
| `settings` | 564 | 564 | 123 | 441 | 0 |

Release interpretation:

- English and Chinese key parity is now enforced by tests.
- Arabic is structurally valid and RTL-capable.
- Arabic is not fully translated. A public Arabic-ready release requires either
  completing the Arabic locale files or explicitly branding the beta as partial
  Arabic support.
- Manual RTL screenshots and core-flow smoke checks are still required.

## Packaging And Release Readiness

Current release state:

- No release was published.
- No tag was pushed.
- No binaries were uploaded.
- No update channel was promoted.

Before a beta/release decision, the project still needs:

- Full verification gates on the final tree.
- Packaging dry-run evidence is recorded in
  `docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md`.
- Release authorization gate status can now be inspected with
  `npm run release:readiness -- --json`; see
  `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md`.
- Signed and notarized macOS build evidence, or an explicit unsigned local-beta
  decision.
- Updater channel and rollback notes.
- Manual smoke of first run, settings, provider selection, chat, approvals,
  workbench diagnostics, locale switch, and app restart.
- Arabic completion or a scoped partial-Arabic beta decision.
- Separate planning for deferred upstream v0.2.8 endpoint-format and UI fixes.

## Verification

Focused verification passed:

```text
npm test -- src/shared/remote-runner-protocol.test.ts src/renderer/src/locales/locale-coverage.test.ts src/main/runtime/managed-runtime-idle.test.ts src/shared/app-settings.test.ts src/renderer/src/components/settings-section-agents.test.ts src/main/kun-regression.test.ts
```

Result: 6 test files passed, 74 tests passed.

Full verification passed:

| Command | Result |
| --- | --- |
| `npm test` | Passed: 132 files, 804 tests |
| `npm run typecheck` | Passed |
| `npm --prefix kun run typecheck` | Passed |
| `npm --prefix kun test` | Passed: 45 files, 447 tests |
| `npm run build` | Passed: Kun build plus Electron main/preload/renderer build |
| `git diff --check` | Passed |

Packaging dry-run was attempted with:

```text
npx --yes electron-builder@26.8.1 --config electron-builder.config.cjs --publish never --dir --mac --arm64
```

Original Phase 10 result: failed in local Electron Builder packaging after
downloading Electron `34.5.8` for macOS arm64. The extracted app bundle was
missing `Electron.app/Contents/MacOS/Electron`, and Electron Builder failed while
renaming it to `OpenCodex Desktop`.

Wave 5 follow-up: the root cause was a corrupt global Electron cache archive at
`~/Library/Caches/electron/electron-v34.5.8-darwin-arm64.zip`. Release tooling
now uses repo-local Electron and Electron Builder caches, and the macOS arm64
unsigned package dry-run completes. See
`docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md`.
