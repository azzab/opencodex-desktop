# Remote Sessions Architecture

Status: proposed architecture with Phase 9 runner schema foundation. No remote
relay, mobile companion, browser companion, SSH connector, or cloud worker has
been implemented yet.

OpenCodex remote sessions should make the desktop host reachable from trusted companion clients without moving the Kun runtime, source tree, credentials, browser cookies, or approval authority off the local machine. The relay is a routing and identity layer; the host remains the execution boundary.

## Implemented Foundation

- `docs/ENGINE_AUDIT_KUN.md` establishes Kun as the single execution kernel behind the Electron shell.
- `docs/BROWSER_COMPUTER_CONTROL_PLAN.md` defines disabled-by-default browser/computer-control gates that any remote evidence surface must respect.
- `docs/REMOTE_RUNNER_PROTOCOL.md` and
  `src/shared/remote-runner-protocol.ts` define the Phase 9 runner handshake,
  data egress, credential reference, approval, budget, audit, stop, resume, and
  reconnect contracts.
- `src/main/claw-runtime.ts` already has a loopback-only legacy IM webhook for optional external relays.
- `src/main/claw-platform-install.ts`, `src/main/weixin-bridge-runtime.ts`, `src/shared/app-settings-claw.ts`, and `src/renderer/src/components/chat/ConnectPhoneView.tsx` implement legacy phone connectors for Feishu, Lark, and Weixin/OpenClaw compatibility.

The legacy phone connector paths are not the remote-session foundation. The
remote foundation must be independent from Feishu, Lark, WeChat, Tencent,
OpenClaw, or any Chinese IM infrastructure.

## Target Shape

```text
Mobile/browser companion
        |
        | OIDC login, PKCE, short-lived user token
        v
Remote relay
        |
        | outbound-only WebSocket initiated by host
        v
OpenCodex Desktop host
        |
        | local IPC / Kun HTTP-SSE contracts
        v
Kun runtime, local files, local browser, local approvals
```

The desktop host opens an outbound WebSocket to the relay after explicit owner pairing. The relay never opens an inbound port on the host network. Companion clients subscribe to summarized session state and send narrow commands that the host maps into existing Kun thread operations and approval gates.

## Components

1. Identity service
   - Uses OIDC/OAuth Authorization Code with PKCE for user login.
   - Issues short-lived access tokens and refresh tokens scoped to remote-session metadata.
   - Does not receive provider API keys, MCP secrets, local cookies, raw source files, or terminal streams.

2. Device pairing
   - Uses OAuth Device Authorization Grant or an equivalent one-time QR flow.
   - Requires owner approval on the desktop host before the relay can bind a client device.
   - Pairing codes expire quickly and can be revoked from the host.

3. Host session agent
   - Runs inside the existing Electron main/Kun boundary.
   - Initiates outbound-only WebSocket connections.
   - Advertises coarse capabilities such as threads, approvals, evidence summaries, and automation availability.
   - Keeps all execution, secrets, workspace roots, browser cookies, screenshots, and raw command output local by default.

4. Relay
   - Routes authenticated messages between paired clients and hosts.
   - Stores minimal metadata: user id, host id, device id, thread ids or aliases, presence, audit ids, expiration timestamps, and redaction flags.
   - Delivers push notifications as summaries, not full transcripts or sensitive outputs by default.

5. Companion clients
   - Provide mobile and browser surfaces for viewing active sessions, continuing a thread, resolving approvals, receiving notifications, and issuing limited steering commands.
   - Cannot bypass host-side approval policy, sandbox policy, workspace roots, or automation permissions.

## Data Classes

Allowed through the relay by default:

- Host presence and coarse runtime status.
- Thread list metadata: id, title, workspace label, mode, updated time.
- Summarized assistant state and redacted progress events.
- Approval request metadata and explicit approve/deny responses.
- Audit event metadata.

Requires explicit per-action consent:

- Screenshot or browser evidence request.
- Selected file excerpt.
- Terminal excerpt.
- Diff excerpt.
- Full prompt or full assistant output.

Never relayed by default:

- API keys, OAuth tokens, MCP credentials, `.env` contents, keychain material.
- Browser cookies, local storage, session tokens, raw screenshots.
- Full source tree, arbitrary file reads, raw terminal stream.
- Unrestricted computer control commands.

## Session Lifecycle

1. User signs in to the companion through OIDC/OAuth with PKCE.
2. User starts device pairing; the relay creates a short-lived device code and QR payload.
3. Desktop host shows the claim request, user approves it locally, and the host opens or authorizes an outbound WebSocket.
4. Relay binds host, user, and device with expiry and revocation metadata.
5. Companion subscribes to session metadata and sends narrow commands.
6. Host maps commands to local Kun/Electron actions and emits audit records.
7. User or policy revokes the device, token expires, or host disconnects.

## Non-Goals

- Building remote access on Feishu, Lark, WeChat, Tencent, or OpenClaw.
- Removing Chinese localization or legacy phone compatibility.
- Opening inbound public ports on the desktop host.
- Moving Kun execution into the relay.
- Letting a remote client directly edit files, run shell commands, read cookies, or operate the OS.
- Shipping a hosted production relay in this phase.
