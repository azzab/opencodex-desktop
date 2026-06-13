import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { MobileAccessSettingsV1, MobileAccessDeviceV1, MobileAccessAuditEventV1 } from '../../shared/app-settings-types'

const PAIRING_CODE_TTL_MS = 2 * 60 * 1000 // 2 minutes
const PAIRING_CODE_LENGTH = 8
const DEVICE_TOKEN_LENGTH = 48

export interface MobilePairingServiceOptions {
  dataDir: string
  getSettings: () => MobileAccessSettingsV1
  saveSettings: (settings: MobileAccessSettingsV1) => void | Promise<void>
  now?: () => number
}

interface PairingEntry {
  code: string
  codeHash: string
  expiresAt: number
}

export class MobilePairingService {
  private pairingEntries = new Map<string, PairingEntry>()
  private consumedCodes = new Set<string>()

  constructor(private readonly opts: MobilePairingServiceOptions) {}

  /* ---------------------- pairing codes ---------------------- */

  generatePairingCode(): { code: string; expiresAt: number } {
    const code = randomBytes(PAIRING_CODE_LENGTH / 2).toString('hex').slice(0, PAIRING_CODE_LENGTH)
    const codeHash = createHash('sha256').update(code).digest('hex')
    const expiresAt = (this.opts.now?.() ?? Date.now()) + PAIRING_CODE_TTL_MS
    this.pairingEntries.set(codeHash, { code, codeHash, expiresAt })
    this.emitAudit('pairing_code_generated', 'system', undefined, undefined)
    return { code, expiresAt }
  }

  validatePairingCode(code: string): { valid: true } | { valid: false; reason: string } {
    const now = this.opts.now?.() ?? Date.now()
    const codeHash = createHash('sha256').update(code).digest('hex')

    // Already consumed
    if (this.consumedCodes.has(codeHash)) {
      this.emitAudit('pairing_code_expired', 'system', undefined, 'code already consumed')
      return { valid: false, reason: 'Pairing code has already been used.' }
    }

    const entry = this.pairingEntries.get(codeHash)
    if (!entry) {
      return { valid: false, reason: 'Invalid pairing code.' }
    }

    if (now > entry.expiresAt) {
      this.pairingEntries.delete(codeHash)
      this.emitAudit('pairing_code_expired', 'system', undefined, 'code expired')
      return { valid: false, reason: 'Pairing code has expired.' }
    }

    return { valid: true }
  }

  consumePairingCode(code: string): boolean {
    const codeHash = createHash('sha256').update(code).digest('hex')
    const entry = this.pairingEntries.get(codeHash)
    if (!entry) return false
    const now = this.opts.now?.() ?? Date.now()
    if (now > entry.expiresAt) return false
    if (this.consumedCodes.has(codeHash)) return false
    this.consumedCodes.add(codeHash)
    this.pairingEntries.delete(codeHash)
    this.emitAudit('pairing_code_consumed', 'system', undefined, undefined)
    return true
  }

  cleanupExpired(): void {
    const now = this.opts.now?.() ?? Date.now()
    for (const [hash, entry] of this.pairingEntries) {
      if (now > entry.expiresAt) {
        this.pairingEntries.delete(hash)
        this.emitAudit('pairing_code_expired', 'system', undefined, undefined)
      }
    }
  }

  /* ---------------------- device tokens ---------------------- */

  issueDeviceToken(deviceName: string): {
    deviceId: string
    token: string
    tokenHash: string
  } {
    const deviceId = randomUUID()
    const token = randomBytes(DEVICE_TOKEN_LENGTH).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const now = this.opts.now?.() ?? Date.now()

    const device: MobileAccessDeviceV1 = {
      id: deviceId,
      name: deviceName.trim() || 'Unknown Device',
      tokenHash,
      createdAt: new Date(now).toISOString(),
      lastSeenAt: new Date(now).toISOString()
    }

    const settings = this.opts.getSettings()
    this.opts.saveSettings({
      ...settings,
      devices: [...settings.devices, device]
    })

    this.emitAudit('device_paired', 'device', deviceId, device.name)
    return { deviceId, token, tokenHash }
  }

  validateDeviceToken(token: string): { valid: true; deviceId: string; deviceName: string } | { valid: false; reason: string } {
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const settings = this.opts.getSettings()
    const device = settings.devices.find((d) =>
      d.tokenHash.length === tokenHash.length &&
      timingSafeEqual(Buffer.from(d.tokenHash), Buffer.from(tokenHash))
    )

    if (!device) {
      this.emitAudit('token_invalid', 'device', undefined, undefined, 'invalid or unknown token')
      return { valid: false, reason: 'Invalid device token.' }
    }

    // Update last seen
    const now = this.opts.now?.() ?? Date.now()
    const updatedDevices = settings.devices.map((d) =>
      d.id === device.id ? { ...d, lastSeenAt: new Date(now).toISOString() } : d
    )
    this.opts.saveSettings({ ...settings, devices: updatedDevices })

    return { valid: true, deviceId: device.id, deviceName: device.name }
  }

  /* ---------------------- revocation ---------------------- */

  revokeDevice(deviceId: string): boolean {
    const settings = this.opts.getSettings()
    const device = settings.devices.find((d) => d.id === deviceId)
    if (!device) return false

    this.opts.saveSettings({
      ...settings,
      devices: settings.devices.filter((d) => d.id !== deviceId)
    })
    this.emitAudit('device_revoked', 'host', deviceId, device.name)
    return true
  }

  revokeAllDevices(): number {
    const settings = this.opts.getSettings()
    const count = settings.devices.length
    if (count === 0) return 0

    const names = settings.devices.map((d) => d.name).join(', ')
    this.opts.saveSettings({
      ...settings,
      devices: []
    })
    this.emitAudit('devices_revoked_all', 'host', undefined, `${count} devices revoked: ${names}`)
    return count
  }

  getDevices(): MobileAccessDeviceV1[] {
    return this.opts.getSettings().devices
  }

  /* ---------------------- audit ---------------------- */

  getAuditLog(): MobileAccessAuditEventV1[] {
    return this.opts.getSettings().auditLog
  }

  private emitAudit(
    action: MobileAccessAuditEventV1['action'],
    actor: MobileAccessAuditEventV1['actor'],
    deviceId?: string,
    deviceName?: string,
    details?: string
  ): void {
    const settings = this.opts.getSettings()
    const entry: MobileAccessAuditEventV1 = {
      id: randomUUID(),
      timestamp: new Date(this.opts.now?.() ?? Date.now()).toISOString(),
      actor,
      ...(deviceId ? { deviceId } : {}),
      ...(deviceName ? { deviceName } : {}),
      action,
      ...(details ? { details } : {})
    }
    const auditLog = [entry, ...settings.auditLog].slice(0, settings.maxAuditEntries)
    this.opts.saveSettings({ ...settings, auditLog })
  }

  isEnabled(): boolean {
    return this.opts.getSettings().enabled
  }
}
