# Wave 6 Release Authorization Readiness

Date: 2026-06-10

Follow-up: `docs/WAVE_7_UPSTREAM_DEVELOP_DRIFT_AUDIT.md` records the
post-`v0.2.8` `upstream/develop` drift audit and future-lane split
recommendation.

Operator checklist: `docs/release/0.2.8-operator-runbook.md` records the exact
manual smoke, live-provider smoke, signing, update, rollback, and publish
authorization steps.

## Scope

Wave 6 closes the local release-readiness checklist for the DeepSeek GUI
`v0.2.8` ingestion lane by making the remaining operator gates explicit and
machine-readable.

It does not publish a release, create a tag, push to a remote, upload artifacts,
promote an update channel, notarize a build, or claim live-provider readiness.

## Implemented

- Added a read-only release readiness command:
  - `scripts/release-readiness.cjs`
  - `npm run release:readiness`
- Added Wave 6 regression coverage:
  - `src/main/release-readiness.test.ts`
- The command reports:
  - operator gate presence;
  - macOS signing/notarization credential key presence;
  - R2/update-channel credential key presence;
  - packaged macOS arm64 app artifact presence;
  - `status: "ready"` or `status: "blocked"`;
  - explicit blocker codes.
- The command does not print credential values. It only prints key names,
  presence booleans, relative artifact paths, blockers, and warnings.

## Command Usage

Human-readable report:

```bash
npm run release:readiness
```

JSON report:

```bash
npm run release:readiness -- --json
```

Strict gate mode:

```bash
npm run release:readiness -- --strict
```

Default mode exits `0` even when blocked so operators can inspect the report.
`--strict` exits `1` when release gates are missing.

## Operator Gates

Set these only after the corresponding proof exists:

```bash
OPENCODEX_RELEASE_OPERATOR_APPROVED=1
OPENCODEX_RELEASE_MAC_SIGNING_DECISION=signed-notarized
# or:
OPENCODEX_RELEASE_MAC_SIGNING_DECISION=unsigned-local-beta
OPENCODEX_RELEASE_MANUAL_PACKAGED_SMOKE=1
OPENCODEX_RELEASE_LIVE_PROVIDER_SMOKE=1
OPENCODEX_RELEASE_ARABIC_SCOPE=complete
# or:
OPENCODEX_RELEASE_ARABIC_SCOPE=partial-beta
OPENCODEX_RELEASE_UPDATE_ROLLBACK_NOTES=1
OPENCODEX_RELEASE_PUBLISH_AUTHORIZED=1
```

If `OPENCODEX_RELEASE_MAC_SIGNING_DECISION=signed-notarized`, signing and
notary key presence is required. If the decision is `unsigned-local-beta`, the
readiness report emits a warning so release notes can clearly describe the
unsigned local-beta behavior.

If `OPENCODEX_RELEASE_PUBLISH_AUTHORIZED=1`, R2/update-channel key presence is
required before the report can be `ready`.

## Artifact Gates

The command checks the Wave 5 macOS arm64 package dry-run output:

- `dist/mac-arm64/OpenCodex Desktop.app/Contents/MacOS/OpenCodex Desktop`
- `dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar`
- unpacked Kun runtime entrypoint;
- unpacked Kun package metadata;
- unpacked Kun runtime dependencies:
  - `zod`
  - `diff`
  - `@modelcontextprotocol/sdk`
- unpacked root `better-sqlite3` dependency.

These checks match the release-candidate package content proved in Wave 5.

## Current Upstream State

Fetched upstream state after the Wave 6 refresh:

| Ref | Commit | Release interpretation |
| --- | --- | --- |
| `upstream/master` | `f1f8d1b` | Tagged `v0.2.8`; still the latest release baseline for this ingestion lane. |
| `upstream/develop` | `e7e8252` | Contains unreleased drift after `v0.2.8`; future-lane audit candidate. |

`git rev-list --left-right --count upstream/master...upstream/develop` returned:

```text
12 17
```

Interpretation: `upstream/develop` is no longer a zero-drift branch relative to
`upstream/master`. It has 17 commits not in the `v0.2.8` release baseline, and
`upstream/master` has 12 commits not in `develop`. Those commits should not be
silently merged into the `0.2.8` release lane. Treat them as the next upstream
drift audit unless the operator explicitly approves pre-release `develop`
ingestion.

Notable unreleased `develop` areas seen in the refresh:

- plan-mode isolation and auto-scroll fixes;
- nearest `.git` root discovery;
- duplicate usage-stat cleanup;
- image generation tool/provider surfaces;
- SDD traceability loop work;
- Tiptap rich write mode;
- runtime and Kun performance/hardening changes.

## Release Interpretation

After Wave 6, local release-candidate mechanics are testable and reportable:

- Wave 5 proves build, release smoke, and unsigned macOS arm64 directory
  packaging.
- Wave 6 turns the remaining release decision into a redacted readiness report.

The tree is still not operator-authorized for public release until the readiness
report is `ready` using real proof gathered by the release operator.

## Remaining Operator Work

The only remaining `0.2.8` lane work is operator-controlled:

- signed and notarized macOS build evidence, or explicit unsigned local-beta
  decision;
- manual packaged-app smoke;
- live-provider smoke with redacted evidence if provider readiness is claimed;
- Arabic release-scope decision;
- update-channel and rollback notes;
- explicit publish authorization;
- tag, GitHub release, R2 upload, and update-channel promotion only after the
  operator authorizes those mutating steps.
