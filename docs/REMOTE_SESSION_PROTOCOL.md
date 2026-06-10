# Remote Session Protocol

Status: proposed relay protocol contract with Phase 9 remote-runner schema
foundation. No relay service, remote host WebSocket, SSH connector, cloud
worker, or remote execution path has been implemented yet.

The protocol is a host-mediated control channel. It carries remote-session metadata, narrow user commands, approval decisions, and redacted evidence requests. It does not carry secrets or raw workspace data by default.

The runner-specific contract lives in `docs/REMOTE_RUNNER_PROTOCOL.md` and
`src/shared/remote-runner-protocol.ts`. That schema covers local desktop, SSH
host, and cloud worker runner handshakes, budget policy, allowed-root metadata,
credential references, data egress, audit, stop, resume, and reconnect
messages.

## Envelope

```json
{
  "id": "msg_01",
  "type": "thread.snapshot",
  "version": 1,
  "sentAt": "2026-06-09T00:00:00.000Z",
  "userId": "usr_123",
  "hostId": "host_123",
  "deviceId": "dev_123",
  "threadId": "thread_123",
  "correlationId": "msg_parent",
  "redaction": {
    "mode": "metadata",
    "sensitive": false
  },
  "payload": {}
}
```

Required fields:

- `id`: unique message id.
- `type`: protocol message type.
- `version`: protocol version.
- `sentAt`: ISO timestamp.
- `userId`, `hostId`, `deviceId`: authenticated and paired route identifiers.
- `redaction.mode`: `metadata`, `summary`, `selected_excerpt`, or `explicit_full`.
- `payload`: type-specific data.

`explicit_full` is only valid after per-action host consent.

## Pairing Messages

- `pairing.created`: relay creates a short-lived device code or QR payload.
- `pairing.claimed`: authenticated client claims a code.
- `pairing.approval_requested`: host asks owner to approve the claim.
- `pairing.approved`: host approves scopes and expiry.
- `pairing.denied`: host denies the claim.
- `pairing.revoked`: host or user revokes a device.
- `pairing.expired`: relay marks the code or binding expired.

Pairing payloads include expiry timestamps, requested scopes, device display name, and coarse client platform. They do not include host credentials.

## Presence and Capability Messages

- `host.connected`
- `host.disconnected`
- `host.capabilities`
- `client.presence`
- `client.notification_preferences`

Capabilities are coarse booleans or enums, for example:

- `threads`: list, subscribe, continue.
- `approvals`: view, decide.
- `evidence`: summary, screenshot_request, selected_file_excerpt.
- `automation`: disabled, local_only, consent_required.
- `terminal`: unavailable, metadata_only, consent_required.
- `runner`: local-desktop, ssh-host, or cloud-worker with a separate Phase 9
  capability handshake.

## Thread Messages

- `thread.list.request`
- `thread.list.result`
- `thread.subscribe`
- `thread.unsubscribe`
- `thread.snapshot`
- `thread.progress`
- `thread.input.submit`
- `thread.continue.request`
- `thread.pause.request`
- `thread.retry.request`

Thread snapshots expose title, mode, workspace label, updated time, current status, and redacted recent progress. Full transcript delivery is off by default and requires explicit host consent.

## Approval Messages

- `approval.request`
- `approval.resolve`
- `approval.result`

Approval requests include action label, originating tool, scope summary, risk tier, expiry, and host policy. Remote resolution can only approve or deny the exact request id. It cannot broaden scope, lower approval policy, or mutate sandbox settings.

## Evidence Messages

- `evidence.summary.request`
- `evidence.summary.result`
- `evidence.screenshot.request`
- `evidence.screenshot.result`
- `evidence.file_excerpt.request`
- `evidence.file_excerpt.result`
- `evidence.diff_excerpt.request`
- `evidence.diff_excerpt.result`

Evidence messages default to metadata or summary redaction. Screenshot, file, diff, DOM, and terminal excerpts require host consent and must carry the granted scope in the result.

## Audit Messages

- `audit.event`
- `audit.query.request`
- `audit.query.result`

Audit events include actor, device, host, thread, action, scope, timestamp, outcome, and correlation id. Sensitive payloads are excluded.

## Error Messages

- `error.auth`
- `error.pairing`
- `error.policy_denied`
- `error.host_unavailable`
- `error.scope_required`
- `error.rate_limited`

Errors should name the failed scope and the next allowed user action when possible.

## Compatibility Notes

The legacy local webhook in `src/main/claw-runtime.ts` accepts IM-style JSON messages and optional OpenCodex or legacy DeepSeek GUI secret headers. That shape is not this protocol. Future compatibility adapters may translate legacy messages into host-local thread commands, but relay protocol authority remains OIDC/PKCE pairing plus host consent.
