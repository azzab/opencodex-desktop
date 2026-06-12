# Phase M4b: Mobile Companion App (React Native MVP)

## Window And Model
- pi · `deepseek-v4-pro` · `--thinking high` · session `oc-m4b-mobile` · worktree `../ocx-m4b`
- Depends on M4a merged (pairing host). Lives in `clients/mobile/` (Expo / React Native).

## Goal
A phone app that controls the agent running on the user's desktop — the
"Codex on the laptop, steered from the phone" experience: pair by QR, see
threads live, send turns, answer approvals, watch usage. Thin protocol
client; the desktop owns all execution.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/phases/PHASE_M4A_MOBILE_PAIRING_HOST.md` (pairing payload, token scope, TLS pinning)
3. `docs/APP_SERVER_PROTOCOL.md`; H9 CLI protocol client (reuse the TS client code)
4. `docs/MOBILE_COMPANION_PLAN.md`

## Scope
### App (Expo + TypeScript)
- `clients/mobile/`: Expo app sharing the protocol client types/code with the
  CLI (extract a small `clients/shared/` protocol package if needed).
- Screens: Pair (QR scan → token, cert pinning), Threads (list + live
  transcript via SSE), Composer (send turn; plan/execute mode visible),
  Approvals (push-style in-app alert list, approve/deny incl. REMOTE-labeled),
  Usage (per-thread tokens/cost), Settings (host, device name, disconnect).
- Reconnect/resume: app background → foreground replays missed events
  (Kun SSE replay); desktop-unreachable state with retry.
- Localization: en + ar (RTL) + zh from day one; reuse key naming conventions.

### Distribution
- Dev builds via Expo (`npx expo run:ios|android`); document sideload/TestFlight
  path in `clients/mobile/README.md`. No store publish (operator).

## Surfaces to Build (REQUIRED)
- All five screens with loading/empty/error/success states.
- Shared protocol client package consumed by mobile (and CLI if extracted).
- Component/unit tests for protocol client, pairing flow, approvals reducer; manual smoke documented on at least one real device or simulator.

## UI rules (BLOCKING)
- Thin client: protocol calls only; token in secure storage (expo-secure-store); never logged.
- Scope honesty: UI must not offer terminal/settings/file features the device token cannot access.
- RTL correct for Arabic; `<bdi>`-equivalent handling for mixed text.

## Out Of Scope
- Cloud relay, push notifications (next milestone); store publishing; tablets/widgets.

## Verification
Full Definition-of-Done gate on the repo (mobile package excluded from root gate if needed) plus:
```bash
cd clients/mobile && npm test && npx tsc --noEmit
```

## Stop Gates
- End-to-end manual proof (documented with steps + screenshots): pair via QR against the real desktop (M4a), list threads, send a turn, watch streamed events, answer an approval, see usage; revoke from desktop kills the session live.
- Cert-pinning negative test: connection to a host with a different cert fingerprint is refused.
- Arabic RTL screen smoke documented.

## Git Commit Message
`feat(mobile): React Native companion app — pairing, live threads, approvals, usage`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_M4B_MOBILE_APP.md. Build the Expo/React Native companion in clients/mobile as a thin app-server protocol client reusing/extracting the H9 TS protocol client: QR pairing with cert-fingerprint pinning and secure token storage, live thread list + SSE transcript with background/foreground replay, composer with plan/execute visibility, approvals approve/deny, usage screen, settings/disconnect; en+ar(RTL)+zh localization. No execution features beyond the device-token scope. Run mobile tests + tsc plus the repo gate; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, the documented device smoke with screenshots, pinning negative test, tests + results, and gaps.
