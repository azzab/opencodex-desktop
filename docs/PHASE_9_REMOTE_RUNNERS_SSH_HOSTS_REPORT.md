# Phase 9 Remote Runners, SSH Hosts, And Optional Cloud Workers Report

Date: 2026-06-10

## Source Prompt

- `docs/prompts/PHASE_9_REMOTE_RUNNERS_SSH_HOSTS.md`

## Implemented In This Slice

- Added the Phase 9 remote-runner protocol contract in
  `src/shared/remote-runner-protocol.ts`.
- Defined runner types for local desktop, SSH host, and optional cloud worker.
- Added a capability handshake schema covering OS, shell, command syntax, git,
  worktree support, browser evidence support, allowed-root metadata, tool
  policy, model/provider availability, budgets, approvals, audit, and
  credential storage policy.
- Added an SSH host config schema that uses endpoint, username, and credential
  references rather than raw host details or raw secret values.
- Added a remote-runner data egress policy. Metadata and redacted progress are
  default allowed; selected file, diff, terminal, screenshot, browser evidence,
  and full transcript data require explicit consent; raw secrets and sensitive
  local materials are never relayed by default.
- Added host-mediated stop, resume, and reconnect control message schemas.
- Added audit event schemas that require non-sensitive payloads and consent ids
  for `explicit_full` payload redaction.
- Added `redactRemoteRunnerConfig()` for safe config previews and tests proving
  endpoint, credential, username, bearer token, and secret-like values are
  removed.
- Added `docs/REMOTE_RUNNER_PROTOCOL.md` and updated the existing remote
  architecture, security, and session protocol docs to point to the Phase 9
  runner schema foundation.

## Boundary Decisions

- Kun remains the execution owner. Phase 9 does not create a second runtime,
  session store, approval system, usage counter, event stream, or audit owner.
- No SSH connection code was added.
- No cloud worker provisioning code was added.
- No public app-server listener, relay listener, or host WebSocket was added.
- No remote client can lower approval policy, sandbox mode, workspace trust, or
  automation permissions through this slice.
- SSH endpoints, usernames, credentials, host key material, server IPs, `.env`
  values, OAuth tokens, provider keys, MCP credentials, and browser cookies are
  treated as host-local sensitive data.

## Review Result

- Phase 7 and Phase 8 are already committed on `main`; no merge was needed.
- Fresh focused verification for Phase 7 and Phase 8 passed before Phase 9
  changes began.
- No Phase 7/8 blocker was found in the reviewed bridge, auth, protocol, IDE,
  diagnostics, or git review surfaces.
- Phase 9 is acceptable as a schema/documentation foundation only. It is not
  remote-runner execution proof and it is not production remote-access proof.

## Verification

- `npm test -- src/shared/remote-runner-protocol.test.ts`
  - PASS: 1 file, 4 tests.
- `npm run typecheck`
  - PASS: root web and node TypeScript checks completed.
- `npm test`
  - PASS: 130 files, 792 tests.
- `npm run build`
  - PASS: Kun build and Electron Vite main/preload/renderer build completed.
- `git diff --check`
  - PASS: exit 0.

Run before Phase 9 implementation:

- `npm test -- src/main/services/phase7-diagnostics-service.test.ts src/main/services/git-service.test.ts src/renderer/src/components/ChangeInspector.test.ts src/renderer/src/components/workbench/WorkbenchMissionControl.test.ts src/renderer/src/components/workbench/WorkbenchSurfacePanel.test.ts src/shared/app-server-protocol.test.ts src/main/services/app-server-bridge.test.ts src/main/services/app-server-cli.test.ts src/shared/ide-bridge.test.ts`
  - PASS: 9 files, 38 tests.
