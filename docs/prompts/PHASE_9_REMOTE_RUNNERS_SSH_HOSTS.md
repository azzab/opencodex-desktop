# Phase 9 Prompt: Remote Runners, SSH Hosts, And Optional Cloud Workers

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `extra high`
- Why: remote runners and SSH/cloud workers cross machine and credential
  boundaries. Mistakes can leak code, secrets, tokens, terminal output, or
  private infrastructure details.
- Cheap helper agents: `gpt-5.4-mini`, reasoning `medium`, for read-only
  inventory only.

## Paste-Ready Goal

```text
/goal Phase 9: Remote Runners, SSH Hosts, and Optional Cloud Workers

Run from the OpenCodex Desktop repository root.

Objective:
Extend OpenCodex beyond the local desktop host with safe remote execution
options. Support SSH hosts and optional cloud workers while preserving local
control, explicit trust boundaries, redacted logs, budget controls, and clear
separation between local proof and remote/production proof.

Model:
Use gpt-5.5 with reasoning extra high.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/REMOTE_SESSIONS_ARCHITECTURE.md if present
- docs/REMOTE_SECURITY_MODEL.md if present
- docs/REMOTE_SESSION_PROTOCOL.md if present
- docs/ENGINE_AUDIT_KUN.md
- docs/PHASE_8_APP_SERVER_CLI_IDE_PROTOCOL.md if present
- current settings, app-server, thread/session, terminal, git/worktree, and
  automation code

Scope allowed:
- Remote runner architecture docs
- SSH host config schema with redaction
- Runner capability handshake
- Remote workspace trust model
- Optional cloud worker design
- Tests for schemas/auth/redaction if code is added

Scope forbidden:
- Do not store raw SSH keys, tokens, server IPs, or `.env` values in docs,
  logs, tests, screenshots, or exported profiles.
- Do not run production deploys or remote mutations unless explicitly approved.
- Do not treat remote proof as production proof unless provider-side evidence
  exists.
- Do not push unless explicitly requested.

Required behavior:
1. Define runner types: local desktop, SSH host, and optional cloud worker.
2. Define capability handshake: OS, shell, git, worktree support, browser
   support, allowed roots, tool policy, and model/provider availability.
3. Define credential storage and redaction policy.
4. Define remote terminal, file, git, and artifact streaming boundaries.
5. Add budget, approval, and audit requirements for remote runs.
6. Add stop/resume/reconnect semantics.
7. Document which data may leave the local host and which data never leaves by
   default.

Verification:
- Schema tests and redaction fixtures if code changes.
- Runner handshake tests with mock runner.
- Permission tests for disallowed remote roots/actions.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- Remote execution has a written trust model before broad implementation.
- SSH/cloud runners cannot quietly become unrestricted production mutation
  channels.
- Remote sessions still use OpenCodex/Kun events, approvals, usage, and audit.

