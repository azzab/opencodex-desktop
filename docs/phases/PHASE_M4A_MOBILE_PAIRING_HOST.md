# Phase M4a: Mobile Pairing — Desktop Host Side

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-m4a-pairing` · worktree `../ocx-m4a`
- Security-sensitive: first non-loopback listener. This phase EXPLICITLY authorizes an opt-in LAN listener under the constraints below (foundation rule 5 exception).

## Goal
Let a phone on the same network (or tailnet/VPN) become a paired control
surface for the desktop: QR-code pairing, per-device trust, token-scoped
access to the app-server protocol (threads, turns, events, approvals, usage).
The desktop remains the execution host. Cloud relay and push notifications
are explicitly deferred — this is the direct-connection MVP that makes
"Codex on the laptop, controlled from the phone" real today.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/MOBILE_COMPANION_PLAN.md`, `docs/REMOTE_SESSIONS_ARCHITECTURE.md`, `docs/REMOTE_SECURITY_MODEL.md` (design intent: clients are control surfaces; desktop owns everything)
3. `docs/APP_SERVER_PROTOCOL.md` + H9/H10 auth and approval patterns

## Scope
### Listener (opt-in, constrained)
- Setting `agents.kun.mobileAccess` (default OFF). When ON: app-server
  protocol additionally binds a LAN interface on a configurable port with
  TLS (self-signed cert generated per install; cert fingerprint is part of
  the pairing payload so the phone pins it).
- Every request requires a device token; unauthenticated requests get no
  protocol surface (404/close, no version banner).

### Pairing
- Desktop shows a QR code: host candidates, port, cert fingerprint, one-time
  pairing code (TTL ≤ 2 min, single use). Phone exchanges it for a
  device-scoped token (name, created, last-seen).
- Devices panel in settings: list paired devices, last activity, revoke
  (immediate), revoke-all. Every pair/revoke/connect is audited.

### Scoping
- Device tokens get control-surface scope ONLY: threads/turns/events/
  approvals/usage/goal/loop state. NO file contents beyond diffs already in
  thread events, NO terminal, NO settings mutation, NO provider credentials,
  NO hook/automation config. Scope enforced server-side per route.
- Approvals from mobile follow the same first-answer-wins semantics as M3.

## Surfaces to Build (REQUIRED)
- TLS LAN listener + device-token auth middleware + scope enforcement + tests (incl. negative: out-of-scope routes denied for device tokens).
- Pairing service (QR payload, one-time code, token issuance) + tests.
- Settings → Mobile access: master toggle, QR pairing dialog, devices list with revoke. All states; i18n en+zh+ar; RTL-safe.

## Out Of Scope
- The mobile app itself (M4b); cloud relay; push notifications; WAN exposure (document tailnet/VPN as the off-LAN path).

## Verification
Full Definition-of-Done gate plus:
```bash
# with mobileAccess OFF (default): prove no non-loopback listener exists
node -e "console.log('document: lsof -iTCP -sTCP:LISTEN proof in report')"
```

## Stop Gates
- Default-off proof: fresh config → no LAN socket (lsof evidence).
- Pairing round-trip test: QR payload → one-time code (expires, single-use) → device token works; revoked token fails immediately.
- Scope tests: device token denied on terminal/settings/credential routes; allowed on thread/approval routes.
- TLS: phone-side pinning data present in QR payload; plain HTTP refused on the LAN port.
- Manual proof: second machine/phone browser pairs via QR, lists threads, answers an approval; revoke kills it live.

## Git Commit Message
`feat(mobile): opt-in TLS LAN listener with QR pairing, device-scoped tokens, and revocation`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_M4A_MOBILE_PAIRING_HOST.md. Build the opt-in (default OFF) TLS LAN listener for the app-server protocol with per-install self-signed cert + fingerprint pinning in the QR payload, one-time pairing codes (TTL ≤2min, single use) exchanged for device-scoped tokens, server-side scope enforcement (control-surface routes only — no terminal, settings, credentials, or file access), a settings Mobile-access panel with QR dialog and device list/revoke, and full audit events. Include negative scope tests and default-off lsof proof. i18n en+zh+ar, RTL-safe. Run the full gate; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, security test evidence, tests + results, and gaps.
