# READY_FOR_ORCHESTRATOR_REVIEW — M4a Remediation (v3)

**Branch:** `phase/m4a-pairing`
**Date:** 2026-06-13
**Status:** ✅ Full gate passes — real TLS integration tests + cert SAN fix

---

## Why v3 Was Needed

The v2 remediation was rejected: its "runtime proxy" tests called
`mockRuntimeRequest` directly instead of driving requests through the real
`MobileTlsListener` pipeline (authenticateDeviceToken → isRouteAllowed →
handleRuntimeProxy). The tests were unit-level tests of helper functions,
not integration tests of the listener.

## v3 Remediation

### 1. Real TLS Integration Tests (`mobile-tls-listener-integration.test.ts` — NEW)

32 tests that start the actual `MobileTlsListener` on a loopback ephemeral port
with a real `MobilePairingService`, issue a device token, send HTTPS requests
(`rejectUnauthorized: false` for self-signed cert), and prove:

| # | Requirement | Tests | Status |
|---|---|---|---|
| (1) | GET /v1/threads → runtimeRequest with exact path/method/headers → proxied body/status | 3 | ✅ |
| (2) | GET /v1/approvals/<id> → runtimeRequest (Bearer + X-Device-Token) | 2 | ✅ |
| (3) | /v1/terminal, /v1/settings, /v1/credentials, /v1/files, /v1/runtime/hooks, /v1/runtime/tools → 403 BEFORE runtimeRequest called | 8 | ✅ |
| (4) | /, /version, /api, /v1, /health (no token), /mobile/qr-payload → 401, runtimeRequest NEVER called | 8 | ✅ |
| (5) | POST /mobile/pair: valid succeeds, reused/expired/invalid/missing/empty fail | 7 | ✅ |
| — | Revoked token → 401 | 1 | ✅ |
| — | Listener lifecycle (start/stop/refused) | 3 | ✅ |

**Key difference from v2:** every test sends a real HTTPS request through the
TLS listener's request handler. The mock `runtimeRequest` is injected but the
full auth → scope → proxy pipeline is exercised, including TLS handshake,
CORS headers, device-id audit headers, and status-code proxying.

### 2. Cert SAN Fix (`mobile-tls-listener.ts` — MODIFIED)

The certificate now includes all current LAN IPs in the SAN.

**Problem:** The v2 cert had `subjectAltName=DNS:localhost,IP:127.0.0.1,IP:0.0.0.0`.
A physical device connecting to `192.168.1.x` would fail TLS validation because
that IP wasn't in the SAN.

**Fix:**
- New `buildSubjectAltName()` function dynamically collects LAN IPs via
  `getLanAddresses()` and includes them as `IP:x.x.x.x` entries
- Certificate is regenerated on every listener start so the SAN stays current
  with DHCP/IP changes
- Private key is reused across restarts for identity stability
- `IP:0.0.0.0` removed (it's a bind address, not a valid connect target)

### 3. Physical-Device Proof Queued (`docs/M-PROOF-physical-device-pairing.md` — NEW)

The loopback integration tests prove the server-side pipeline. A true
physical-device test requires actual mobile hardware on the same LAN.
This is documented and queued — NOT faked.

---

## Files Changed (v3)

```
src/main/services/mobile-tls-listener.ts                  | MODIFIED  (cert SAN — dynamic LAN IPs)
src/main/services/mobile-tls-listener-integration.test.ts | NEW       (32 real integration tests)
docs/M-PROOF-physical-device-pairing.md                   | NEW       (physical-device proof queue)
```

(All v2 files are preserved unchanged.)

---

## Full Gate Results

| Check | Result |
|---|---|
| `npm run typecheck` (node + web) | ✅ Pass |
| `npm run lint` | ✅ Pass (0 errors, 9 pre-existing warnings) |
| `npm test` | ✅ **158 files, 1433 tests pass** (+32 integration) |
| `npm --prefix kun run typecheck` | ✅ Pass |
| `npm --prefix kun run test` | ✅ **58 files, 658 tests pass** (4 skipped, pre-existing) |
| `npm run build` | ✅ Pass |
| `git diff --check` | ✅ Pass (no whitespace errors) |

---

## Security Properties (unchanged from v2)

| Property | Status |
|---|---|
| Mobile access default OFF | ✅ `enabled: false` in defaults |
| QR payload IPC-only (removed from LAN) | ✅ Confirmed by integration tests |
| Device token scope enforcement | ✅ 8 tests prove 403 for blocked routes |
| Revoked token immediate rejection | ✅ 1 wire test + existing unit tests |
| No unauthenticated surface/version banner | ✅ 8 tests prove 401 for all paths |
| Pairing single-use code enforcement | ✅ 7 tests prove consumed/expired/invalid rejection |
| SAN includes actual LAN IPs | ✅ `buildSubjectAltName()` — NEW in v3 |

---

## Gaps

| Gap | Severity | Notes |
|---|---|---|
| Physical-device proof not yet performed | Medium | Queued in `docs/M-PROOF-physical-device-pairing.md`. Requires actual mobile hardware on LAN. Loopback integration proves the server pipeline. |
| Cert regen on every start loses cached cert | Low | `openssl req -x509` is fast (~100ms). Regen ensures SAN correctness. Key is reused across restarts. |
| CORS `Access-Control-Allow-Origin: *` | Info | Intentional for mobile pairing. TLS-auth + device-token-scoped surface. |
| No explicit proxy timeout | Low | Relies on injected `runtimeRequest` which should implement its own timeout. |

---

## Verification Commands

```bash
# Full gate
npm run typecheck && npm run lint && npm test \
  && npm --prefix kun run typecheck && npm --prefix kun run test \
  && npm run build && git diff --check

# Integration tests only
npx vitest run src/main/services/mobile-tls-listener-integration.test.ts

# All mobile access tests (unit + integration)
npx vitest run \
  src/main/services/mobile-tls-listener.test.ts \
  src/main/services/mobile-tls-listener-integration.test.ts \
  src/main/services/mobile-pairing-service.test.ts \
  src/main/services/mobile-pairing-acceptance.test.ts
```
