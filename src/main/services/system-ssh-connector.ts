/**
 * System SSH Connector — uses the system `ssh` CLI as a subprocess fallback
 * when the `ssh2` native dependency is unavailable or cannot be compiled.
 *
 * Key properties:
 * - Outbound only, no listening sockets.
 * - Never reads, decrypts, or stores raw key material.  Key paths are
 *   passed as `-i` arguments to the system `ssh` command, which handles
 *   key loading natively inside its own process.
 * - Naturally inherits ~/.ssh/config resolution (HostName, User, Port,
 *   IdentityFile, ProxyJump, etc.) from the system SSH client.
 * - Supports both ssh-agent (via SSH_AUTH_SOCK) and explicit IdentityFile
 *   references resolved from ~/.ssh/config or host config keyPathRef.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { platform } from 'node:os'
import type {
  RemoteRunnerCapabilityHandshake,
  RemoteRunnerShell,
  RemoteRunnerGitCapabilities,
  RemoteSshHostConfig
} from '../../shared/remote-runner-protocol'
import { REMOTE_RUNNER_PROTOCOL_VERSION } from '../../shared/remote-runner-protocol'
import type {
  SshConnector,
  SshConnectorEvent,
  SshConnectorEventListener,
  SshExecOptions
} from './ssh-connector-service'
import type { ResolvedSshEndpoint } from './ssh-endpoint-resolver'

/* ------------------------------------------------------------------ */
/*  Availability check                                                 */
/* ------------------------------------------------------------------ */

let _systemSshAvailable: boolean | null = null

/** Check whether the system `ssh` command is available on PATH. */
export function isSystemSshAvailable(): boolean {
  if (_systemSshAvailable !== null) return _systemSshAvailable
  try {
    const result = require('node:child_process').spawnSync(
      platform() === 'win32' ? 'where' : 'which',
      ['ssh'],
      { timeout: 5000, stdio: 'pipe' }
    )
    _systemSshAvailable = result.status === 0 && result.stdout.length > 0
  } catch {
    _systemSshAvailable = false
  }
  return _systemSshAvailable
}

/** Reset the cached availability check (for testing). */
export function resetSystemSshAvailableCache(): void {
  _systemSshAvailable = null
}

/* ------------------------------------------------------------------ */
/*  System SSH connector                                               */
/* ------------------------------------------------------------------ */

export class SystemSshConnector implements SshConnector {
  readonly id: string
  readonly label: string
  state: SshConnector['state'] = 'disconnected'
  lastHandshake: RemoteRunnerCapabilityHandshake | null = null
  lastError: string | null = null
  private listeners: Set<SshConnectorEventListener> = new Set()
  private resolvedEndpoint: ResolvedSshEndpoint | null = null
  private activeRuns: Map<string, { process: ChildProcess; state: 'running' | 'exited' }> = new Map()

  constructor(public readonly config: RemoteSshHostConfig) {
    this.id = config.id
    this.label = config.label
  }

  /**
   * Set the resolved endpoint from host config resolution.
   * Must be called before connect().
   */
  setEndpoint(endpoint: ResolvedSshEndpoint): void {
    this.resolvedEndpoint = endpoint
  }

  /** Build the ssh CLI argument array from the resolved endpoint. */
  private buildSshArgs(extraArgs: string[] = []): string[] {
    if (!this.resolvedEndpoint) {
      throw new Error('SSH endpoint not resolved. Call setEndpoint() before connecting.')
    }
    const ep = this.resolvedEndpoint
    const args: string[] = []

    // Identity file references — pass as -i arguments.
    // The system ssh client loads key material natively; our process
    // never touches raw key bytes.
    if (ep.keyPathRef) {
      args.push('-i', ep.keyPathRef)
    }
    if (ep.identityFileRefs && ep.identityFileRefs.length > 0) {
      for (const ref of ep.identityFileRefs) {
        args.push('-i', ref)
      }
    }

    // Batch mode: never prompt for passwords
    args.push('-o', 'BatchMode=yes')

    // Connection timeout
    args.push('-o', `ConnectTimeout=15`)

    // Disable pseudo-terminal for non-interactive commands
    if (extraArgs.length === 0) {
      // For connectivity test, just use -T
      args.push('-T')
    }

    // Port
    if (ep.port !== 22) {
      args.push('-p', String(ep.port))
    }

    // Destination
    const dest = ep.username ? `${ep.username}@${ep.host}` : ep.host
    args.push(dest)

    // Extra args (the remote command, if any)
    args.push(...extraArgs)

    return args
  }

  /** Run an SSH subprocess and collect its output. */
  private runSsh(args: string[], opts?: { timeoutMs?: number; maxOutputBytes?: number }): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('ssh', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: opts?.timeoutMs ?? 30_000
      })

      let stdout = ''
      let stderr = ''
      const maxBytes = opts?.maxOutputBytes ?? 1_000_000

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString('utf8')
        if (stdout.length < maxBytes) {
          stdout += chunk
        }
      })

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })

      child.on('error', (err: Error) => {
        reject(new Error(`Failed to spawn ssh: ${err.message}`))
      })

      child.on('close', (code: number | null) => {
        resolve({ exitCode: code, stdout, stderr })
      })
    })
  }

  async connect(): Promise<void> {
    if (!this.resolvedEndpoint) {
      throw new Error('SSH endpoint not resolved. Call setEndpoint() before connect().')
    }

    this.setState('connecting')

    try {
      // Test connectivity with a simple echo
      const args = this.buildSshArgs(['echo', 'ok'])
      const result = await this.runSsh(args, { timeoutMs: 20_000 })

      if (result.exitCode !== 0) {
        const msg = result.stderr.trim() || `SSH exited with code ${result.exitCode}`
        this.lastError = msg
        this.setState('error', msg)
        throw new Error(`SSH connection failed: ${msg}`)
      }

      if (!result.stdout.includes('ok')) {
        const msg = 'SSH connectivity test returned unexpected output'
        this.lastError = msg
        this.setState('error', msg)
        throw new Error(msg)
      }

      this.setState('connected')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.lastError = message
      this.setState('error', message)
      throw err
    }
  }

  async disconnect(): Promise<void> {
    // Kill any active runs
    for (const [, run] of this.activeRuns) {
      try { run.process.kill('SIGTERM') } catch { /* best effort */ }
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
    // Batch capability detection in a single SSH invocation
    const script = [
      'echo "OS:$(uname -s)"',
      'echo "SHELL:$SHELL"',
      'git --version 2>&1 || echo "GIT:none"',
      'git worktree list 2>&1 || echo "WT:none"',
      'git config --get remote.origin.partialclonefilter 2>&1 || echo "PC:none"',
      'git lfs version 2>&1 || echo "LFS:none"'
    ].join('; ')

    const args = this.buildSshArgs([script])
    const result = await this.runSsh(args, { timeoutMs: 15_000 })

    if (result.exitCode !== 0) {
      throw new Error(`Capability handshake failed: ${result.stderr.trim() || `exit ${result.exitCode}`}`)
    }

    const output = result.stdout
    const lines = output.split('\n').map((l) => l.trim()).filter(Boolean)

    const osLine = lines.find((l) => l.startsWith('OS:'))
    const shellLine = lines.find((l) => l.startsWith('SHELL:'))
    const gitLine = lines.find((l) => l.startsWith('git version'))
    const wtLine = lines.find((l) => l.includes('worktree'))
    const pcLine = lines.find((l) => l.startsWith('PC:'))
    const lfsLine = lines.find((l) => l.startsWith('git-lfs'))

    const osName = osLine?.replace('OS:', '').trim().toLowerCase() ?? 'unknown'
    const os = osName.includes('linux') ? 'linux' as const
      : osName.includes('darwin') ? 'macos' as const
      : osName.includes('mingw') || osName.includes('msys') ? 'windows' as const
      : 'unknown' as const

    const shell: RemoteRunnerShell = {
      os,
      shell: shellLine?.replace('SHELL:', '').trim() || 'sh',
      commandSyntax: os === 'windows' ? 'powershell' : 'posix'
    }

    const git: RemoteRunnerGitCapabilities = {
      available: !!gitLine && !output.includes('GIT:none'),
      worktrees: !!wtLine && !output.includes('WT:none'),
      partialClone: !!pcLine && pcLine !== 'PC:none',
      lfs: !!lfsLine && !output.includes('LFS:none')
    }

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
        credentialRef: `system-ssh:${this.id}`,
        exportsRawSecret: false
      }
    }
  }

  async exec(command: string, opts?: SshExecOptions): Promise<string> {
    if (this.state !== 'connected') {
      throw new Error('Cannot exec: not connected')
    }

    const runId = `run_${randomUUID()}`
    const execCmd = opts?.cwd ? `cd "${opts.cwd}" && ${command}` : command
    const args = this.buildSshArgs([execCmd])

    // spawn can throw synchronously (command not found, etc.); the async
    // function wrapper converts it to a rejected Promise naturally.
    const child = spawn('ssh', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: opts?.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : undefined
    })

    // Register the active run BEFORE returning so the service can
    // record activeRunId while the process is still running.
    this.activeRuns.set(runId, { process: child, state: 'running' })

    let totalStdout = 0
    const maxBytes = opts?.maxOutputBytes ?? 1_000_000

    child.stdout?.on('data', (data: Buffer) => {
      const str = data.toString('utf8')
      totalStdout += Buffer.byteLength(str, 'utf8')
      if (totalStdout <= maxBytes) {
        this.emit({ kind: 'output', runId, stream: 'stdout', data: str })
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      this.emit({ kind: 'output', runId, stream: 'stderr', data: data.toString('utf8') })
    })

    child.on('error', (err: Error) => {
      const run = this.activeRuns.get(runId)
      if (run) run.state = 'exited'
      // The process errored; emit exit with failure code so the service
      // cleans up the handle state.
      this.emit({ kind: 'exit', runId, exitCode: -1, signal: null })
    })

    child.on('close', (code: number | null, signal: string | null) => {
      const run = this.activeRuns.get(runId)
      if (run) run.state = 'exited'
      this.emit({ kind: 'exit', runId, exitCode: code, signal })
    })

    // Close stdin immediately (we don't stream input by default)
    child.stdin?.end()

    // Return the runId immediately — the process is now running and will
    // produce output/exit events asynchronously.
    return runId
  }

  signal(runId: string, signal: string): void {
    const run = this.activeRuns.get(runId)
    if (run && run.state === 'running') {
      try {
        run.process.kill(signal as NodeJS.Signals)
      } catch {
        // best effort
      }
    }
  }

  writeStdin(runId: string, data: string): void {
    const run = this.activeRuns.get(runId)
    if (run && run.state === 'running') {
      try {
        run.process.stdin?.write(data)
      } catch {
        // best effort
      }
    }
  }

  onEvent(listener: SshConnectorEventListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private setState(state: SshConnector['state'], error?: string): void {
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
