# OpenCodex Desktop 0.3.1-beta Notes

Date: 2026-06-12
Channel: local operator beta
Signing: unsigned unless a separate signed/notarized artifact is listed by the operator

## What This Beta Is

`0.3.1-beta` is a local macOS test build for operator validation after the
v0.3.0 H-series harness milestone and the M1 Electron 42 security retry. It is
not a public release, update-channel promotion, GitHub release, or R2 upload.

No upload, publish, promote, tag, or update-channel mutation is authorized by
this note. Those remain gated by `OPENCODEX_RELEASE_PUBLISH_AUTHORIZED=1`.

## Highlights Since 0.3.0-rc

- Electron is upgraded from `39.8.10` to `42.4.0`.
- Full `npm audit` is clean after the Electron 42 upgrade.
- The Kun smoke now verifies the real SSE contract: turn creation returns a
  `202` JSON acknowledgement, while streaming events arrive on the separate
  `/v1/threads/{id}/events` SSE endpoint.
- Native modules use a dual-ABI packaging flow:
  - `better-sqlite3` and `node-pty` are rebuilt for Electron ABI during app
    packaging.
  - the source worktree is restored to system Node ABI after packaging.
  - clean-room install/typecheck/test/build evidence passed in M1.
- H-series harness capabilities remain in scope: Arabic locale parity,
  telemetry, terminal, planner/executor split, checkpoints, browser evidence,
  hooks trust, goal/loop scheduler, CLI/IDE clients, SSH remote runner, and
  upstream Wave-8 ports.

## Known Gaps For This Beta

- The macOS artifacts are unsigned unless a signed/notarized artifact list is
  separately recorded. Gatekeeper will block first launch on default macOS
  settings.
- Manual packaged-app smoke is still required: first launch, settings, Kun
  thread creation, streaming, approvals, terminal, plan/checkpoint panels,
  provider settings, restart, and locale switching including Arabic RTL.
- Live-provider smoke is still required for any provider-readiness claim.
- Provider OAuth/key-validation work from M2 is not included until the M2 lane
  is verified and merged.
- Mobile pairing, mobile app, Windows/Linux packaging proof, remaining upstream
  ports, and coding-quality evals are future M-series phases.
- Public release notes, tags, GitHub releases, R2 uploads, and update-channel
  promotion are not authorized by this beta.

## Unsigned macOS Install

For an unsigned local beta, unzip or mount the artifact, move the app to a test
location, then remove quarantine locally:

```bash
npm run mac:unquarantine -- "/path/to/OpenCodex Desktop.app"
```

Equivalent manual command:

```bash
xattr -dr com.apple.quarantine "/path/to/OpenCodex Desktop.app"
```

Only run this on artifacts built from this repository and listed by the
orchestrator.

## Expected Local Artifacts

The M1.5 build should record exact paths after packaging. Expected macOS names:

- `dist/OpenCodex-Desktop-0.3.1-beta-mac-arm64.dmg`
- `dist/OpenCodex-Desktop-0.3.1-beta-mac-arm64.zip`
- `dist/OpenCodex-Desktop-0.3.1-beta-mac-x64.dmg` if x64 packaging succeeds on this host
- `dist/OpenCodex-Desktop-0.3.1-beta-mac-x64.zip` if x64 packaging succeeds on this host

Operator testing should use the recorded paths, not assumptions.
