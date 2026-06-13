import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MobilePairingService } from './mobile-pairing-service'
import type { MobileAccessSettingsV1 } from '../../shared/app-settings-types'

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

describe('MobilePairingService', () => {
  let currentSettings: MobileAccessSettingsV1
  let service: MobilePairingService
  let now: number

  beforeEach(() => {
    now = 1700000000000
    currentSettings = makeSettings()
    service = new MobilePairingService({
      dataDir: '/tmp/test-mobile-pairing',
      getSettings: () => currentSettings,
      saveSettings: (s) => { currentSettings = s },
      now: () => now
    })
  })

  describe('generatePairingCode', () => {
    it('generates an 8-char hex code with a 2-minute TTL', () => {
      const { code, expiresAt } = service.generatePairingCode()
      expect(code).toMatch(/^[0-9a-f]{8}$/)
      expect(expiresAt).toBe(now + 2 * 60 * 1000)
    })

    it('emits a pairing_code_generated audit event', () => {
      service.generatePairingCode()
      const events = currentSettings.auditLog
      expect(events.length).toBe(1)
      expect(events[0].action).toBe('pairing_code_generated')
      expect(events[0].actor).toBe('system')
    })

    it('generates unique codes each time', () => {
      const codes = new Set(Array.from({ length: 20 }, () => service.generatePairingCode().code))
      expect(codes.size).toBe(20)
    })
  })

  describe('validatePairingCode', () => {
    it('returns valid for a fresh code', () => {
      const { code } = service.generatePairingCode()
      expect(service.validatePairingCode(code)).toEqual({ valid: true })
    })

    it('returns invalid for an unknown code', () => {
      expect(service.validatePairingCode('00000000')).toEqual({
        valid: false,
        reason: 'Invalid pairing code.'
      })
    })

    it('returns invalid when the code has expired', () => {
      const { code, expiresAt } = service.generatePairingCode()
      now = expiresAt + 1
      expect(service.validatePairingCode(code)).toEqual({
        valid: false,
        reason: 'Pairing code has expired.'
      })
    })

    it('returns invalid after the code has been consumed', () => {
      const { code } = service.generatePairingCode()
      expect(service.validatePairingCode(code)).toEqual({ valid: true })
      service.consumePairingCode(code)
      expect(service.validatePairingCode(code)).toEqual({
        valid: false,
        reason: 'Pairing code has already been used.'
      })
    })
  })

  describe('consumePairingCode', () => {
    it('consumes a valid code (single use)', () => {
      const { code } = service.generatePairingCode()
      expect(service.consumePairingCode(code)).toBe(true)
      expect(service.consumePairingCode(code)).toBe(false) // already consumed
    })

    it('returns false for expired code', () => {
      const { code, expiresAt } = service.generatePairingCode()
      now = expiresAt + 1
      expect(service.consumePairingCode(code)).toBe(false)
    })

    it('returns false for unknown code', () => {
      expect(service.consumePairingCode('invalid')).toBe(false)
    })
  })

  describe('issueDeviceToken', () => {
    it('issues a token and creates a device record', () => {
      const { deviceId, token, tokenHash } = service.issueDeviceToken('Test Phone')

      expect(deviceId).toBeTruthy()
      expect(typeof deviceId).toBe('string')
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(32)
      expect(tokenHash).toBeTruthy()
      expect(typeof tokenHash).toBe('string')

      expect(currentSettings.devices.length).toBe(1)
      expect(currentSettings.devices[0].name).toBe('Test Phone')
      expect(currentSettings.devices[0].tokenHash).toBe(tokenHash)
    })

    it('defaults device name to "Unknown Device" when empty', () => {
      const { deviceId } = service.issueDeviceToken('')
      const device = currentSettings.devices.find((d) => d.id === deviceId)
      expect(device?.name).toBe('Unknown Device')
    })

    it('emits a device_paired audit event', () => {
      service.issueDeviceToken('My Phone')
      const events = currentSettings.auditLog
      expect(events[0].action).toBe('device_paired')
      expect(events[0].deviceName).toBe('My Phone')
    })
  })

  describe('validateDeviceToken', () => {
    it('validates a known device token', () => {
      const { token } = service.issueDeviceToken('Test Phone')
      const result = service.validateDeviceToken(token)
      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.deviceName).toBe('Test Phone')
      }
    })

    it('rejects an invalid token', () => {
      const result = service.validateDeviceToken('invalid-token-here-12345')
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.reason).toBe('Invalid device token.')
      }
    })

    it('updates lastSeenAt on successful validation', () => {
      const { token, deviceId } = service.issueDeviceToken('Test Phone')
      const oldLastSeen = currentSettings.devices.find((d) => d.id === deviceId)?.lastSeenAt

      now += 60_000 // advance 1 minute
      service.validateDeviceToken(token)

      const newLastSeen = currentSettings.devices.find((d) => d.id === deviceId)?.lastSeenAt
      expect(newLastSeen).not.toBe(oldLastSeen)
    })
  })

  describe('revocation', () => {
    it('revokes a specific device', () => {
      const { deviceId } = service.issueDeviceToken('Phone A')
      service.issueDeviceToken('Phone B')

      expect(currentSettings.devices.length).toBe(2)
      expect(service.revokeDevice(deviceId)).toBe(true)
      expect(currentSettings.devices.length).toBe(1)
      expect(currentSettings.devices[0].name).toBe('Phone B')

      // Audit event
      const auditAction = currentSettings.auditLog.find((e) => e.action === 'device_revoked')
      expect(auditAction).toBeTruthy()
      expect(auditAction?.deviceName).toBe('Phone A')
    })

    it('returns false for unknown device', () => {
      expect(service.revokeDevice('nonexistent')).toBe(false)
    })

    it('revokes all devices', () => {
      service.issueDeviceToken('Phone A')
      service.issueDeviceToken('Phone B')
      expect(service.revokeAllDevices()).toBe(2)
      expect(currentSettings.devices.length).toBe(0)
    })

    it('returns 0 when no devices to revoke', () => {
      expect(service.revokeAllDevices()).toBe(0)
    })

    it('revoked token is rejected on validation', () => {
      const { token, deviceId } = service.issueDeviceToken('Phone')
      service.revokeDevice(deviceId)
      const result = service.validateDeviceToken(token)
      expect(result.valid).toBe(false)
    })
  })

  describe('isEnabled', () => {
    it('returns the enabled flag', () => {
      expect(service.isEnabled()).toBe(true)
      currentSettings.enabled = false
      expect(service.isEnabled()).toBe(false)
    })
  })

  describe('audit events', () => {
    it('records all significant lifecycle events', () => {
      // Generate code
      const { code } = service.generatePairingCode()
      expect(currentSettings.auditLog.length).toBe(1)

      // Issue token
      const { token, deviceId } = service.issueDeviceToken('My Phone')
      expect(currentSettings.auditLog.length).toBe(2)

      // Revoke
      service.revokeDevice(deviceId)
      expect(currentSettings.auditLog.length).toBeGreaterThanOrEqual(3)

      // Verify the audit entries have correct structure
      for (const entry of currentSettings.auditLog) {
        expect(entry.id).toBeTruthy()
        expect(entry.timestamp).toBeTruthy()
        expect(entry.action).toBeTruthy()
      }
    })

    it('trims audit log to maxAuditEntries', () => {
      currentSettings.maxAuditEntries = 3
      currentSettings = makeSettings({ maxAuditEntries: 3 })
      service = new MobilePairingService({
        dataDir: '/tmp/test',
        getSettings: () => currentSettings,
        saveSettings: (s) => { currentSettings = s },
        now: () => now
      })

      // Generate 5 codes (5 audit events)
      for (let i = 0; i < 5; i++) {
        service.generatePairingCode()
      }

      expect(currentSettings.auditLog.length).toBe(3)
    })
  })
})
