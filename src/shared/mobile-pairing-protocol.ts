import { z } from 'zod'

export const MOBILE_PAIRING_PROTOCOL_VERSION = 1

const idSchema = z.string().trim().min(1).max(256)
const isoDateSchema = z.string().trim().min(1).max(128)
const labelSchema = z.string().trim().min(1).max(200)

export const MobilePairingCodeSchema = z.object({
  code: z.string().trim().min(6).max(64),
  expiresAt: z.number().int().positive()
}).strict()
export type MobilePairingCode = z.infer<typeof MobilePairingCodeSchema>

export const MobileQrPayloadSchema = z.object({
  v: z.literal(MOBILE_PAIRING_PROTOCOL_VERSION),
  host: z.string().trim().min(1).max(256),
  port: z.number().int().positive().max(65535),
  certFingerprint: z.string().trim().min(16).max(128),
  pairingCode: z.string().trim().min(6).max(64),
  expiresAt: isoDateSchema
}).strict()
export type MobileQrPayload = z.infer<typeof MobileQrPayloadSchema>

export const MobilePairingClaimSchema = z.object({
  pairingCode: z.string().trim().min(6).max(64),
  deviceName: z.string().trim().min(1).max(200).default('My Phone')
}).strict()
export type MobilePairingClaim = z.input<typeof MobilePairingClaimSchema>

export const MobileDeviceSessionSchema = z.object({
  deviceId: idSchema,
  deviceName: labelSchema,
  token: z.string().trim().min(16).max(512),
  createdAt: isoDateSchema,
  expiresAt: isoDateSchema
}).strict()
export type MobileDeviceSession = z.infer<typeof MobileDeviceSessionSchema>

export const MobileDeviceTokenStatusSchema = z.object({
  valid: z.boolean(),
  deviceId: z.string().trim().min(1).max(256).optional(),
  deviceName: z.string().trim().min(1).max(200).optional(),
  reason: z.string().trim().min(1).max(500).optional()
}).strict()
export type MobileDeviceTokenStatus = z.infer<typeof MobileDeviceTokenStatusSchema>

export const MobileDeviceListEntrySchema = z.object({
  id: idSchema,
  name: labelSchema,
  createdAt: isoDateSchema,
  lastSeenAt: isoDateSchema
}).strict()
export type MobileDeviceListEntry = z.infer<typeof MobileDeviceListEntrySchema>

export const MobileRevokeDeviceRequestSchema = z.object({
  deviceId: idSchema
}).strict()
export type MobileRevokeDeviceRequest = z.infer<typeof MobileRevokeDeviceRequestSchema>

export const MobileRevokeResultSchema = z.object({
  ok: z.boolean(),
  deviceId: z.string().trim().min(1).max(256)
}).strict()
export type MobileRevokeResult = z.infer<typeof MobileRevokeResultSchema>

export const MobileAuditEventSchema = z.object({
  id: idSchema,
  timestamp: isoDateSchema,
  actor: z.enum(['host', 'device', 'system']),
  deviceId: z.string().trim().min(1).max(256).optional(),
  deviceName: z.string().trim().min(1).max(200).optional(),
  action: z.enum([
    'pairing_requested',
    'pairing_code_generated',
    'pairing_code_expired',
    'pairing_code_consumed',
    'device_paired',
    'device_revoked',
    'devices_revoked_all',
    'device_connected',
    'device_disconnected',
    'tls_listener_started',
    'tls_listener_stopped',
    'scope_denied',
    'token_invalid'
  ]),
  details: z.string().trim().min(1).max(2000).optional()
}).strict()
export type MobileAuditEvent = z.infer<typeof MobileAuditEventSchema>
