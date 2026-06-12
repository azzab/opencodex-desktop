/**
 * SSH Connector Service — outbound-only SSH connections for remote runners.
 * Uses `ssh2` for the protocol layer; all auth references never store raw secrets.
 * No listening sockets, outbound only.
 */

import { randomUUID } from 'node:crypto'
import type {
  RemoteSshHostConfig,
  RemoteRunnerCapabilityHandshake,
  RemoteRunnerShell,
  RemoteRunnerGitCapabilities,
  RemoteRunnerToolPolicy,
  RemoteRunnerDataPolicy,
  RemoteRunnerBudgetPolicy,
  RemoteRunnerApprovalPolicy,
  RemoteRunnerAuditPolicy,
  RemoteRunnerModelAvailability
} from '../../shared/remote-runner-protocol'
import {
  REMOTE_RUNNER_PROTOCOL_VERSION
} from '../../shared/remote-runner-protocol'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SshConnectorState = 'disconnected' | 'connecting' | 'handshaking' | 'connected' | 'error'

export type SshConnectorEvent =
  | { kind: 'state'; state: SshConnectorState; error?: string }
  | { kind: 'output'; runId: string; stream: 'stdout' | 'stderr'; data: string }
  | { kind: 'exit'; runId: string; exitCode: number | null; signal: string | null }

export type SshConnectorEventListener = (event: SshConnectorEvent) => void

export interface SshConnector {
  /** Unique id for this connector instance. */
  readonly id: string
  /** Human-readable label. */
  readonly label: string
  /** Current connection state. */
  readonly state: SshConnectorState
  /** The SSH host config reference (never contains raw secrets). */
  readonly config: RemoteSshHostConfig
  /** Last completed capability handshake, or null. */
  readonly lastHandshake: RemoteRunnerCapabilityHandshake | null
  /** Last error message, if any. */
  readonly lastError: string | null

  /** Start outbound SSH connection. */
  connect(): Promise<void>
  /** Disconnect and clean up. */
  disconnect(): Promise<void>
  /** Perform capability handshake after connection. */
  handshake(): Promise<RemoteRunnerCapabilityHandshake>
  /** Execute a command on the remote host. Returns run id. */
  exec(command: string, opts?: SshExecOptions): Promise<string>
  /** Send signal to a running remote process. */
  signal(runId: string, signal: string): void
  /** Write to stdin of a running remote process. */
  writeStdin(runId: string, data: string): void
  /** Register an event listener. Returns unsubscribe function. */
  onEvent(listener: SshConnectorEventListener): () => void
}

export interface SshExecOptions {
  /** Remote working directory. Must be in a trusted path. */
  cwd?: string
  /** Environment variables to set. */
  env?: Record<string, string>
  /** Timeout in ms. 0 = no timeout (default). */
  timeoutMs?: number
  /** Max stdout bytes to capture. */
  maxOutputBytes?: number
}

export interface SshConnectorFactory {
  create(config: RemoteSshHostConfig): SshConnector
}

/* ------------------------------------------------------------------ */
/*  Mock (in-memory) connector for testing                             */
/* ------------------------------------------------------------------ */

export class MockSshConnector implements SshConnector {
  readonly id: string
  readonly label: string
  state: SshConnectorState = 'disconnected'
  readonly lastHandshake: RemoteRunnerCapabilityHandshake | null = null
  lastError: string | null = null
  private listeners: Set<SshConnectorEventListener> = new Set()
  private runs: Map<string, MockRun> = new Map()
  private _mockHandshake: () => RemoteRunnerCapabilityHandshake
  private _mockExec: (command: string, opts?: SshExecOptions) => { exitCode: number; stdout: string; stderr: string }
  private _connectDelayMs: number
  private _handshakeDelayMs: number
  private _execDelayMs: number

  constructor(
    public readonly config: RemoteSshHostConfig,
    opts?: {
      mockHandshake?: () => RemoteRunnerCapabilityHandshake
      mockExec?: (command: string, opts?: SshExecOptions) => { exitCode: number; stdout: string; stderr: string }
      connectDelayMs?: number
      handshakeDelayMs?: number
      execDelayMs?: number
    }
  ) {
    this.id = config.id
    this.label = config.label
    this._connectDelayMs = opts?.connectDelayMs ?? 0
    this._handshakeDelayMs = opts?.handshakeDelayMs ?? 0
    this._execDelayMs = opts?.execDelayMs ?? 0
    this._mockHandshake = opts?.mockHandshake ?? defaultMockHandshake
    this._mockExec = opts?.mockExec ?? defaultMockExec
  }

  async connect(): Promise<void> {
    this.setState('connecting')
    if (this._connectDelayMs > 0) await delay(this._connectDelayMs)
    this.setState('connected')
  }

  async disconnect(): Promise<void> {
    this.setState('disconnected')
    this.runs.clear()
  }

  async handshake(): Promise<RemoteRunnerCapabilityHandshake> {
    this.setState('handshaking')
    if (this._handshakeDelayMs > 0) await delay(this._handshakeDelayMs)
    try {
      const handshake = this._mockHandshake();
      (this as { lastHandshake: RemoteRunnerCapabilityHandshake | null }).lastHandshake = handshake
      this.setState('connected')
      return handshake
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.lastError = message
      this.setState('error', message)
      throw err
    }
  }

  async exec(command: string, opts?: SshExecOptions): Promise<string> {
    const runId = `run_${randomUUID()}`
    if (this._execDelayMs > 0) await delay(this._execDelayMs)
    const result = this._mockExec(command, opts)
    const run: MockRun = {
      id: runId,
      command,
      cwd: opts?.cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      state: 'running'
    }
    this.runs.set(runId, run)
    if (result.stdout) {
      this.emit({ kind: 'output', runId, stream: 'stdout', data: result.stdout })
    }
    if (result.stderr) {
      this.emit({ kind: 'output', runId, stream: 'stderr', data: result.stderr })
    }
    run.state = 'exited'
    this.emit({ kind: 'exit', runId, exitCode: result.exitCode, signal: null })
    return runId
  }

  signal(runId: string, signal: string): void {
    const run = this.runs.get(runId)
    if (run) {
      run.state = 'exited'
      run.exitCode = -1
      this.emit({ kind: 'exit', runId, exitCode: -1, signal })
    }
  }

  writeStdin(_runId: string, _data: string): void {
    // Mock: stdin is accepted but not processed
  }

  onEvent(listener: SshConnectorEventListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private setState(state: SshConnectorState, error?: string): void {
    this.state = state
    if (error) this.lastError = error
    this.emit({ kind: 'state', state, error })
  }

  private emit(event: SshConnectorEvent): void {
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* swallow listener errors */ }
    }
  }
}

interface MockRun {
  id: string
  command: string
  cwd?: string
  exitCode: number | null
  stdout: string
  stderr: string
  state: 'running' | 'exited'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultMockHandshake(): RemoteRunnerCapabilityHandshake {
  return {
    id: 'runner_mock',
    protocolVersion: REMOTE_RUNNER_PROTOCOL_VERSION,
    type: 'ssh-host',
    label: 'Mock SSH runner',
    status: 'available',
    issuedAt: new Date().toISOString(),
    shell: {
      os: 'linux',
      shell: 'bash',
      commandSyntax: 'posix'
    },
    git: {
      available: true,
      worktrees: true,
      partialClone: true,
      lfs: false
    },
    browser: {
      support: 'none',
      evidence: 'unavailable'
    },
    allowedRoots: [],
    toolPolicy: {
      terminal: 'consent_required',
      filesystem: 'consent_required',
      git: 'consent_required',
      browser: 'unavailable',
      artifacts: 'metadata_only'
    },
    dataPolicy: {
      defaultAllowed: ['thread_metadata', 'redacted_progress', 'approval_metadata', 'audit_metadata'],
      consentRequired: ['selected_file_excerpt', 'diff_excerpt', 'terminal_excerpt'],
      never: ['api_keys', 'oauth_tokens', 'mcp_credentials', 'env_values']
    },
    budget: {
      maxRunSeconds: 900,
      maxInputTokens: 200000,
      maxOutputTokens: 60000,
      maxCostUsd: 3
    },
    approvals: {
      hostApprovalRequired: true,
      remoteMayLowerHostPolicy: false,
      perActionConsentRequired: true
    },
    audit: {
      required: true,
      emitRunIds: true,
      payloadRedaction: 'metadata'
    },
    models: [],
    credentialStorage: {
      kind: 'ssh-agent',
      credentialRef: 'ssh-agent:mock',
      exportsRawSecret: false
    }
  }
}

function defaultMockExec(_command: string, _opts?: SshExecOptions): { exitCode: number; stdout: string; stderr: string } {
  return { exitCode: 0, stdout: 'mock output', stderr: '' }
}

/* ------------------------------------------------------------------ */
/*  SSH2-based real connector (gated behind ssh2 availability)         */
/* ------------------------------------------------------------------ */

let Ssh2Client: unknown = null
let ssh2Available = false

try {
  Ssh2Client = require('ssh2').Client
  ssh2Available = true
} catch {
  // ssh2 is an optional native dependency — the mock connector is the default
  // and the real connector uses this only if ssh2 is installed.
}

export function isSsh2Available(): boolean {
  return ssh2Available
}

export interface Ssh2ConnectParams {
  host: string
  port: number
  username?: string
}

export class Ssh2Connector implements SshConnector {
  readonly id: string
  readonly label: string
  state: SshConnectorState = 'disconnected'
  lastHandshake: RemoteRunnerCapabilityHandshake | null = null
  lastError: string | null = null
  private listeners: Set<SshConnectorEventListener> = new Set()
  private client: unknown = null
  private activeRuns: Map<string, { stream: unknown; state: 'running' | 'exited'; command: string }> = new Map()
  private resolvedEndpoint: Ssh2ConnectParams | null = null

  constructor(public readonly config: RemoteSshHostConfig) {
    this.id = config.id
    this.label = config.label
  }

  /**
   * Set the resolved endpoint params before connecting.
   * Must be called before connect() so we never use the localhost:22 placeholder.
   */
  setEndpoint(params: Ssh2ConnectParams): void {
    this.resolvedEndpoint = params
  }

  async connect(): Promise<void> {
    if (!ssh2Available) {
      throw new Error('ssh2 native dependency is not available. Install ssh2 or use the mock connector for testing.')
    }
    if (!this.resolvedEndpoint) {
      throw new Error('SSH endpoint not resolved. Call setEndpoint() before connect().')
    }
    const { host, port, username } = this.resolvedEndpoint
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      // localhost is permitted only when explicitly resolved from endpointRef,
      // never as the default placeholder
    }

    this.setState('connecting')

    return new Promise<void>((resolve, reject) => {
      try {
        const Client = require('ssh2').Client
        const client = new Client()
        this.client = client

        client.on('ready', () => {
          this.setState('connected')
          resolve()
        })

        client.on('error', (err: Error) => {
          this.lastError = err.message
          this.setState('error', err.message)
          reject(err)
        })

        client.on('close', () => {
          if (this.state === 'connected') {
            this.setState('disconnected')
          }
        })

        // Connection config — host resolved from endpointRef at call time by the service layer.
        // Never contains raw secrets; auth through ssh-agent or key references only.
        const connectConfig: Record<string, unknown> = {
          host,
          port,
          readyTimeout: 30_000
        }
        if (username) {
          connectConfig.username = username
        }
        // agent auth: use the running ssh-agent (no key material in our process)
        if (process.env.SSH_AUTH_SOCK) {
          connectConfig.agent = process.env.SSH_AUTH_SOCK
        }
        client.connect(connectConfig)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.lastError = message
        this.setState('error', message)
        reject(err)
      }
    })
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      const client = this.client as { end(): void }
      client.end()
      this.client = null
    }
    this.activeRuns.clear()
    this.setState('disconnected')
  }

  async handshake(): Promise<RemoteRunnerCapabilityHandshake> {
    if (this.state !== 'connected') {
      throw new Error('Cannot handshake: not connected')
    }
    this.setState('handshaking')

    try {
      const handshake = await this.collectCapabilities()
      this.lastHandshake = handshake
      this.setState('connected')
      return handshake
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.lastError = message
      this.setState('error', message)
      throw err
    }
  }

  private async collectCapabilities(): Promise<RemoteRunnerCapabilityHandshake> {
    const shell = await this.detectShell()
    const git = await this.detectGit()

    return {
      id: this.id,
      protocolVersion: REMOTE_RUNNER_PROTOCOL_VERSION,
      type: 'ssh-host',
      label: this.label,
      status: 'available',
      issuedAt: new Date().toISOString(),
      shell,
      git,
      browser: { support: 'none', evidence: 'unavailable' },
      allowedRoots: [],
      toolPolicy: {
        terminal: 'consent_required',
        filesystem: 'consent_required',
        git: git.available ? 'consent_required' : 'unavailable',
        browser: 'unavailable',
        artifacts: 'metadata_only'
      },
      dataPolicy: {
        defaultAllowed: ['thread_metadata', 'redacted_progress', 'approval_metadata', 'audit_metadata'],
        consentRequired: ['selected_file_excerpt', 'diff_excerpt', 'terminal_excerpt'],
        never: ['api_keys', 'oauth_tokens', 'mcp_credentials', 'env_values', 'browser_cookies']
      },
      budget: {
        maxRunSeconds: 900,
        maxInputTokens: 200000,
        maxOutputTokens: 60000,
        maxCostUsd: 3
      },
      approvals: {
        hostApprovalRequired: true,
        remoteMayLowerHostPolicy: false,
        perActionConsentRequired: true
      },
      audit: {
        required: true,
        emitRunIds: true,
        payloadRedaction: 'metadata'
      },
      models: [],
      credentialStorage: {
        kind: 'ssh-agent',
        credentialRef: `ssh-agent:${this.id}`,
        exportsRawSecret: false
      }
    }
  }

  private async detectShell(): Promise<RemoteRunnerShell> {
    if (this.client) {
      const client = this.client as { exec: (cmd: string, cb: (err: Error | null, stream: unknown) => void) => void }
      return new Promise<RemoteRunnerShell>((resolve, _reject) => {
        client.exec('uname -s && echo "SHELL:$SHELL"', (err, stream) => {
          if (err) {
            resolve({ os: 'unknown', shell: 'unknown', commandSyntax: 'unknown' })
            return
          }
          const s = stream as { on: (event: string, cb: (data: unknown) => void) => void; stderr: { on: (event: string, cb: (data: unknown) => void) => void } }
          let stdout = ''
          s.on('data', (data: unknown) => { stdout += String(data) })
          s.stderr.on('data', (_data: unknown) => {})
          s.on('close', () => {
            const lines = stdout.trim().split('\n')
            const osName = lines[0]?.toLowerCase() ?? 'unknown'
            const shellLine = lines.find((l) => l.startsWith('SHELL:'))
            const shell = shellLine ? shellLine.replace('SHELL:', '').trim() : 'sh'
            const os = osName.includes('linux') ? 'linux' as const
              : osName.includes('darwin') ? 'macos' as const
              : osName.includes('mingw') || osName.includes('msys') ? 'windows' as const
              : 'unknown' as const
            resolve({ os, shell, commandSyntax: os === 'windows' ? 'powershell' : 'posix' })
          })
        })
      })
    }
    return { os: 'unknown', shell: 'unknown', commandSyntax: 'unknown' }
  }

  private async detectGit(): Promise<RemoteRunnerGitCapabilities> {
    if (this.client) {
      const client = this.client as { exec: (cmd: string, cb: (err: Error | null, stream: unknown) => void) => void }
      return new Promise<RemoteRunnerGitCapabilities>((resolve) => {
        client.exec('git --version 2>&1; git worktree list 2>&1; git config --get remote.origin.partialclonefilter 2>&1; git lfs version 2>&1', (err, stream) => {
          if (err) {
            resolve({ available: false, worktrees: false, partialClone: false, lfs: false })
            return
          }
          const s = stream as { on: (event: string, cb: (data: unknown) => void) => void; stderr: { on: (event: string, cb: (data: unknown) => void) => void } }
          let stdout = ''
          s.on('data', (data: unknown) => { stdout += String(data) })
          s.stderr.on('data', (_data: unknown) => {})
          s.on('close', () => {
            const hasGit = stdout.includes('git version')
            const hasWorktrees = stdout.includes('worktree')
            const hasPartialClone = stdout.includes('blob') || stdout.includes('tree')
            const hasLfs = stdout.includes('git-lfs')
            resolve({
              available: hasGit,
              worktrees: hasWorktrees,
              partialClone: hasPartialClone,
              lfs: hasLfs
            })
          })
        })
      })
    }
    return { available: false, worktrees: false, partialClone: false, lfs: false }
  }

  async exec(command: string, opts?: SshExecOptions): Promise<string> {
    if (this.state !== 'connected') {
      throw new Error('Cannot exec: not connected')
    }
    if (!this.client) {
      throw new Error('No SSH client')
    }

    const runId = `run_${randomUUID()}`
    const client = this.client as { exec: (cmd: string, options: Record<string, unknown>, cb: (err: Error | null, stream: unknown) => void) => void }

    return new Promise<string>((resolve, reject) => {
      const execCmd = opts?.cwd ? `cd "${opts.cwd}" && ${command}` : command
      client.exec(execCmd, {}, (err, stream) => {
        if (err) {
          reject(err)
          return
        }
        const s = stream as {
          on: (event: string, cb: (...args: unknown[]) => void) => void
          write: (data: string) => void
          end: () => void
          stderr: { on: (event: string, cb: (data: unknown) => void) => void }
        }
        this.activeRuns.set(runId, { stream: s, state: 'running', command: execCmd })

        let totalStdout = 0
        const maxBytes = opts?.maxOutputBytes ?? 1_000_000

        s.on('data', (data: unknown) => {
          const str = String(data)
          totalStdout += Buffer.byteLength(str, 'utf8')
          if (totalStdout <= maxBytes) {
            this.emit({ kind: 'output', runId, stream: 'stdout', data: str })
          }
        })

        s.stderr.on('data', (data: unknown) => {
          this.emit({ kind: 'output', runId, stream: 'stderr', data: String(data) })
        })

        s.on('close', (code: unknown, signal: unknown) => {
          const exitCode = typeof code === 'number' ? code : null
          const exitSignal = typeof signal === 'string' ? signal : null
          const run = this.activeRuns.get(runId)
          if (run) run.state = 'exited'
          this.emit({ kind: 'exit', runId, exitCode, signal: exitSignal })
          resolve(runId)
        })

        if (opts?.timeoutMs && opts.timeoutMs > 0) {
          setTimeout(() => {
            const run = this.activeRuns.get(runId)
            if (run && run.state === 'running') {
              this.signal(runId, 'SIGTERM')
            }
          }, opts.timeoutMs)
        }

        s.end()
      })
    })
  }

  signal(runId: string, signal: string): void {
    const run = this.activeRuns.get(runId)
    if (run) {
      try {
        const s = run.stream as { signal: (sig: string) => void }
        s.signal(signal)
      } catch {
        // best effort
      }
    }
  }

  writeStdin(runId: string, data: string): void {
    const run = this.activeRuns.get(runId)
    if (run) {
      try {
        const s = run.stream as { write: (data: string) => void }
        s.write(data)
      } catch {
        // best effort
      }
    }
  }

  onEvent(listener: SshConnectorEventListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private setState(state: SshConnectorState, error?: string): void {
    this.state = state
    if (error) this.lastError = error
    this.emit({ kind: 'state', state, error })
  }

  private emit(event: SshConnectorEvent): void {
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* swallow */ }
    }
  }
}
