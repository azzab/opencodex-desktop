# Remote Security Model

Status: proposed security model with Phase 9 runner schema foundation. Current
source implements local desktop execution, disabled-by-default browser
automation gates, legacy phone connector compatibility, and remote-runner
schemas/redaction helpers only.

Remote access must preserve the existing OpenCodex trust boundary: Electron main and Kun own execution, while the renderer and remote clients are untrusted command surfaces.

## Trust Boundaries

- Desktop host: trusted execution boundary for Kun, local filesystem access, approvals, browser automation, MCP servers, and credentials.
- Remote runner: constrained execution target. It must advertise capabilities,
  budgets, allowed-root handles, data egress policy, credential reference
  policy, approval policy, and audit policy before the host may use it.
- Relay: semi-trusted routing service. It authenticates users and devices, routes messages, stores minimal metadata, and emits audit records. It must not need secrets or raw workspace data.
- Companion clients: low-trust mobile or browser surfaces. They may view summaries and request actions, but they do not receive direct filesystem, shell, browser, or credential access.
- Renderer: still treated as hostile. New remote UI must use typed preload/main contracts rather than raw Node access.

## Authentication

User login uses OIDC/OAuth Authorization Code with PKCE. The companion client never receives long-lived desktop credentials. Access tokens are short-lived and scoped to remote-session metadata and paired devices.

Host and device pairing uses OAuth Device Authorization Grant or an equivalent one-time QR flow:

- Pairing codes have short TTLs.
- Pairing requires explicit owner approval on the desktop host.
- Pairing binds user id, host id, device id, scopes, and expiration.
- Pairing can be revoked from the host even if the remote device is offline.

## Secrets and Sensitive Data

The host keeps these local:

- Provider API keys, OAuth refresh tokens, MCP credentials, `.env` values, and keychain material.
- Browser cookies, browser local storage, screenshots, and raw browser DOM.
- Source files, diffs, terminal output, and tool output unless explicitly approved for a narrow request.
- Workspace root lists beyond redacted labels.

Remote runner config uses references, not raw values. SSH endpoint handles,
user handles, credentials, and host key material are redacted from previews and
must resolve only inside trusted local host code or an approved secret manager.

Relay storage is limited to:

- User, host, and device ids.
- Session ids and thread aliases.
- Presence, coarse status, expiration, and revocation state.
- Redaction flags and audit event ids.
- Push notification summaries.

## Authorization

Remote commands must be mapped into existing host policies:

- The remote client cannot change approval policy, sandbox mode, workspace roots, or automation permissions.
- Existing Kun approvals remain authoritative.
- Browser/computer-control requests inherit `docs/BROWSER_COMPUTER_CONTROL_PLAN.md` consent and capability gates.
- Evidence requests require explicit local consent when they could include screenshots, DOM, files, terminal output, or secrets.
- Sensitive actions require per-action confirmation, not only device trust.

## Audit and Consent

The host emits audit events for:

- Pairing creation, claim, approval, expiration, and revocation.
- Host connect/disconnect and capability changes.
- Remote thread subscription and continuation.
- Approval request display and remote approve/deny decisions.
- Evidence requests, granted scopes, redaction mode, and result delivery.
- Push notification delivery and mute/unmute changes.

Audit events should include actor, device, host, thread, action, scope, timestamp, and outcome. They should not include secrets or raw sensitive payloads.

## Expiry, Revocation, and Push

- Device tokens expire and rotate.
- Host can revoke a device immediately.
- Relay stops routing to revoked or expired bindings.
- Push notifications carry summaries only. They must not include secrets, raw file content, raw terminal output, raw screenshots, or cookies.
- Push topics are scoped per user and per paired device.

## Legacy Connector Position

`src/main/claw-runtime.ts`, `src/main/claw-platform-install.ts`, `src/main/weixin-bridge-runtime.ts`, and `src/renderer/src/components/chat/ConnectPhoneView.tsx` are compatibility surfaces for Feishu, Lark, Weixin, and local webhook flows. They are not a general remote-session security model because they rely on platform-specific identity, message routing, and bridge state outside the proposed OIDC/PKCE relay boundary.
