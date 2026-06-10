# Remote Runner Protocol

Status: Phase 9 schema contract. No SSH connector, cloud worker service, public
listener, or remote command execution path is implemented in this slice.

OpenCodex remote runners are execution targets that remain subordinate to the
desktop host and Kun. The protocol defines how a runner proves capabilities,
what data can leave the local host, and which approvals are required before a
remote run can touch terminal, filesystem, git, browser, or artifact surfaces.

## Runner Types

- `local-desktop`: the existing local desktop host and Kun runtime.
- `ssh-host`: a user-configured SSH target referenced through local endpoint
  and credential handles, not raw key material.
- `cloud-worker`: an optional future worker type with the same handshake,
  budget, data, approval, and audit policy requirements.

All runner types use the same OpenCodex/Kun event, approval, usage, and audit
concepts. A remote runner must not create a second session store or approval
system.

## Implemented Schema Surface

`src/shared/remote-runner-protocol.ts` defines:

- `RemoteRunnerCapabilityHandshakeSchema`
- `RemoteSshHostConfigSchema`
- `RemoteRunnerDataPolicySchema`
- `RemoteRunnerSessionControlMessageSchema`
- `RemoteRunnerAuditEventSchema`
- `redactRemoteRunnerConfig()`

The schemas are host-side contracts. They can be used by Electron, a future CLI,
an IDE extension, or a relay service without granting those surfaces direct
execution authority.

## Capability Handshake

A runner handshake declares:

- protocol version, runner id, runner type, label, status, issue and expiry
  time;
- OS, shell, and command syntax;
- git availability, worktree support, partial clone support, and LFS support;
- browser support and browser evidence policy;
- allowed root ids and labels, with path redaction mode;
- terminal, filesystem, git, browser, and artifact permission modes;
- model/provider availability for worker roles;
- run budgets for time, tokens, and cost;
- host approval, per-action consent, and audit requirements;
- credential storage policy that cannot export raw secrets.

Allowed roots are metadata handles. The default contract does not expose raw
remote paths, source trees, SSH endpoints, private IPs, or terminal streams.

## Credential Policy

SSH host config uses references:

- `endpointRef`: local handle for the SSH endpoint.
- `usernameRef`: optional local handle for the username.
- `credentialStorage`: one of `os-keychain`, `ssh-agent`, or
  `secret-manager`, with `exportsRawSecret: false`.
- `hostKeyPolicy`: `known-hosts`, `pinned-fingerprint-ref`, or
  `manual-confirm`.

Raw SSH keys, tokens, server IPs, `.env` values, OAuth tokens, provider keys,
and browser cookies must not appear in docs, logs, tests, screenshots, exported
profiles, or protocol messages.

## Data Egress Policy

Default allowed data classes:

- thread metadata;
- redacted progress;
- approval metadata;
- audit metadata;
- workspace labels.

Consent-required data classes:

- selected file excerpts;
- diff excerpts;
- terminal excerpts;
- screenshots;
- browser evidence;
- full prompts or full assistant output.

Never-relayed data classes:

- source files by default;
- raw terminal streams;
- browser cookies;
- API keys;
- OAuth tokens;
- MCP credentials;
- `.env` values;
- keychain material.

The schema rejects handshakes that place never-relayed data in default-allowed
or consent-gated lists.

## Session Control

Remote session control messages cover:

- `stop`
- `resume`
- `reconnect`

The desktop host remains the authority for applying those commands. A remote
client may request a control action, but host policy decides whether it is
allowed and records an audit event.

## Audit

Remote runner audit events carry run ids where available, actor, action,
outcome, payload redaction, optional consent id, and reason. They explicitly
mark `sensitivePayload: false`; secret or raw sensitive payloads are outside the
audit event body.

`explicit_full` payload redaction requires a consent id. This keeps future
evidence flows from quietly bypassing host consent.

## Non-Implementation Rules

Phase 9 does not:

- open inbound public ports;
- start SSH sessions;
- provision cloud workers;
- execute terminal commands on remote machines;
- sync raw source trees to a relay;
- store raw credentials in app settings;
- allow remote clients to lower host approval or sandbox policy.
