import { randomUUID } from 'node:crypto'
import { spawn as nodePtySpawn, type IPty } from 'node-pty'
import type { AppSettingsV1 } from '../../shared/app-settings'

export type TerminalSessionInfo = {
  id: string
  cwd: string
  createdAt: number
  cols: number
  rows: number
}

export type TerminalAuditEvent = {
  id: string
  kind: 'session_spawned' | 'session_killed' | 'session_exited' | 'agent_exec_observed'
  sessionId?: string
  cwd?: string
  timestamp: string
  detail?: string
  /** Agent-exec-specific metadata. */
  agentToolName?: string
  agentToolKind?: string
  agentSummary?: string
  agentOutputTruncated?: string
  agentExitCode?: number
  agentThreadId?: string
}

export type TerminalAuditSink = (event: TerminalAuditEvent) => void

type TerminalSession = {
  id: string
  pty: IPty
  cwd: string
  createdAt: number
  cols: number
  rows: number
}

const MAX_AUDIT_EVENTS = 500

export class TerminalService {
  private sessions = new Map<string, TerminalSession>()
  private auditEvents: TerminalAuditEvent[] = []
  private auditSink: TerminalAuditSink | null = null
  private shell: string

  constructor(shell?: string) {
    this.shell = shell ?? (process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL ?? '/bin/bash'))
  }

  setAuditSink(sink: TerminalAuditSink | null): void {
    this.auditSink = sink
  }

  private emitAudit(event: TerminalAuditEvent): void {
    this.auditEvents.push(event)
    if (this.auditEvents.length > MAX_AUDIT_EVENTS) {
      this.auditEvents = this.auditEvents.slice(-MAX_AUDIT_EVENTS)
    }
    try {
      this.auditSink?.(event)
    } catch {
      // audit sink failure must not break terminal operations
    }
  }

  getAuditEvents(): readonly TerminalAuditEvent[] {
    return this.auditEvents
  }

  /**
   * Returns the terminal setting from current settings.
   * Thread-safe: the caller passes the settings snapshot.
   */
  isEnabled(settings: Pick<AppSettingsV1, 'agents'>): boolean {
    return settings.agents?.kun?.terminal?.enabled !== false
  }

  /**
   * Spawn a new PTY session in the given working directory.
   * Returns the session ID. The caller should set up output/exit listeners
   * via the returned pty object.
   */
  spawn(cwd: string, cols = 80, rows = 24): { id: string; pty: IPty } {
    const id = `term_${randomUUID().slice(0, 12)}`
    const safeCwd = cwd || process.cwd()

    const pty = nodePtySpawn(this.shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: safeCwd,
      env: { ...process.env } as Record<string, string>
    }) as IPty

    this.sessions.set(id, {
      id,
      pty,
      cwd: safeCwd,
      createdAt: Date.now(),
      cols,
      rows
    })

    pty.onExit(({ exitCode, signal }) => {
      this.sessions.delete(id)
      this.emitAudit({
        id: `audit_${randomUUID().slice(0, 8)}`,
        kind: 'session_exited',
        sessionId: id,
        cwd: safeCwd,
        timestamp: new Date().toISOString(),
        detail: `exit_code=${exitCode} signal=${signal ?? 'none'}`
      })
    })

    this.emitAudit({
      id: `audit_${randomUUID().slice(0, 8)}`,
      kind: 'session_spawned',
      sessionId: id,
      cwd: safeCwd,
      timestamp: new Date().toISOString(),
      detail: `shell=${this.shell} cols=${cols} rows=${rows}`
    })

    return { id, pty }
  }

  list(): TerminalSessionInfo[] {
    const result: TerminalSessionInfo[] = []
    for (const [id, session] of this.sessions) {
      result.push({
        id,
        cwd: session.cwd,
        createdAt: session.createdAt,
        cols: session.cols,
        rows: session.rows
      })
    }
    return result.sort((a, b) => a.createdAt - b.createdAt)
  }

  write(id: string, data: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.pty.write(data)
    return true
  }

  resize(id: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.cols = cols
    session.rows = rows
    session.pty.resize(cols, rows)
    return true
  }

  kill(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    this.emitAudit({
      id: `audit_${randomUUID().slice(0, 8)}`,
      kind: 'session_killed',
      sessionId: id,
      cwd: session.cwd,
      timestamp: new Date().toISOString()
    })
    session.pty.kill()
    this.sessions.delete(id)
    return true
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.kill(id)
    }
  }

  /**
   * Record an observed agent command execution. Unlike user PTY sessions,
   * agent commands run inside the Kun runtime sandbox and their output
   * is rendered in the agent-activity UI tab. This audit event records
   * that output was observed without granting the agent access to user PTYs.
   */
  agentExecObserved(input: {
    toolName?: string
    toolKind?: string
    summary?: string
    outputTruncated?: string
    exitCode?: number
    threadId?: string
    detail?: string
  }): void {
    this.emitAudit({
      id: `audit_${randomUUID().slice(0, 8)}`,
      kind: 'agent_exec_observed',
      timestamp: new Date().toISOString(),
      detail: input.detail,
      agentToolName: input.toolName,
      agentToolKind: input.toolKind,
      agentSummary: input.summary,
      agentOutputTruncated: input.outputTruncated,
      agentExitCode: input.exitCode,
      agentThreadId: input.threadId
    })
  }

  sessionCount(): number {
    return this.sessions.size
  }
}

let sharedTerminalService: TerminalService | null = null

export function getTerminalService(): TerminalService {
  if (!sharedTerminalService) {
    sharedTerminalService = new TerminalService()
  }
  return sharedTerminalService
}

export function resetTerminalService(): void {
  if (sharedTerminalService) {
    sharedTerminalService.killAll()
    sharedTerminalService = null
  }
}
