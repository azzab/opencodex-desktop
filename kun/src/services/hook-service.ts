import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type {
  KunHookLifecyclePhase,
  KunHookAuditEvent,
  KunHookSettingsV1,
  KunHookTrustEntryV1
} from '../contracts/hooks.js'
import type {
  HookGate,
  HookDiscoveredInfo,
  HookRunResult,
  HookPhaseResult,
  HookContext,
  HookExecutionDecision
} from '../ports/hook-gate.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HOOKS_DIR = '.opencodex/hooks'
const MAX_OUTPUT_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

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
// Helpers
// ---------------------------------------------------------------------------

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
    if (!statSync(filePath).isFile()) return false
    const ext = basename(filePath).toLowerCase()
    if (ext.endsWith('.sh') || ext.endsWith('.js') || ext.endsWith('.ts') || ext.endsWith('.py')) return true
    try {
      return (statSync(filePath).mode & 0o111) !== 0
    } catch {
      return false
    }
  } catch {
    return false
  }
}

function isRedactedEnvKey(key: string): boolean {
  const upper = key.toUpperCase()
  if (ALLOWED_ENV_KEYS.has(upper)) return false
  if (REDACTED_ENV_KEYS.has(upper)) return true
  if (upper.includes('KEY') || upper.includes('SECRET') || upper.includes('TOKEN') ||
      upper.includes('PASSWORD') || upper.includes('CREDENTIAL') || upper.includes('PRIVATE')) {
    return true
  }
  return false
}

function buildHookEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (!isRedactedEnvKey(key)) {
      env[key] = value
    }
  }
  return env
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function discoverHooksInDir(dir: string, scope: 'user' | 'project'): HookDiscoveredInfo[] {
  const hooks: HookDiscoveredInfo[] = []
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
      hooks.push({ id, scriptPath: resolve(fullPath), scope, phase, contentHash, executable: true })
    } catch {
      // skip unreadable files
    }
  }
  return hooks
}

// ---------------------------------------------------------------------------
// HookRunner — implements HookGate
// ---------------------------------------------------------------------------

export class HookRunner implements HookGate {
  private settings: KunHookSettingsV1
  private _auditLog: KunHookAuditEvent[]

  constructor(settings: KunHookSettingsV1) {
    this.settings = settings
    this._auditLog = [...settings.auditLog]
  }

  loadSettings(settings: KunHookSettingsV1): void {
    this.settings = settings
    // Merge existing audit log with any new entries from settings
    if (settings.auditLog.length > 0) {
      this._auditLog = settings.auditLog.slice(
        Math.max(0, settings.auditLog.length - settings.maxAuditEvents)
      )
    }
  }

  getSettings(): KunHookSettingsV1 {
    return { ...this.settings, auditLog: [...this._auditLog] }
  }

  discover(workspaceRoot?: string): HookDiscoveredInfo[] {
    const home = homedir()
    const userDir = join(home, DEFAULT_HOOKS_DIR)
    const user = discoverHooksInDir(userDir, 'user')
    if (!workspaceRoot) return user
    const projectDir = join(workspaceRoot, DEFAULT_HOOKS_DIR)
    const project = discoverHooksInDir(projectDir, 'project')
    return [...user, ...project]
  }

  async execute(phase: KunHookLifecyclePhase, context: HookContext): Promise<HookPhaseResult> {
    const results: HookPhaseResult['results'] = []
    let overallDecision: HookExecutionDecision = 'allow'

    // Kill switch — no hooks run
    if (!this.settings.enabled) {
      return { decision: 'allow', results }
    }

    const allHooks = this.discover(context.workspaceRoot)
    const phaseHooks = allHooks.filter((h) => h.phase === phase)

    for (const hook of phaseHooks) {
      const trustEntry = this.settings.trustedHooks[hook.id]
      const trusted = trustEntry?.trusted === true && trustEntry.contentHash === hook.contentHash

      let trustReason: 'untrusted' | 'hash-mismatch' | 'not-found' | 'kill-switch' | undefined
      if (!trustEntry) {
        trustReason = 'not-found'
      } else if (trustEntry.trusted !== true) {
        trustReason = 'untrusted'
      } else if (trustEntry.contentHash !== hook.contentHash) {
        trustReason = 'hash-mismatch'
      }

      if (!trusted) {
        results.push({ hook, trusted: false, trustReason })
        continue
      }

      // Execute the trusted hook
      const runResult = await this.runHookProcess(hook, {
        cwd: context.workspaceRoot ?? dirname(hook.scriptPath),
        stdinPayload: context.payload,
        timeoutMs: context.timeoutMs ?? this.settings.defaultTimeoutMs
      })

      // Determine denial for gating hooks
      let decision: HookExecutionDecision | undefined
      if (phase === 'PreToolUse' || phase === 'PermissionRequest') {
        if (runResult.exitCode !== 0 || runResult.error || runResult.timedOut) {
          decision = 'deny'
          overallDecision = 'deny'
        } else {
          try {
            const parsed = JSON.parse(runResult.stdout.trim())
            if (parsed.decision === 'deny') {
              decision = 'deny'
              overallDecision = 'deny'
            } else {
              decision = 'allow'
            }
          } catch {
            decision = 'allow'
          }
        }
      }

      const auditEvent: KunHookAuditEvent = {
        hookId: hook.id,
        phase: hook.phase,
        startedAt: new Date(Date.now() - runResult.durationMs).toISOString(),
        durationMs: runResult.durationMs,
        exitCode: runResult.exitCode,
        signal: runResult.signal,
        stdoutBytes: Buffer.byteLength(runResult.stdout, 'utf8'),
        stderrBytes: Buffer.byteLength(runResult.stderr, 'utf8'),
        ...(decision ? { decision } : {}),
        ...(runResult.error ? { error: runResult.error } : {})
      }

      this._auditLog.push(auditEvent)
      if (this._auditLog.length > this.settings.maxAuditEvents) {
        this._auditLog = this._auditLog.slice(this._auditLog.length - this.settings.maxAuditEvents)
      }

      results.push({ hook, trusted: true, runResult, auditEvent })
    }

    return { decision: overallDecision, results }
  }

  getAuditLog(): readonly KunHookAuditEvent[] {
    return this._auditLog
  }

  async approve(hookId: string, workspaceRoot?: string): Promise<KunHookTrustEntryV1 | null> {
    const hooks = this.discover(workspaceRoot)
    const hook = hooks.find((h) => h.id === hookId)
    if (!hook) return null

    const entry: KunHookTrustEntryV1 = {
      id: hook.id,
      scriptPath: hook.scriptPath,
      pinnedContent: '', // content is pinned by hash
      contentHash: hook.contentHash,
      scope: hook.scope,
      approvedAt: new Date().toISOString(),
      trusted: true
    }

    this.settings = {
      ...this.settings,
      trustedHooks: {
        ...this.settings.trustedHooks,
        [hook.id]: entry
      }
    }

    return entry
  }

  async revoke(hookId: string): Promise<boolean> {
    const existing = this.settings.trustedHooks[hookId]
    if (!existing) return false

    this.settings = {
      ...this.settings,
      trustedHooks: {
        ...this.settings.trustedHooks,
        [hookId]: { ...existing, trusted: false }
      }
    }

    return true
  }

  setKillSwitch(enabled: boolean): void {
    this.settings = { ...this.settings, enabled }
  }

  // ── private helpers ──────────────────────────────────────────────

  private async runHookProcess(
    hook: HookDiscoveredInfo,
    options: {
      cwd: string
      stdinPayload?: Record<string, unknown>
      timeoutMs: number
    }
  ): Promise<HookRunResult> {
    const maxOutput = this.settings.maxOutputBytes
    const startedAt = Date.now()

    return new Promise<HookRunResult>((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false

      const child = spawn(hook.scriptPath, [], {
        cwd: options.cwd,
        env: buildHookEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      })

      if (options.stdinPayload) {
        try {
          const payload = JSON.stringify(options.stdinPayload)
          child.stdin?.write(payload)
        } catch {
          // Ignore serialization errors
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
          stderr: `Hook timed out after ${options.timeoutMs}ms\n${stderr}`.slice(0, maxOutput),
          durationMs: Date.now() - startedAt,
          timedOut: true,
          error: `Hook timed out after ${options.timeoutMs}ms`
        })
      }, options.timeoutMs)

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += String(chunk)
        if (stdout.length > maxOutput && !settled) {
          settled = true
          try { child.kill('SIGKILL') } catch { /* best effort */ }
        }
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += String(chunk)
        if (stderr.length > maxOutput && !settled) {
          settled = true
          try { child.kill('SIGKILL') } catch { /* best effort */ }
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
}
