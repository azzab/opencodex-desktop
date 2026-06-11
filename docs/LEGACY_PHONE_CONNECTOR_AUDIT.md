# Legacy Phone Connector Audit

Status: source audit for compatibility planning. No source files were changed for this audit.

OpenCodex Desktop currently has phone-connection code for Feishu, Lark, Weixin/OpenClaw, scheduled tasks, and a loopback local webhook. These paths are useful compatibility surfaces, but they are not the foundation for future OpenCodex remote sessions or a mobile companion.

## Current Code Inventory

- `src/renderer/src/components/chat/ConnectPhoneView.tsx`
  - Presents phone connection options for Feishu, Lark, and Weixin.
  - Starts platform install QR flows and creates local channels.

- `src/main/claw-platform-install.ts`
  - Creates Feishu and Lark registration/login QR flows against provider endpoints.
  - Starts Weixin install QR flow through the local Weixin bridge runtime.

- `src/main/weixin-bridge-runtime.ts`
  - Uses `@tencent-weixin/openclaw-weixin`.
  - Runs a local loopback bridge.
  - Persists bridge state under the app user-data directory.
  - Receives Weixin events and forwards selected prompts to the local OpenCodex webhook path.

- `src/main/claw-runtime.ts`
  - Hosts a local IM webhook on `127.0.0.1`.
  - Checks settings and optional OpenCodex or legacy DeepSeek GUI secret headers.
  - Creates or continues Kun-backed threads for incoming messages.

- `src/main/schedule-runtime.ts`
  - Hosts internal schedule endpoints on loopback.
  - Uses optional OpenCodex or legacy DeepSeek GUI secret headers.

- `src/shared/app-settings-claw.ts`
  - Stores legacy phone, IM, and task settings under the `claw` settings branch.
  - Defaults the phone/automation path to disabled.

- `package.json`
  - Depends on `@larksuiteoapi/node-sdk`, `@tencent-weixin/openclaw-weixin`, and the local `openclaw` shim.

## Classification

Keep these paths as legacy compatibility. Do not expand them into the general remote-session foundation.

The future remote-session foundation should use OIDC/OAuth Authorization Code with PKCE, device authorization or equivalent QR pairing, outbound-only host WebSocket, host-owned approvals, and relay-visible metadata only. That architecture is documented in `docs/REMOTE_SESSIONS_ARCHITECTURE.md`, `docs/REMOTE_SECURITY_MODEL.md`, and `docs/REMOTE_SESSION_PROTOCOL.md`.

## Strengths

- Local webhook binds to loopback instead of opening a public inbound port.
- Phone connection is disabled by default through settings.
- The webhook supports an optional secret header.
- Incoming messages reuse the local Kun thread path rather than creating a second runtime.
- Chinese-related compatibility is preserved.

## Risks

- Feishu, Lark, Weixin, Tencent, and OpenClaw dependencies are platform-specific and not OpenCodex identity infrastructure.
- Provider QR/login behavior is outside the OpenCodex security model.
- Weixin bridge state and tokens live in provider-specific local storage.
- Message relays can blur consent boundaries if they are treated as a general remote-control channel.
- The legacy webhook contract is message-oriented and does not model device pairing, scoped permissions, revocation, push, or audit-first remote approvals.

## Required Boundaries

- Keep this compatibility surface visually and conceptually separate from future remote companion access.
- Preserve Chinese localization and compatibility. Do not remove Weixin or Chinese support as part of remote planning.
- Do not send API keys, source files, raw terminal output, cookies, screenshots, or unrestricted browser/computer control through these connectors by default.
- Do not use these connectors as the trust model for OpenCodex remote relay access.

## Migration Notes

Future UX should label these paths as legacy phone or IM compatibility. New remote companion UX should use a separate pairing surface and should reference the remote security model, not the legacy IM bridge settings.

