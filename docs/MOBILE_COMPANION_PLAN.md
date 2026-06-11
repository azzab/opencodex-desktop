# Mobile Companion Plan

Status: proposed product and implementation plan. No mobile companion app has been implemented yet.

The mobile companion is a remote operator surface for active OpenCodex Desktop work. It should help a user see what is running, continue a thread, resolve approvals, receive notifications, and apply limited steering without moving execution away from the desktop host.

## First-Version Capabilities

- Sign in with OIDC/OAuth Authorization Code and PKCE.
- Pair a desktop host through a short-lived device authorization or QR flow.
- View paired hosts, status, expiry, and revocation controls.
- View active and recent threads with redacted status summaries.
- Continue a thread with text input routed to the host.
- Approve or deny specific pending approval requests.
- Receive push notifications for completion, blocked approvals, failed runs, and host disconnects.
- Issue limited steering commands: pause, resume, retry, open plan, open todo, and request evidence summary.

## Out of Scope

- Direct file editing.
- Raw terminal access.
- Browser cookies, local storage, raw DOM, or unrestricted screenshots.
- Arbitrary shell commands.
- OS-level computer control.
- Credential entry or provider key management.
- Building on Feishu, Lark, WeChat, Tencent, or OpenClaw as the remote foundation.

## Screens

1. Sign in
   - OIDC/OAuth login with PKCE.
   - Device session list and sign-out.

2. Pair host
   - QR/device-code claim flow.
   - Host-side consent status and expiry.

3. Hosts
   - Host name, workspace label, connection state, last seen, capabilities, expiry, and revoke action.

4. Sessions
   - Thread title, status, model label, plan/todo availability, updated time, and redacted progress.

5. Thread
   - Redacted transcript summary, current run status, continuation composer, pending approvals, and audit link.

6. Approvals
   - Exact action, requested scope, risk tier, expiration, approve, and deny.

7. Notifications
   - Push toggles for completion, blocked approvals, failed runs, and host disconnect.

8. Device security
   - Active devices, scopes, expiry, revocation, and recent audit events.

## Interaction Rules

- Every remote action is routed to the host and evaluated under host policy.
- Remote approval decisions resolve only the displayed request id and cannot broaden scope.
- Evidence requests show what data class is requested before host consent.
- Push notifications use summaries, not full sensitive output.
- The host can disconnect or revoke a device without contacting the mobile device.

## Implementation Phases

1. Docs and contracts
   - Land this plan, `docs/REMOTE_SESSIONS_ARCHITECTURE.md`, `docs/REMOTE_SECURITY_MODEL.md`, and `docs/REMOTE_SESSION_PROTOCOL.md`.

2. Relay identity prototype
   - OIDC/OAuth Authorization Code with PKCE.
   - Device Authorization Grant or equivalent QR pairing.
   - Minimal metadata store and audit records.

3. Host WebSocket prototype
   - Outbound-only host connection.
   - Host capability advertisement.
   - Pairing approval and revocation UI.

4. Read-only companion
   - Hosts, sessions, redacted thread snapshots, and notifications.

5. Approval companion
   - Remote approve/deny for exact pending approval requests.
   - Audit visibility and expiry handling.

6. Limited steering
   - Continue, pause, resume, retry, and request evidence summary.
   - Per-action consent for screenshots, file excerpts, diff excerpts, and terminal excerpts.

## Localization and Accessibility

The companion must preserve English, Arabic, and Chinese coverage. Arabic surfaces must support RTL layout. Controls need accessible labels, focus states, and readable compact status text for repeated operator use.

