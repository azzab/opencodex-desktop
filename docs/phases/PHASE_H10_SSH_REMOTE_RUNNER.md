# Phase H10: SSH Remote Runner Execution

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-h10-ssh` · worktree `../ocx-h10`
- Security-sensitive: first remote execution path.

## Goal
Implement the Phase 9 remote-runner protocol for SSH hosts: outbound-only
connection to a user-configured SSH host, capability handshake, remote
workspace trust, command execution with the same approval/budget/audit
semantics as local, credential redaction, and stop/resume/reconnect. No cloud
workers, no public listeners — exactly the protocol already specified.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/REMOTE_RUNNER_PROTOCOL.md` + `src/shared/remote-runner-protocol.ts` (the contract — implement it, don't redesign it)
3. `docs/REMOTE_SECURITY_MODEL.md`, `docs/PHASE_9_REMOTE_RUNNERS_SSH_HOSTS_REPORT.md`
4. Phase 1 redaction utilities; Phase 3 budget machinery

## Scope
### SSH connector
- SSH host config references (host alias from `~/.ssh/config` or explicit
  host/port/user/key path) stored under `agents.kun.remoteRunners` — **never**
  store passwords or decrypted keys; agent-auth and key-file references only.
- Outbound connection via `ssh2` (or system `ssh` subprocess if the native dep
  threatens packaging — decide and document); capability handshake per the
  protocol (OS, shell, git, node availability, workspace path).
- Remote workspace trust: a remote dir must be explicitly trusted before any
  command; trust is per host+path, audited.

### Execution semantics
- Remote exec tool mirrors local tool-host behavior: approval policy applies
  to every command (remote is never more permissive than local), output
  streamed into thread events, budgets enforced, all activity audited with
  host identity.
- Data egress policy from the protocol doc enforced: no local secrets,
  provider keys, or untrusted-path file contents are sent to the remote.
- Stop / resume / reconnect: dropped connection → turn pauses with a
  reconnectable state; explicit stop kills the remote command group.

### Renderer
- Remote runners settings section: hosts list, handshake status, trust
  management, connect/disconnect.
- Thread indicator when a turn is executing remotely (host badge).

## Surfaces to Build (REQUIRED)
- SSH connector + handshake + remote exec adapter + tests (protocol-conformance tests against a mocked SSH server; integration test gated behind an env flag for a real host).
- Settings UI + thread host badge (all states).
- IPC/app-server protocol wiring.

## UI rules (BLOCKING)
- i18n en+zh+ar; RTL-safe.
- Approval prompts must clearly say REMOTE + host name.
- Redaction pass on everything persisted from remote output.
- No listening sockets; outbound only.

## Out Of Scope
- Cloud worker provisioning; relay/mobile (Phase 4.5 lane); remote GUI apps.
- Remote browser automation.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
```

## Stop Gates
- Conformance tests: handshake, trust-required-before-exec, approval-gated exec, budget stop, reconnect resume — all green against the mock server.
- Real-host smoke (orchestrator/operator, documented): connect to a real SSH host, trust a path, run `git status` remotely with approval, disconnect mid-command, reconnect and resume.
- Grep-proof: no password/private-key material in config snapshots, logs, or test fixtures.

## Git Commit Message
`feat(remote): SSH remote runner implementing the Phase 9 protocol with handshake, trust, approvals, and reconnect`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H10_SSH_REMOTE_RUNNER.md. Implement the existing remote-runner protocol (src/shared/remote-runner-protocol.ts — implement, don't redesign) for SSH hosts: outbound-only connector with key/agent auth references (never stored secrets), capability handshake, per host+path workspace trust, remote exec mirroring local approval/budget/audit semantics with REMOTE-labeled approvals, data egress policy enforcement, stop/resume/reconnect, settings UI + thread host badge, and protocol-conformance tests against a mocked SSH server. Run the full verification block; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, conformance results, tests + results, and gaps.
