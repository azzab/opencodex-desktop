import { z } from 'zod'
import { REDACTED_SECRET, redactSecretText } from './secret-redaction'

export const REMOTE_RUNNER_PROTOCOL_VERSION = 1

const idSchema = z.string().trim().min(1).max(256)
const labelSchema = z.string().trim().min(1).max(200)
const isoDateSchema = z.string().trim().min(1).max(128)
const optionalTextSchema = z.string().trim().max(1000).optional()

export const RemoteRunnerTypeSchema = z.enum(['local-desktop', 'ssh-host', 'cloud-worker'])
export type RemoteRunnerType = z.infer<typeof RemoteRunnerTypeSchema>

export const RemoteRunnerStatusSchema = z.enum(['available', 'disabled', 'unavailable'])
export type RemoteRunnerStatus = z.infer<typeof RemoteRunnerStatusSchema>

export const RemoteRunnerRedactionModeSchema = z.enum([
  'metadata',
  'summary',
  'selected_excerpt',
  'explicit_full'
])
export type RemoteRunnerRedactionMode = z.infer<typeof RemoteRunnerRedactionModeSchema>

export const RemoteRunnerPermissionModeSchema = z.enum([
  'unavailable',
  'metadata_only',
  'consent_required',
  'allowed'
])
export type RemoteRunnerPermissionMode = z.infer<typeof RemoteRunnerPermissionModeSchema>

export const RemoteRunnerDataClassSchema = z.enum([
  'thread_metadata',
  'redacted_progress',
  'approval_metadata',
  'audit_metadata',
  'workspace_label',
  'selected_file_excerpt',
  'diff_excerpt',
  'terminal_excerpt',
  'screenshot',
  'browser_evidence',
  'full_prompt',
  'full_assistant_output',
  'source_file',
  'raw_terminal_stream',
  'browser_cookies',
  'api_keys',
  'oauth_tokens',
  'mcp_credentials',
  'env_values',
  'keychain_material'
])
export type RemoteRunnerDataClass = z.infer<typeof RemoteRunnerDataClassSchema>

export const RemoteRunnerDataPolicySchema = z.object({
  defaultAllowed: z.array(RemoteRunnerDataClassSchema).max(32).default([
    'thread_metadata',
    'redacted_progress',
    'approval_metadata',
    'audit_metadata',
    'workspace_label'
  ]),
  consentRequired: z.array(RemoteRunnerDataClassSchema).max(32).default([
    'selected_file_excerpt',
    'diff_excerpt',
    'terminal_excerpt',
    'screenshot',
    'browser_evidence',
    'full_prompt',
    'full_assistant_output'
  ]),
  never: z.array(RemoteRunnerDataClassSchema).max(32).default([
    'source_file',
    'raw_terminal_stream',
    'browser_cookies',
    'api_keys',
    'oauth_tokens',
    'mcp_credentials',
    'env_values',
    'keychain_material'
  ])
}).strict().superRefine((policy, ctx) => {
  const never = new Set(policy.never)
  const defaultConflicts = policy.defaultAllowed.filter((item) => never.has(item))
  if (defaultConflicts.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['defaultAllowed'],
      message: `never-relayed data classes cannot be default allowed: ${defaultConflicts.join(', ')}`
    })
  }

  const consentConflicts = policy.consentRequired.filter((item) => never.has(item))
  if (consentConflicts.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['consentRequired'],
      message: `never-relayed data classes cannot be consent-gated: ${consentConflicts.join(', ')}`
    })
  }
})
export type RemoteRunnerDataPolicy = z.infer<typeof RemoteRunnerDataPolicySchema>

export const RemoteRunnerShellSchema = z.object({
  os: z.enum(['macos', 'linux', 'windows', 'unknown']),
  shell: z.string().trim().min(1).max(80),
  commandSyntax: z.enum(['posix', 'powershell', 'cmd', 'unknown'])
}).strict()
export type RemoteRunnerShell = z.infer<typeof RemoteRunnerShellSchema>

export const RemoteRunnerGitCapabilitiesSchema = z.object({
  available: z.boolean(),
  worktrees: z.boolean(),
  partialClone: z.boolean(),
  lfs: z.boolean()
}).strict()
export type RemoteRunnerGitCapabilities = z.infer<typeof RemoteRunnerGitCapabilitiesSchema>

export const RemoteRunnerBrowserCapabilitiesSchema = z.object({
  support: z.enum(['none', 'local-preview', 'remote-debugging']),
  evidence: RemoteRunnerPermissionModeSchema
}).strict().superRefine((browser, ctx) => {
  if (browser.support === 'none' && browser.evidence !== 'unavailable') {
    ctx.addIssue({
      code: 'custom',
      path: ['evidence'],
      message: 'browser evidence must be unavailable when browser support is none'
    })
  }
})
export type RemoteRunnerBrowserCapabilities = z.infer<typeof RemoteRunnerBrowserCapabilitiesSchema>

export const RemoteRunnerAllowedRootSchema = z.object({
  id: idSchema,
  label: labelSchema,
  kind: z.enum(['local', 'remote', 'ephemeral']),
  trust: z.enum(['trusted', 'untrusted']),
  redaction: z.enum(['label_only', 'metadata', 'explicit_full']).default('metadata')
}).strict()
export type RemoteRunnerAllowedRoot = z.infer<typeof RemoteRunnerAllowedRootSchema>

export const RemoteRunnerToolPolicySchema = z.object({
  terminal: RemoteRunnerPermissionModeSchema,
  filesystem: RemoteRunnerPermissionModeSchema,
  git: RemoteRunnerPermissionModeSchema,
  browser: RemoteRunnerPermissionModeSchema,
  artifacts: RemoteRunnerPermissionModeSchema
}).strict()
export type RemoteRunnerToolPolicy = z.infer<typeof RemoteRunnerToolPolicySchema>

export const RemoteRunnerBudgetPolicySchema = z.object({
  maxRunSeconds: z.number().int().positive().max(86_400),
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxCostUsd: z.number().positive().optional()
}).strict()
export type RemoteRunnerBudgetPolicy = z.infer<typeof RemoteRunnerBudgetPolicySchema>

export const RemoteRunnerApprovalPolicySchema = z.object({
  hostApprovalRequired: z.literal(true),
  remoteMayLowerHostPolicy: z.literal(false),
  perActionConsentRequired: z.boolean()
}).strict()
export type RemoteRunnerApprovalPolicy = z.infer<typeof RemoteRunnerApprovalPolicySchema>

export const RemoteRunnerAuditPolicySchema = z.object({
  required: z.literal(true),
  emitRunIds: z.boolean(),
  payloadRedaction: z.enum(['metadata', 'summary'])
}).strict()
export type RemoteRunnerAuditPolicy = z.infer<typeof RemoteRunnerAuditPolicySchema>

export const RemoteRunnerCredentialStorageSchema = z.object({
  kind: z.enum(['none', 'os-keychain', 'ssh-agent', 'secret-manager']),
  credentialRef: idSchema.optional(),
  exportsRawSecret: z.literal(false)
}).strict().superRefine((storage, ctx) => {
  if (storage.kind === 'none' && storage.credentialRef) {
    ctx.addIssue({
      code: 'custom',
      path: ['credentialRef'],
      message: 'credentialRef is not allowed when credential storage kind is none'
    })
  }
  if (storage.kind !== 'none' && !storage.credentialRef) {
    ctx.addIssue({
      code: 'custom',
      path: ['credentialRef'],
      message: 'credentialRef is required for credential-backed remote runners'
    })
  }
})
export type RemoteRunnerCredentialStorage = z.infer<typeof RemoteRunnerCredentialStorageSchema>

export const RemoteRunnerModelAvailabilitySchema = z.object({
  providerId: idSchema,
  modelIds: z.array(z.string().trim().min(1).max(256)).max(128),
  role: z.enum(['primary', 'planner', 'reviewer', 'worker', 'utility']).optional()
}).strict()
export type RemoteRunnerModelAvailability = z.infer<typeof RemoteRunnerModelAvailabilitySchema>

export const RemoteRunnerCapabilityHandshakeSchema = z.object({
  id: idSchema,
  protocolVersion: z.literal(REMOTE_RUNNER_PROTOCOL_VERSION),
  type: RemoteRunnerTypeSchema,
  label: labelSchema,
  status: RemoteRunnerStatusSchema,
  issuedAt: isoDateSchema,
  expiresAt: isoDateSchema.optional(),
  shell: RemoteRunnerShellSchema,
  git: RemoteRunnerGitCapabilitiesSchema,
  browser: RemoteRunnerBrowserCapabilitiesSchema,
  allowedRoots: z.array(RemoteRunnerAllowedRootSchema).max(200),
  toolPolicy: RemoteRunnerToolPolicySchema,
  dataPolicy: RemoteRunnerDataPolicySchema,
  budget: RemoteRunnerBudgetPolicySchema,
  approvals: RemoteRunnerApprovalPolicySchema,
  audit: RemoteRunnerAuditPolicySchema,
  models: z.array(RemoteRunnerModelAvailabilitySchema).max(50).default([]),
  credentialStorage: RemoteRunnerCredentialStorageSchema
}).strict().superRefine((handshake, ctx) => {
  if (handshake.type === 'local-desktop' && handshake.credentialStorage.kind !== 'none') {
    ctx.addIssue({
      code: 'custom',
      path: ['credentialStorage', 'kind'],
      message: 'local desktop runners must not advertise remote credential storage'
    })
  }
  if (handshake.status !== 'available' && handshake.toolPolicy.terminal === 'allowed') {
    ctx.addIssue({
      code: 'custom',
      path: ['toolPolicy', 'terminal'],
      message: 'unavailable or disabled runners cannot allow terminal execution'
    })
  }
})
export type RemoteRunnerCapabilityHandshake = z.infer<typeof RemoteRunnerCapabilityHandshakeSchema>

export const RemoteSshHostConfigSchema = z.object({
  id: idSchema,
  label: labelSchema,
  enabled: z.boolean(),
  endpointRef: idSchema,
  usernameRef: idSchema.optional(),
  credentialStorage: RemoteRunnerCredentialStorageSchema,
  hostKeyPolicy: z.enum(['known-hosts', 'pinned-fingerprint-ref', 'manual-confirm'])
}).strict().superRefine((config, ctx) => {
  if (config.credentialStorage.kind === 'none') {
    ctx.addIssue({
      code: 'custom',
      path: ['credentialStorage', 'kind'],
      message: 'SSH host configs must reference credential storage, not raw credentials'
    })
  }
})
export type RemoteSshHostConfig = z.infer<typeof RemoteSshHostConfigSchema>

export const RemoteRunnerSessionControlMessageSchema = z.object({
  id: idSchema,
  version: z.literal(REMOTE_RUNNER_PROTOCOL_VERSION),
  sentAt: isoDateSchema,
  runnerId: idSchema,
  runId: idSchema,
  action: z.enum(['stop', 'resume', 'reconnect']),
  requestedBy: z.enum(['host', 'remote-client', 'policy']),
  reason: optionalTextSchema
}).strict()
export type RemoteRunnerSessionControlMessage = z.infer<typeof RemoteRunnerSessionControlMessageSchema>

export const RemoteRunnerAuditEventSchema = z.object({
  id: idSchema,
  version: z.literal(REMOTE_RUNNER_PROTOCOL_VERSION),
  timestamp: isoDateSchema,
  runnerId: idSchema,
  runId: idSchema.optional(),
  actor: z.enum(['host', 'remote-client', 'policy', 'runner']),
  action: z.string().trim().min(1).max(160),
  outcome: z.enum(['requested', 'allowed', 'denied', 'blocked', 'completed', 'failed']),
  payloadRedaction: RemoteRunnerRedactionModeSchema,
  consentId: idSchema.optional(),
  sensitivePayload: z.literal(false),
  reason: optionalTextSchema
}).strict().superRefine((event, ctx) => {
  if (event.payloadRedaction === 'explicit_full' && !event.consentId) {
    ctx.addIssue({
      code: 'custom',
      path: ['consentId'],
      message: 'explicit_full audit payloads require a consent id'
    })
  }
})
export type RemoteRunnerAuditEvent = z.infer<typeof RemoteRunnerAuditEventSchema>

const REMOTE_REDACTION_KEY_PATTERN = /(authorization|bearer|credential|endpoint|fingerprint|host|key|password|secret|token|username)/i

export function redactRemoteRunnerConfig<T>(value: T): T {
  return redactRemoteValue(value) as T
}

function redactRemoteValue(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => redactRemoteValue(item))
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value
    if (REMOTE_REDACTION_KEY_PATTERN.test(key)) return REDACTED_SECRET
    return redactSecretText(value)
  }

  const out: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = REMOTE_REDACTION_KEY_PATTERN.test(childKey)
      ? REDACTED_SECRET
      : redactRemoteValue(childValue, childKey)
  }
  return out
}
