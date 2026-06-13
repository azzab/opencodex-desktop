# M-PROOF — Physical-Device Pairing Proof (QUEUED)

**Status:** QUEUED (not faked)  
**Date:** 2026-06-13  
**Branch:** phase/m4a-pairing

## Why This Is Queued

The integration tests prove the full request-handling pipeline through a real TLS
listener started on loopback, with real HTTPS requests, device token auth,
route-scope enforcement, and runtime proxy forwarding. However, these tests run
on the same machine (loopback), not across a real LAN from a physical device.

A true physical-device proof requires:
- A physical mobile device (iOS or Android) on the same LAN
- The device running the mobile companion app
- The device scanning the QR code and connecting to the desktop's LAN IP
- Certificate validation via fingerprint pinning (self-signed cert)

## What Loopback Integration Tests Prove (DONE)

The `mobile-tls-listener-integration.test.ts` (32 tests, all passing) proves:

1. **TLS handshake** — real `https` module connects to `createSecureServer`
2. **Device token auth** — `Authorization: Bearer <token>` and `X-Device-Token` headers
3. **Route-scope enforcement** — blocked routes return 403 before runtime proxy
4. **Runtime proxy** — allowed routes reach `runtimeRequest` with exact path/method/headers
5. **Pairing claim** — valid single-use code succeeds; reused/expired/invalid fail
6. **Unauthenticated surface** — no version banner, no QR payload on LAN, all 401
7. **Token revocation** — revoked tokens rejected immediately
8. **Listener lifecycle** — start/stop/connection refused after stop

## Cert SAN Fix (DONE)

The certificate now includes all current LAN IPs in the SAN at generation time.
Previously it only had `DNS:localhost, IP:127.0.0.1, IP:0.0.0.0`.

The `buildSubjectAltName()` function dynamically collects LAN IPs via
`getLanAddresses()` and includes them as `IP:x.x.x.x` entries. The cert is
regenerated on every listener start so the SAN stays current with DHCP changes.

## What Physical-Device Proof Must Verify

1. Mobile device on LAN connects to desktop's advertised IP:port
2. Cert fingerprint from QR code is used for pinning (no CA validation)
3. Pairing flow: scan QR → POST /mobile/pair → receive token
4. Authenticated requests: GET /v1/threads, GET /v1/approvals/<id>
5. Denied routes: GET /v1/terminal → 403, etc.
6. Token persistence and re-auth across app restarts

## Infrastructure Required

- Physical mobile device with the companion app (not yet built)
- Same LAN (WiFi, no VPN)
- Desktop with mobile access enabled and QR code displayed
- Network reachability (no firewall blocking the TLS port)

## Not Faked

This file exists to be transparent that we have NOT fabricated a physical-device
test. Loopback integration tests prove the server-side pipeline. The LAN cert
SAN fix removes the cert validation obstacle. The remaining proof requires
actual hardware which is not available in this worktree.

Do not accept browser-based or manual "verification" as a substitute for a real
device test. The physical device test should be queued for the next phase.
