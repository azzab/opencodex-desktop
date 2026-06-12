import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve, dirname } from 'node:path'
import type {
  KunHookAuditEvent,
  KunHookLifecyclePhase,
  KunHookSettingsV1,
  KunHookTrustEntryV1
} from '../../shared/app-settings-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HOOKS_DIR = '.opencodex/hooks'
const MAX_OUTPUT_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_AUDIT_EVENTS = 200

/** Env keys that must never be passed to hook processes. */
const REDACTED_ENV_KEYS = new Set([
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'KUN_RUNTIME_TOKEN',
  'API_KEY',
  'AUTH_TOKEN',
  'SECRET',
  'PASSWORD',
  'TOKEN',
  'CREDENTIALS'
])

/** Env keys explicitly allowed (safe for hooks). */
const ALLOWED_ENV_KEYS = new Set([
  'HOME',
  'USER',
  'PATH',
  'LANG',
  'LC_ALL',
  'SHELL',
  'TERM',
  'TMPDIR',
  'TEMP',
  'TMP',
  'PWD',
  'OLDPWD',
  'NODE_ENV',
  'NODE_PATH',
  'DISPLAY',
  'XAUTHORITY'
])

// ---------------------------------------------------------------------------
// Hook discovery
// ---------------------------------------------------------------------------

export type DiscoveredHook = {
  id: string
  scriptPath: string
  scope: 'user' | 'project'
  phase: KunHookLifecyclePhase
  /** Full file content as read from disk. */
  content: string
  /** SHA-256 hex digest of content. */
  contentHash: string
  /** Whether this hook is executable (+x or .sh/.js/.py/.ts). */
  executable: boolean
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function phaseFromFilename(filename: string): KunHookLifecyclePhase | null {
  const lower = basename(filename).toLowerCase()
  if (lower.startsWith('pre-tool') || lower.startsWith('pretool')) return 'PreToolUse'
  if (lower.startsWith('post-tool') || lower.startsWith('posttool')) return 'PostToolUse'
  if (lower.startsWith('permission')) return 'PermissionRequest'
  if (lower.startsWith('user-prompt') || lower.startsWith('userprompt')) return 'UserPromptSubmit'
  if (lower.startsWith('session-start')) return 'SessionStart'
  if (lower.startsWith('session-stop')) return 'SessionStop'
  return null
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) return false
    // Check if extension is a known script type or file is executable
    const ext = basename(filePath).toLowerCase()
    if (ext.endsWith('.sh') || ext.endsWith('.js') || ext.endsWith('.ts') || ext.endsWith('.py')) return true
    // On Unix, check the executable bit
    try {
      return (stat.mode & 0o111) !== 0
    } catch {
      return false
    }
  } catch {
    return false
  }
}

function discoverHooksInDir(dir: string, scope: 'user' | 'project'): DiscoveredHook[] {
  const hooks: DiscoveredHook[] = []
  if (!existsSync(dir)) return hooks
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return hooks
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const phase = phaseFromFilename(entry)
    if (!phase) continue
    if (!isExecutableFile(fullPath)) continue
    try {
      const content = readFileSync(fullPath, 'utf8')
      const contentHash = sha256(content)
      const id = `${scope}/${phase}/${entry}`
      hooks.push({ id, scriptPath: resolve(fullPath), scope, phase, content, contentHash, executable: true })
    } catch {
      // skip unreadable files
    }
  }
  return hooks
}

export function discoverAllHooks(
  workspaceRoot?: string,
  homeDir?: string
): DiscoveredHook[] {
  const home = homeDir ?? homedir()
  const userDir = join(home, DEFAULT_HOOKS_DIR)
  const user = discoverHooksInDir(userDir, 'user')
  if (!workspaceRoot) return user
  const projectDir = join(workspaceRoot, DEFAULT_HOOKS_DIR)
  const project = discoverHooksInDir(projectDir, 'project')
  return [...user, ...project]
}

// ---------------------------------------------------------------------------
// Trust store
// ---------------------------------------------------------------------------

export type HookTrustResult =
  | { trusted: true; reason?: undefined; entry: KunHookTrustEntryV1 }
  | { trusted: false; reason: 'untrusted' | 'hash-mismatch' | 'not-found' | 'kill-switch'; entry?: KunHookTrustEntryV1; existingEntry?: KunHookTrustEntryV1 }

export function checkHookTrust(
  hook: DiscoveredHook,
  settings: KunHookSettingsV1
): HookTrustResult {
  // Master kill switch: if hooks.enabled is false, nothing runs
  if (!settings.enabled) {
    return { trusted: false, reason: 'kill-switch' }
  }

  const entry = settings.trustedHooks[hook.id]
  if (!entry || !entry.trusted) {
    return { trusted: false, reason: entry ? 'untrusted' : 'not-found', existingEntry: entry }
  }

  // Content hash check: if the file changed since approval, auto-revoke
  if (entry.contentHash !== hook.contentHash) {
    return { trusted: false, reason: 'hash-mismatch', existingEntry: entry }
  }

  return { trusted: true, entry }
}

// ---------------------------------------------------------------------------
// Env filtering
// ---------------------------------------------------------------------------

function isRedactedEnvKey(key: string): boolean {
  const upper = key.toUpperCase()
  if (ALLOWED_ENV_KEYS.has(upper)) return false
  if (REDACTED_ENV_KEYS.has(upper)) return true
  // Heuristic: any env var containing "KEY", "SECRET", "TOKEN", "PASSWORD", "CREDENTIAL"
  // in its name is redacted
  if (upper.includes('KEY') || upper.includes('SECRET') || upper.includes('TOKEN') ||
      upper.includes('PASSWORD') || upper.includes('CREDENTIAL') || upper.includes('PRIVATE')) {
    return true
  }
  return false
}

export function buildHookEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  // Copy only safe env vars from the parent process
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (!isRedactedEnvKey(key)) {
      env[key] = value
    }
  }
  return env
}

// ---------------------------------------------------------------------------
// Hook execution
// ---------------------------------------------------------------------------

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

export type HookRunOptions = {
  timeoutMs?: number
  maxOutputBytes?: number
  stdinPayload?: Record<string, unknown>
  cwd?: string
}

export async function runHook(
  hook: DiscoveredHook,
  options: HookRunOptions = {}
): Promise<HookRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxOutput = options.maxOutputBytes ?? MAX_OUTPUT_BYTES
  const startedAt = Date.now()

  return new Promise<HookRunResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn(hook.scriptPath, [], {
      cwd: options.cwd ?? dirname(hook.scriptPath),
      env: buildHookEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    })

    // Write stdin payload if provided
    if (options.stdinPayload) {
      try {
        const payload = JSON.stringify(options.stdinPayload)
        child.stdin?.write(payload)
      } catch {
        // Ignore payload serialization errors
      }
    }
    child.stdin?.end()

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGKILL') } catch { /* best effort */ }
      resolve({
        hookId: hook.id,
        phase: hook.phase,
        exitCode: null,
        signal: 'SIGKILL',
        stdout: stdout.slice(0, maxOutput),
        stderr: `Hook timed out after ${timeoutMs}ms\n${stderr}`.slice(0, maxOutput),
        durationMs: Date.now() - startedAt,
        timedOut: true,
        error: `Hook timed out after ${timeoutMs}ms`
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += String(chunk)
      if (stdout.length > maxOutput) {
        if (!settled) {
          settled = true
          try { child.kill('SIGKILL') } catch { /* best effort */ }
        }
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += String(chunk)
      if (stderr.length > maxOutput) {
        if (!settled) {
          settled = true
          try { child.kill('SIGKILL') } catch { /* best effort */ }
        }
      }
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        hookId: hook.id,
        phase: hook.phase,
        exitCode: null,
        signal: null,
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        durationMs: Date.now() - startedAt,
        timedOut: false,
        error: err.message
      })
    })

    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        hookId: hook.id,
        phase: hook.phase,
        exitCode: code ?? null,
        signal: signal ?? null,
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        durationMs: Date.now() - startedAt,
        timedOut: false
      })
    })
  })
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function recordAuditEvent(
  result: HookRunResult,
  auditLog: KunHookAuditEvent[],
  decision?: 'allow' | 'deny',
  maxAuditEvents = MAX_AUDIT_EVENTS
): KunHookAuditEvent[] {
  const event: KunHookAuditEvent = {
    hookId: result.hookId,
    phase: result.phase,
    startedAt: new Date(Date.now() - result.durationMs).toISOString(),
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    signal: result.signal,
    stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'),
    stderrBytes: Buffer.byteLength(result.stderr, 'utf8'),
    ...(decision ? { decision } : {}),
    ...(result.error ? { error: result.error } : {})
  }
  const log = [...auditLog, event]
  if (log.length > maxAuditEvents) {
    return log.slice(log.length - maxAuditEvents)
  }
  return log
}

// ---------------------------------------------------------------------------
// Trust operations (for IPC / settings management)
// ---------------------------------------------------------------------------

export function approveHook(
  hook: DiscoveredHook,
  settings: KunHookSettingsV1
): { settings: KunHookSettingsV1; entry: KunHookTrustEntryV1 } {
  const entry: KunHookTrustEntryV1 = {
    id: hook.id,
    scriptPath: hook.scriptPath,
    pinnedContent: hook.content,
    contentHash: hook.contentHash,
    scope: hook.scope,
    approvedAt: new Date().toISOString(),
    trusted: true
  }
  const newSettings: KunHookSettingsV1 = {
    ...settings,
    trustedHooks: {
      ...settings.trustedHooks,
      [hook.id]: entry
    }
  }
  return { settings: newSettings, entry }
}

export function revokeHook(
  hookId: string,
  settings: KunHookSettingsV1
): KunHookSettingsV1 {
  const existing = settings.trustedHooks[hookId]
  if (!existing) return settings
  return {
    ...settings,
    trustedHooks: {
      ...settings.trustedHooks,
      [hookId]: { ...existing, trusted: false }
    }
  }
}

export function setKillSwitch(
  enabled: boolean,
  settings: KunHookSettingsV1
): KunHookSettingsV1 {
  return { ...settings, enabled }
}

/**
 * Check and auto-revoke any trusted hooks whose content has changed.
 * Returns updated settings and the list of revoked hook ids.
 */
export function autoRevokeChangedHooks(
  hooks: DiscoveredHook[],
  settings: KunHookSettingsV1
): { settings: KunHookSettingsV1; revoked: string[] } {
  const revoked: string[] = []
  let nextSettings = settings

  for (const hook of hooks) {
    const entry = settings.trustedHooks[hook.id]
    if (entry && entry.trusted && entry.contentHash !== hook.contentHash) {
      revoked.push(hook.id)
      nextSettings = {
        ...nextSettings,
        trustedHooks: {
          ...nextSettings.trustedHooks,
          [hook.id]: { ...entry, trusted: false }
        }
      }
    }
  }

  return { settings: nextSettings, revoked }
}

// ---------------------------------------------------------------------------
// High-level: discover, check trust, run hooks for a lifecycle phase
// ---------------------------------------------------------------------------

export type ExecuteHookResult = {
  hook: DiscoveredHook
  trustResult: HookTrustResult
  runResult?: HookRunResult
  auditEvent?: KunHookAuditEvent
  decision?: 'allow' | 'deny'
}

export async function executeHooksForPhase(
  phase: KunHookLifecyclePhase,
  workspaceRoot: string | undefined,
  settings: KunHookSettingsV1,
  options: HookRunOptions = {}
): Promise<ExecuteHookResult[]> {
  const allHooks = discoverAllHooks(workspaceRoot)
  const phaseHooks = allHooks.filter((h) => h.phase === phase)
  const results: ExecuteHookResult[] = []

  for (const hook of phaseHooks) {
    const trustResult = checkHookTrust(hook, settings)

    if (!trustResult.trusted) {
      results.push({ hook, trustResult })
      continue
    }

    const runResult = await runHook(hook, {
      ...options,
      timeoutMs: options.timeoutMs ?? settings.defaultTimeoutMs,
      maxOutputBytes: options.maxOutputBytes ?? settings.maxOutputBytes
    })

    // Determine allow/deny for gating hooks
    let decision: 'allow' | 'deny' | undefined
    if (phase === 'PreToolUse' || phase === 'PermissionRequest') {
      // Nonzero exit or error → deny by default for gating hooks
      if (runResult.exitCode !== 0 || runResult.error || runResult.timedOut) {
        decision = 'deny'
      } else {
        // Parse stdout for explicit decision
        try {
          const parsed = JSON.parse(runResult.stdout.trim())
          if (parsed.decision === 'deny') decision = 'deny'
          else if (parsed.decision === 'allow') decision = 'allow'
        } catch {
          // No JSON output → allow by default
          decision = 'allow'
        }
      }
    }

    const auditEvent = recordAuditEvent(runResult, [], decision, settings.maxAuditEvents)[0]

    results.push({ hook, trustResult, runResult, auditEvent, decision })
  }

  return results
}

// ---------------------------------------------------------------------------
// Source reading (for review dialog)
// ---------------------------------------------------------------------------

export function readHookSource(scriptPath: string): { ok: true; content: string } | { ok: false; error: string } {
  try {
    const content = readFileSync(scriptPath, 'utf8')
    return { ok: true, content }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
