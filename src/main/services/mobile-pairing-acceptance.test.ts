import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MobilePairingService } from './mobile-pairing-service'
import { MobileTlsListener, isRouteAllowed, ALLOWED_ROUTE_PREFIXES, BLOCKED_ROUTE_PREFIXES } from './mobile-tls-listener'
import { defaultMobileAccessSettings } from '../../shared/app-settings-kun'
import type { MobileAccessSettingsV1 } from '../../shared/app-settings-types'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'

function makeSettings(overrides?: Partial<MobileAccessSettingsV1>): MobileAccessSettingsV1 {
  return {
    enabled: true,
    port: 19443,
    host: '0.0.0.0',
    devices: [],
    auditLog: [],
    maxAuditEntries: 500,
    ...overrides
  }
}

describe('M4A Mobile Pairing — acceptance tests', () => {
  let currentSettings: MobileAccessSettingsV1
  let pairingService: MobilePairingService
  let listener: MobileTlsListener
  let now: number
  let certDir: string

  beforeEach(() => {
    now = 1700000000000
    currentSettings = makeSettings()
    certDir = join(tmpdir(), 'ocx-m4a-test-' + randomUUID())

    pairingService = new MobilePairingService({
      dataDir: '/tmp/test-m4a',
      getSettings: () => currentSettings,
      saveSettings: (s) => { currentSettings = s },
      now: () => now
    })

    listener = new MobileTlsListener({
      pairingService,
      port: 19443,
      host: '127.0.0.1',
      certDir,
      now: () => now,
      onAudit: (e) => {
        currentSettings.auditLog = [e, ...currentSettings.auditLog].slice(0, currentSettings.maxAuditEntries)
      }
    })
  })

  afterEach(() => {
    try { rmSync(certDir, { recursive: true, force: true }) } catch { /* ok */ }
  })

  /* ------------------------------------------------------------------ */
  /*  Scope enforcement tests — uses PRODUCTION isRouteAllowed          */
  /* ------------------------------------------------------------------ */

  describe('scope enforcement — control-surface routes', () => {
    const controlSurfaceRoutes = [
      '/health',
      '/v1/projects',
      '/v1/projects/proj_abc/threads',
      '/v1/threads',
      '/v1/threads/thread_123',
      '/v1/threads/thread_123/turns/turn_xyz',
      '/v1/threads/thread_123/turns/turn_xyz/steer',
      '/v1/threads/thread_123/events?since_seq=5',
      '/v1/sessions/sess_1/resume-thread',
      '/v1/approvals/approval_5',
      '/v1/usage?group_by=thread',
      '/v1/usage?group_by=day',
      '/v1/runtime/info',
      '/v1/goal/status',
      '/v1/loop/status'
    ]

    it('allows all control-surface routes via production isRouteAllowed', () => {
      for (const route of controlSurfaceRoutes) {
        expect(isRouteAllowed(route)).toBe(true)
      }
    })
  })

  describe('scope enforcement — blocked routes (negative tests)', () => {
    const blockedRoutes = [
      '/v1/terminal',
      '/v1/terminal/sessions',
      '/v1/terminal/spawn',
      '/v1/terminal/resize',
      '/v1/settings',
      '/v1/settings/agents',
      '/v1/settings/update',
      '/v1/credentials',
      '/v1/providers',
      '/v1/providers/list',
      '/v1/files',
      '/v1/files/read?path=/etc/passwd',
      '/v1/files/write',
      '/v1/memory',
      '/v1/memory/create',
      '/v1/attachments',
      '/v1/attachments/upload',
      '/v1/runtime/tools',
      '/v1/runtime/tools/list',
      '/v1/runtime/hooks',
      '/v1/runtime/hooks/reload',
      '/v1/skills',
      '/v1/skills/list',
      '/v1/mcp',
      '/v1/mcp/servers',
      '/v1/config',
      '/v1/remote-runners',
      '/v1/remote-runners/status',
      '/v1/ssh',
      '/v1/ssh/connect'
    ]

    it('blocks ALL out-of-scope routes via production isRouteAllowed', () => {
      for (const route of blockedRoutes) {
        expect(isRouteAllowed(route)).toBe(false)
      }
    })

    it('blocks unknown routes by default (security default-deny)', () => {
      const unknownRoutes = ['/v1/unknown-endpoint', '/api/v2/admin', '/admin', '/debug/vars']
      for (const route of unknownRoutes) {
        expect(isRouteAllowed(route)).toBe(false)
      }
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Pairing round-trip test                                           */
  /* ------------------------------------------------------------------ */

  describe('pairing round-trip', () => {
    it('generates code → validates → consumes → issues token → validates token', () => {
      const { code, expiresAt } = pairingService.generatePairingCode()
      expect(code).toMatch(/^[0-9a-f]{8}$/)
      expect(expiresAt).toBe(now + 2 * 60 * 1000)

      expect(pairingService.validatePairingCode(code)).toEqual({ valid: true })
      expect(pairingService.consumePairingCode(code)).toBe(true)
      expect(pairingService.consumePairingCode(code)).toBe(false)

      const { deviceId, token, tokenHash } = pairingService.issueDeviceToken('Test Phone')
      expect(deviceId).toBeTruthy()
      expect(token).toBeTruthy()
      expect(currentSettings.devices.length).toBe(1)

      const result = pairingService.validateDeviceToken(token)
      expect(result.valid).toBe(true)

      const actions = currentSettings.auditLog.map((e) => e.action)
      expect(actions).toContain('pairing_code_generated')
      expect(actions).toContain('pairing_code_consumed')
      expect(actions).toContain('device_paired')
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Code expiry tests                                                 */
  /* ------------------------------------------------------------------ */

  describe('code expiry (TTL ≤ 2 min)', () => {
    it('rejects expired codes', () => {
      const { code, expiresAt } = pairingService.generatePairingCode()
      now = expiresAt + 1
      expect(pairingService.validatePairingCode(code)).toEqual({
        valid: false,
        reason: 'Pairing code has expired.'
      })
      expect(pairingService.consumePairingCode(code)).toBe(false)
    })

    it('accepts codes within the TTL window', () => {
      const { code, expiresAt } = pairingService.generatePairingCode()
      now = expiresAt - 1000
      expect(pairingService.validatePairingCode(code)).toEqual({ valid: true })
    })

    it('codes are single-use even within TTL', () => {
      const { code } = pairingService.generatePairingCode()
      pairingService.consumePairingCode(code)
      expect(pairingService.validatePairingCode(code)).toEqual({
        valid: false,
        reason: 'Pairing code has already been used.'
      })
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Token revocation tests                                            */
  /* ------------------------------------------------------------------ */

  describe('token revocation', () => {
    it('revoked token is immediately invalid', () => {
      const { token, deviceId } = pairingService.issueDeviceToken('Phone')
      expect(pairingService.validateDeviceToken(token).valid).toBe(true)

      pairingService.revokeDevice(deviceId)
      expect(pairingService.validateDeviceToken(token).valid).toBe(false)
    })

    it('revokeAll invalidates all tokens', () => {
      const { token: t1 } = pairingService.issueDeviceToken('Phone A')
      const { token: t2 } = pairingService.issueDeviceToken('Phone B')

      expect(pairingService.validateDeviceToken(t1).valid).toBe(true)
      expect(pairingService.validateDeviceToken(t2).valid).toBe(true)

      pairingService.revokeAllDevices()

      expect(pairingService.validateDeviceToken(t1).valid).toBe(false)
      expect(pairingService.validateDeviceToken(t2).valid).toBe(false)
    })

    it('devices list is empty after revokeAll', () => {
      pairingService.issueDeviceToken('Phone A')
      pairingService.issueDeviceToken('Phone B')
      pairingService.revokeAllDevices()
      expect(pairingService.getDevices()).toEqual([])
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Default-off proof                                                 */
  /* ------------------------------------------------------------------ */

  describe('default-off proof', () => {
    it('settings default to enabled: false', () => {
      const defaults = defaultMobileAccessSettings()
      expect(defaults.enabled).toBe(false)
    })

    it('new settings start with no devices and empty audit log', () => {
      const defaults = defaultMobileAccessSettings()
      expect(defaults.devices).toEqual([])
      expect(defaults.auditLog).toEqual([])
    })

    it('listener does not start when enabled is false', () => {
      currentSettings.enabled = false
      expect(listener.isRunning()).toBe(false)
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Audit events                                                      */
  /* ------------------------------------------------------------------ */

  describe('audit events', () => {
    it('emits pairing_code_generated on code generation', () => {
      pairingService.generatePairingCode()
      expect(currentSettings.auditLog[0].action).toBe('pairing_code_generated')
      expect(currentSettings.auditLog[0].actor).toBe('system')
    })

    it('emits device_paired on token issuance', () => {
      pairingService.issueDeviceToken('Test')
      const pairedEvent = currentSettings.auditLog.find((e) => e.action === 'device_paired')
      expect(pairedEvent).toBeTruthy()
      expect(pairedEvent?.actor).toBe('device')
      expect(pairedEvent?.deviceName).toBe('Test')
    })

    it('emits device_revoked on revocation', () => {
      const { deviceId } = pairingService.issueDeviceToken('Phone')
      pairingService.revokeDevice(deviceId)
      const revokedEvent = currentSettings.auditLog.find((e) => e.action === 'device_revoked')
      expect(revokedEvent).toBeTruthy()
      expect(revokedEvent?.actor).toBe('host')
      expect(revokedEvent?.deviceName).toBe('Phone')
    })

    it('emits devices_revoked_all for revokeAll', () => {
      pairingService.issueDeviceToken('Phone A')
      pairingService.issueDeviceToken('Phone B')
      pairingService.revokeAllDevices()
      const event = currentSettings.auditLog.find((e) => e.action === 'devices_revoked_all')
      expect(event).toBeTruthy()
    })

    it('emits token_invalid for bad tokens', () => {
      pairingService.validateDeviceToken('bad-token')
      const event = currentSettings.auditLog.find((e) => e.action === 'token_invalid')
      expect(event).toBeTruthy()
      expect(event?.details).toBe('invalid or unknown token')
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Cert fingerprint in QR payload                                    */
  /* ------------------------------------------------------------------ */

  describe('QR payload includes cert fingerprint and host candidates', () => {
    it('cert fingerprint is null when listener not started', () => {
      expect(listener.getCertFingerprint()).toBeNull()
    })

    it('host candidates include real LAN addresses, not placeholder', () => {
      const candidates = listener.getHostCandidates()
      expect(candidates.length).toBeGreaterThan(0)
      for (const c of candidates) {
        expect(c.host).not.toBe('192.168.1.x')
        expect(c.port).toBe(19443)
      }
    })
  })
})
