# Wave 5 Release Candidate Smoke And Packaging

Date: 2026-06-10

Follow-up: `docs/WAVE_6_RELEASE_AUTHORIZATION_READINESS.md` records the
redacted release-readiness command, refreshed upstream `develop` drift, and the
remaining operator-only authorization gates.

## Scope

Wave 5 turns the Wave 3-4 integration-ready tree into local release-candidate
evidence. It does not publish a release, create a tag, push to a remote, upload
artifacts, or promote an update channel.

## Implemented

- Added a repeatable Electron release smoke harness:
  - `src/main/release-smoke.ts`
  - `src/main/release-smoke.test.ts`
  - `scripts/release-smoke.cjs`
  - `npm run smoke:release`
- Wired smoke mode into the Electron main process with
  `OPENCODEX_DESKTOP_RELEASE_SMOKE=1`:
  - optional isolated user data through
    `OPENCODEX_DESKTOP_RELEASE_SMOKE_USER_DATA`;
  - hidden startup window;
  - timeout failure;
  - failure on preload, renderer load, render-process, or startup errors;
  - success on renderer `did-finish-load`.
- Added `scripts/run-electron-builder.cjs` and routed npm packaging scripts
  through it so Electron Builder uses repo-local caches:
  - `.cache/electron-builder`
  - `.cache/electron`
- Updated release helpers so macOS and Windows release scripts also set
  `ELECTRON_CACHE` in addition to `ELECTRON_BUILDER_CACHE`.

## Packaging Root Cause Found

The first Wave 5 package dry-run hung inside:

```text
app-builder_arm64 unpack-electron
```

The generated bundle at `dist/mac-arm64/Electron.app` was incomplete:

```text
dist/mac-arm64/Electron.app/Contents/MacOS/
```

The `Electron` executable was missing. The root cause was a corrupt global
Electron cache archive:

```text
~/Library/Caches/electron/electron-v34.5.8-darwin-arm64.zip
```

`unzip -t` reported:

```text
349564320 extra bytes at beginning or within zipfile
bad zipfile offset
invalid compressed data to inflate
```

The fix was to stop depending on that global cache by setting repo-local
Electron and Electron Builder cache paths in release tooling.

## Evidence

Focused smoke and packaging config tests:

```bash
npm test -- src/main/release-smoke.test.ts src/main/packaging-config.test.ts
```

Result:

```text
2 test files passed, 10 tests passed
```

Release smoke:

```bash
npm run smoke:release
```

Result:

```text
[release-smoke] ok renderer_loaded
[release-smoke-script] passed
```

Package dry-run:

```bash
node ./scripts/run-electron-builder.cjs --config electron-builder.config.cjs --publish never --dir --mac --arm64
```

Result:

```text
electron-builder 26.8.1 completed with exit code 0
skipped macOS code signing because identity is explicitly set to null
No Apple notary credentials found, skipping notarization
```

Package content checks:

```text
dist/mac-arm64/OpenCodex Desktop.app/Contents/MacOS/OpenCodex Desktop present and executable
dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar present
app.asar.unpacked/kun/dist/cli/serve-entry.js present
app.asar.unpacked/kun/node_modules/zod/package.json present
app.asar.unpacked/kun/node_modules/diff/package.json present
app.asar.unpacked/kun/node_modules/@modelcontextprotocol/sdk/package.json present
app.asar.unpacked/node_modules/better-sqlite3/package.json present
```

Repo-local Electron cache check:

```bash
unzip -t .cache/electron/electron-v34.5.8-darwin-arm64.zip
```

Result:

```text
No errors detected in compressed data
```

Final verification:

| Command | Result |
| --- | --- |
| `npm test -- src/main/release-smoke.test.ts src/main/packaging-config.test.ts` | Passed: 2 files, 10 tests |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 137 files, 836 tests |
| `npm --prefix kun run typecheck` | Passed |
| `npm --prefix kun test` | Passed: 45 files, 451 tests |
| `npm run smoke:release` | Passed: build plus `[release-smoke] ok renderer_loaded` |
| `node ./scripts/run-electron-builder.cjs --config electron-builder.config.cjs --publish never --dir --mac --arm64` | Passed: unsigned macOS arm64 app directory |
| `git diff --check` | Passed |

## Release Interpretation

Wave 5 proves local release-candidate mechanics:

- production build works;
- built Electron main boots;
- renderer loads in an isolated smoke profile;
- macOS arm64 unsigned directory packaging works;
- required unpacked Kun runtime assets are present in the packaged app.

Wave 5 is still not release authorization. The remaining phase is an
operator-controlled release decision phase.

Wave 6 adds a read-only command to report those release gates:

```bash
npm run release:readiness -- --json
```

## Remaining Operator Phase

Before a beta or public release, the project still needs:

- signed and notarized macOS build evidence, or an explicit unsigned local-beta
  decision;
- manual Electron smoke with an operator watching first-run, settings, provider
  selection, chat, approvals, changed-file review card, locale switch, app
  restart, and packaged app launch;
- live-provider smoke with redacted evidence if release notes claim provider
  readiness;
- Arabic release-scope decision: complete Arabic or explicitly label Arabic as
  partial beta coverage;
- update-channel and rollback notes tied to the chosen release channel;
- explicit publish authorization before any tag, GitHub release, R2 upload, or
  update-channel promotion.
