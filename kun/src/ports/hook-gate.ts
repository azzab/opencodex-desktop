/**
 * HookGate — runtime hook execution gate for lifecycle phases.
 *
 * Hooks are user- or project-provided executable scripts discovered from
 * `~/.opencodex/hooks` and `<workspace>/.opencodex/hooks`. They are governed
 * by a per-hook trust store (pinned SHA-256), a master kill switch, audit
 * events, output limits, timeouts, and redaction-filtered env.
 *
 * The gate is consulted at kernel-level lifecycle points:
 * - PreToolUse / PostToolUse — around each tool dispatch
 * - PermissionRequest — around approval/permission decisions
 * - UserPromptSubmit — around user message submission
 * - SessionStart / SessionStop — around session lifecycle
 */
import type {
  KunHookLifecyclePhase,
  KunHookAuditEvent,
  KunHookSettingsV1,
  KunHookTrustEntryV1
} from '../contracts/hooks.js'

export type HookDiscoveredInfo = {
  id: string
  scriptPath: string
  scope: 'user' | 'project'
  phase: KunHookLifecyclePhase
  contentHash: string
  executable: boolean
}

export type HookRunResult = {
  hookId: string
  phase: KunHookLifecyclePhase
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
  error?: string
}

export type HookExecutionDecision = 'allow' | 'deny'

export type HookPhaseResult = {
  /** Overall decision for the phase (deny if any gating hook denied). */
  decision: HookExecutionDecision
  /** Results for each hook that was executed. Untrusted hooks are skipped. */
  results: Array<{
    hook: HookDiscoveredInfo
    trusted: boolean
    trustReason?: 'untrusted' | 'hash-mismatch' | 'not-found' | 'kill-switch'
    runResult?: HookRunResult
    auditEvent?: KunHookAuditEvent
  }>
}

export type HookContext = {
  workspaceRoot?: string
  threadId?: string
  turnId?: string
  /** JSON-serialisable payload for the hook's stdin. */
  payload?: Record<string, unknown>
  /** Optional timeout override in ms. Falls back to settings. */
  timeoutMs?: number
}

export interface HookGate {
  /** Reload hook settings from the host (settings changed externally). */
  loadSettings(settings: KunHookSettingsV1): void

  /** Get current settings snapshot. */
  getSettings(): KunHookSettingsV1

  /** Discover all hooks in user + project directories. */
  discover(workspaceRoot?: string): HookDiscoveredInfo[]

  /** Run all hooks for a lifecycle phase. Untrusted hooks are skipped. */
  execute(phase: KunHookLifecyclePhase, context: HookContext): Promise<HookPhaseResult>

  /** Get recent audit events. */
  getAuditLog(): readonly KunHookAuditEvent[]

  /** Approve a hook by id. Pins current content hash. */
  approve(hookId: string, workspaceRoot?: string): Promise<KunHookTrustEntryV1 | null>

  /** Revoke trust for a hook by id. */
  revoke(hookId: string): Promise<boolean>

  /** Toggle master kill switch. */
  setKillSwitch(enabled: boolean): void
}
