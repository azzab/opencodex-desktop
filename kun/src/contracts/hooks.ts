/**
 * Kun Hook Contracts.
 *
 * Types shared between the Kun runtime hook service and the host (Electron GUI)
 * for lifecycle hook execution with trust, audit, and sandboxing.
 */

/** Hook lifecycle phases — kernel-level enforcement points. */
export type KunHookLifecyclePhase =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PermissionRequest'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionStop'

export type KunHookAllowDenyDecision = 'allow' | 'deny'

export type KunHookTrustScopeV1 = 'user' | 'project'

export type KunHookTrustEntryV1 = {
  id: string
  scriptPath: string
  pinnedContent: string
  contentHash: string
  scope: KunHookTrustScopeV1
  approvedAt: string
  trusted: boolean
}

export type KunHookAuditEvent = {
  hookId: string
  phase: KunHookLifecyclePhase
  startedAt: string
  durationMs: number
  exitCode: number | null
  signal: string | null
  stdoutBytes: number
  stderrBytes: number
  decision?: KunHookAllowDenyDecision
  error?: string
}

export type KunHookSettingsV1 = {
  enabled: boolean
  trustedHooks: Record<string, KunHookTrustEntryV1>
  defaultTimeoutMs: number
  maxOutputBytes: number
  maxAuditEvents: number
  auditLog: KunHookAuditEvent[]
}

export function defaultKunHookSettings(): KunHookSettingsV1 {
  return {
    enabled: false,
    trustedHooks: {},
    defaultTimeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
    maxAuditEvents: 200,
    auditLog: []
  }
}
