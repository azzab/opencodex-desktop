# Phase 4.5 Prompt: Remote Relay And Mobile Access

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `extra high`
- Why: remote/mobile access is a security architecture phase involving device
  pairing, identity, relay boundaries, host ownership, audit, and credential
  isolation.
- Cheap helper agents: `gpt-5.4-mini`, reasoning `medium`, for read-only
  inventory of existing phone/connector code and public docs.

## Paste-Ready Goal

```text
/goal Phase 4.5: OpenCodex Remote Relay and Mobile Access

Run from the OpenCodex Desktop repository root.

Objective:
Design and begin the OpenCodex remote/mobile architecture without relying on
the legacy Chinese IM infrastructure inherited from DeepSeek GUI. Mobile and
browser clients are control surfaces. The desktop host owns files, projects,
Kun, MCP, Skills, provider credentials, browser sessions, and computer-control
permissions. The relay handles identity, pairing, routing, presence, push, and
minimal metadata only.

Model:
Use gpt-5.5 with reasoning extra high.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/BROWSER_COMPUTER_CONTROL_PLAN.md
- docs/ENGINE_AUDIT_KUN.md
- existing phone/connect/claw/weixin/feishu scheduling and connector code
- current IPC, Kun thread/session, settings, and auth helpers

Scope allowed:
- Remote/mobile architecture docs
- Legacy phone connector audit docs
- Protocol contracts or stubs only when needed for clarity
- Settings placeholders marked disabled/experimental
- Tests only for pure contract/schema code if added

Scope forbidden:
- Do not build on Feishu/Lark/WeChat/Tencent/OpenClaw as the OpenCodex remote
  foundation.
- Do not remove Chinese localization.
- Do not expose repo source, raw terminal output, API keys, MCP secrets,
  browser cookies, or screenshots through relay by default.
- Do not open inbound public ports on the desktop host.
- Do not push unless explicitly requested.

Required design:
1. Use OIDC/OAuth Authorization Code with PKCE for user login.
2. Use OAuth Device Authorization Grant or equivalent QR/device-pairing flow
   for pairing mobile/browser clients to the desktop host.
3. Use outbound-only desktop host WebSocket to the relay.
4. Keep secrets, source files, provider credentials, MCP config, browser
   cookies, and computer-control permissions on the desktop host.
5. Add audit, consent, session expiry, device revocation, and push-notification
   boundaries.
6. Define a mobile companion plan for session viewing, continuation, approvals,
   notifications, and limited command steering.
7. Audit legacy phone connector code as legacy compatibility, not the future
   OpenCodex remote foundation.

Required deliverables:
1. docs/REMOTE_SESSIONS_ARCHITECTURE.md
2. docs/REMOTE_SECURITY_MODEL.md
3. docs/REMOTE_SESSION_PROTOCOL.md
4. docs/MOBILE_COMPANION_PLAN.md
5. docs/LEGACY_PHONE_CONNECTOR_AUDIT.md

Verification:
- Docs link to current source files and state what is implemented versus
  proposed.
- Any schema stubs have unit tests.
- npm test and npm run typecheck if code changes.
```

## Exit Criteria

- OpenCodex has a non-Chinese-infrastructure remote/mobile plan.
- Legacy phone connector code is classified safely.
- Remote clients are designed as control surfaces, not owners of secrets or
  local workspace execution.

