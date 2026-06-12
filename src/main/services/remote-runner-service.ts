/**
 * Remote Runner Service — orchestrates SSH connectors, trust management,
 * remote command execution with approval/budget/audit semantics, and
 * data egress policy enforcement.
 *
 * Every remote command must:
 * 1. Have a trusted workspace path (per host+path)
 * 2. Pass host approval policy (REMOTE-labeled)
 * 3. Be within budget limits
 * 4. Emit audit events
 * 5. Comply with data egress policy
 */

import { randomUUID } from 'node:crypto'
import type {
  RemoteRunnerHostConfigV1,
  RemoteRunnerTrustedPathV1,
  RemoteRunnerAuditEntryV1,
  RemoteRunnerSettingsV1
} from '../../shared/app-settings-types'
import type { RemoteSshHostConfig, RemoteRunnerCapabilityHandshake } from '../../shared/remote-runner-protocol'
import { redactRemoteRunnerConfig } from '../../shared/remote-runner-protocol'
import {
  type SshConnector,
  type SshConnectorEvent,
  type SshExecOptions,
  MockSshConnector,
  Ssh2Connector,
  isSsh2Available,
  type Ssh2ConnectParams
} from './ssh-connector-service'
import {
  resolveHostEndpoint,
  clearSshConfigCache
} from './ssh-endpoint-resolver'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RemoteRunnerStatus = 'idle' | 'connecting' | 'handshaking' | 'connected' | 'executing' | 'paused' | 'error'

export interface RemoteRunnerHandle {
  id: string
  label: string
  status: RemoteRunnerStatus
  hostConfig: RemoteRunnerHostConfigV1
  lastHandshake: RemoteRunnerCapabilityHandshake | null
  lastError: string | null
  trustedPaths: RemoteRunnerTrustedPathV1[]
  /** Pending approval requests. */
  pendingApprovals: Set<string>
  /** Current run id if executing. */
  activeRunId: string | null
}

export interface RemoteExecResult {
  runId: string
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  truncated: boolean
}

export interface RemoteApprovalRequest {
  approvalId: string
  runnerId: string
  hostLabel: string
  command: string
  cwd: string
  requestedAt: string
  /** Approval must be explicitly labeled REMOTE. */
  requireRemoteLabel: boolean
}

export type RemoteApprovalDecision = 'allow' | 'deny'

export interface RemoteRunnerAuditCallback {
  (entry: RemoteRunnerAuditEntryV1): void
}

export interface RemoteRunnerCallbacks {
  /** Called when a remote command needs approval. The callback resolves with the decision. */
  onApprovalRequired: (request: RemoteApprovalRequest) => Promise<RemoteApprovalDecision>
  /** Called for every audit event. */
  onAudit: RemoteRunnerAuditCallback
  /** Called when data egress policy would be violated. */
  onEgressPolicyViolation: (runnerId: string, dataClass: string, detail: string) => void
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export class RemoteRunnerService {
  private connectors: Map<string, SshConnector> = new Map()
  private handles: Map<string, RemoteRunnerHandle> = new Map()
  private settings: RemoteRunnerSettingsV1
  private callbacks: RemoteRunnerCallbacks | null = null
  private activeRuns: Map<string, { runnerId: string; command: string; cwd?: string; output: string; exitCode: number | null; signal: string | null }> = new Map()
  private pausedRuns: Map<string, { runnerId: string; command: string; cwd?: string }> = new Map()
  private connectorUnsubscribers: Map<string, () => void> = new Map()

  constructor(settings: RemoteRunnerSettingsV1, callbacks?: RemoteRunnerCallbacks) {
    this.settings = settings
    this.callbacks = callbacks ?? null
  }

  /* ---- Lifecycle ---- */

  updateSettings(settings: RemoteRunnerSettingsV1): void {
    this.settings = settings
  }

  setCallbacks(callbacks: RemoteRunnerCallbacks): void {
    this.callbacks = callbacks
  }

  async shutdown(): Promise<void> {
    for (const [id, connector] of this.connectors) {
      try { await connector.disconnect() } catch { /* best effort */ }
      this.updateHandleStatus(id, 'idle')
    }
    this.connectors.clear()
    this.handles.clear()
    this.connectorUnsubscribers.forEach((unsub) => unsub())
    this.connectorUnsubscribers.clear()
  }

  /* ---- Host management ---- */

  registerHost(hostConfig: RemoteRunnerHostConfigV1): RemoteRunnerHandle {
    const existing = this.handles.get(hostConfig.id)
    if (existing) {
      // Update from settings but preserve runtime state (trustedPaths set via
      // trustPath / revokeTrustPath, pending approvals, active run, handshake).
      // This prevents remote-runner:exec from wiping trusted paths that were
      // added or removed after initial registration.
      // Always preserve the live trustedPaths because trustPath/revokeTrustPath
      // operations mutate the handle directly and must survive re-registration.
      const updatedHandle: RemoteRunnerHandle = {
        ...existing,
        label: hostConfig.label,
        hostConfig: {
          ...hostConfig,
          trustedPaths: existing.trustedPaths
        },
        lastError: hostConfig.lastHandshakeError ?? existing.lastError,
        trustedPaths: existing.trustedPaths
      }
      this.handles.set(hostConfig.id, updatedHandle)
      return updatedHandle
    }
    const handle: RemoteRunnerHandle = {
      id: hostConfig.id,
      label: hostConfig.label,
      status: 'idle',
      hostConfig,
      lastHandshake: null,
      lastError: hostConfig.lastHandshakeError ?? null,
      trustedPaths: hostConfig.trustedPaths,
      pendingApprovals: new Set(),
      activeRunId: null
    }
    this.handles.set(hostConfig.id, handle)
    return handle
  }

  unregisterHost(hostId: string): void {
    this.disconnectHost(hostId).catch(() => {})
    this.handles.delete(hostId)
    this.connectors.delete(hostId)
    const unsub = this.connectorUnsubscribers.get(hostId)
    if (unsub) {
      unsub()
      this.connectorUnsubscribers.delete(hostId)
    }
  }

  getHandle(hostId: string): RemoteRunnerHandle | undefined {
    return this.handles.get(hostId)
  }

  getAllHandles(): RemoteRunnerHandle[] {
    return [...this.handles.values()]
  }

  /* ---- Connection ---- */

  async connectHost(hostId: string): Promise<void> {
    const handle = this.handles.get(hostId)
    if (!handle) throw new Error(`Host not registered: ${hostId}`)

    this.updateHandleStatus(hostId, 'connecting')

    const sshConfig = this.hostConfigToSshConfig(handle.hostConfig)
    const connector = isSsh2Available()
      ? new Ssh2Connector(sshConfig)
      : new MockSshConnector(sshConfig)

    // Resolve the endpoint from host config before connecting (real connectors only).
    // Mock connectors don't need endpoint resolution.
    if (connector instanceof Ssh2Connector) {
      const resolvedEndpoint = resolveHostEndpoint({
        endpointRef: handle.hostConfig.endpointRef,
        host: (handle.hostConfig as Record<string, unknown>).host as string | undefined,
        port: (handle.hostConfig as Record<string, unknown>).port as number | undefined,
        username: (handle.hostConfig as Record<string, unknown>).username as string | undefined,
        usernameRef: handle.hostConfig.usernameRef
      })
      connector.setEndpoint(resolvedEndpoint)
    }

    this.connectors.set(hostId, connector)

    const unsub = connector.onEvent((event: SshConnectorEvent) => {
      this.handleConnectorEvent(hostId, event)
    })
    this.connectorUnsubscribers.set(hostId, unsub)

    try {
      await connector.connect()
      this.audit(hostId, 'connect', 'completed')
      // Auto-handshake
      await this.handshakeHost(hostId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.updateHandleStatus(hostId, 'error', message)
      this.audit(hostId, 'connect', 'failed', message)
      throw err
    }
  }

  async disconnectHost(hostId: string): Promise<void> {
    const connector = this.connectors.get(hostId)
    if (connector) {
      try { await connector.disconnect() } catch { /* best effort */ }
      this.connectors.delete(hostId)
    }
    this.updateHandleStatus(hostId, 'idle')
    this.audit(hostId, 'disconnect', 'completed')
  }

  async handshakeHost(hostId: string): Promise<RemoteRunnerCapabilityHandshake> {
    const connector = this.connectors.get(hostId)
    if (!connector) throw new Error(`Not connected: ${hostId}`)

    this.updateHandleStatus(hostId, 'handshaking')

    try {
      const handshake = await connector.handshake()

      // Validate data egress policy
      this.validateDataPolicy(hostId, handshake.dataPolicy)

      // Update handle with handshake info
      const handle = this.handles.get(hostId)
      if (handle) {
        const handshakeSummary = {
          issuedAt: handshake.issuedAt,
          shell: { os: handshake.shell.os, shell: handshake.shell.shell },
          gitAvailable: handshake.git.available,
          toolPolicy: {
            terminal: handshake.toolPolicy.terminal,
            filesystem: handshake.toolPolicy.filesystem,
            git: handshake.toolPolicy.git,
            browser: handshake.toolPolicy.browser,
            artifacts: handshake.toolPolicy.artifacts
          }
        }
        const updatedHostConfig: RemoteRunnerHostConfigV1 = {
          ...handle.hostConfig,
          lastHandshake: handshakeSummary,
          connectionStatus: 'connected'
        }
        this.handles.set(hostId, {
          ...handle,
          hostConfig: updatedHostConfig,
          status: 'connected',
          lastHandshake: handshake,
          lastError: null
        })
      }

      this.updateHandleStatus(hostId, 'connected')
      this.audit(hostId, 'handshake', 'completed')
      return handshake
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.updateHandleStatus(hostId, 'error', message)
      this.audit(hostId, 'handshake', 'failed', message)
      throw err
    }
  }

  /* ---- Trust management ---- */

  trustPath(hostId: string, path: string, label: string): RemoteRunnerTrustedPathV1 {
    const handle = this.handles.get(hostId)
    if (!handle) throw new Error(`Host not registered: ${hostId}`)

    const auditId = `audit_${randomUUID()}`
    const trustedPath: RemoteRunnerTrustedPathV1 = {
      path,
      label,
      trustedAt: new Date().toISOString(),
      auditId
    }

    const updatedTrustedPaths = [...handle.trustedPaths.filter((tp) => tp.path !== path), trustedPath]
    this.handles.set(hostId, {
      ...handle,
      trustedPaths: updatedTrustedPaths
    })

    this.audit(hostId, 'trust-path', 'allowed', `Trusted ${path} as "${label}"`, auditId)
    return trustedPath
  }

  revokeTrustPath(hostId: string, path: string): void {
    const handle = this.handles.get(hostId)
    if (!handle) throw new Error(`Host not registered: ${hostId}`)

    this.handles.set(hostId, {
      ...handle,
      trustedPaths: handle.trustedPaths.filter((tp) => tp.path !== path)
    })

    this.audit(hostId, 'revoke-trust-path', 'completed', `Revoked trust for ${path}`)
  }

  isPathTrusted(hostId: string, path: string): boolean {
    const handle = this.handles.get(hostId)
    if (!handle) return false
    return handle.trustedPaths.some((tp) => {
      const trusted = tp.path.replace(/\/+$/, '')
      const target = path.replace(/\/+$/, '')
      return target === trusted || target.startsWith(trusted + '/')
    })
  }

  /* ---- Remote execution (public API for IPC layer) ---- */

  /**
   * Execute a command on a remote host with full policy enforcement:
   * 1. Trusted path check
   * 2. REMOTE-labeled approval
   * 3. Data egress policy check
   * 4. Budget/timeout enforcement
   * 5. Audit with host identity
   * 6. Output capture via stream events
   */
  async execCommand(
    hostId: string,
    command: string,
    opts?: SshExecOptions & { timeoutMs?: number; maxOutputBytes?: number }
  ): Promise<string> {
    const handle = this.handles.get(hostId)
    if (!handle) throw new Error(`Host not registered: ${hostId}`)

    const connector = this.connectors.get(hostId)
    if (!connector || connector.state !== 'connected') {
      throw new Error(`Not connected to host: ${hostId}`)
    }

    // Check workspace trust
    const cwd = opts?.cwd ?? '.'
    if (!this.isPathTrusted(hostId, cwd)) {
      this.audit(hostId, 'exec-blocked', 'blocked', `Path not trusted: ${cwd}`)
      throw new Error(`Path not trusted: ${cwd}. Trust the path before executing remote commands.`)
    }

    // Data egress policy check
    const handshake = connector.lastHandshake
    if (handshake) {
      this.enforceDataEgress(hostId, handshake.dataPolicy, command)
    }

    // Budget/timeout enforcement from handshake
    const effectiveTimeoutMs = opts?.timeoutMs
      ?? (handshake?.budget.maxRunSeconds ? handshake.budget.maxRunSeconds * 1000 : 900_000)

    // Approval check — must be REMOTE-labeled
    // Fail closed: if no valid explicit approval callback is available, deny before any remote command starts.
    const approvalCallback = this.callbacks?.onApprovalRequired
    if (typeof approvalCallback !== 'function') {
      this.audit(hostId, 'exec-denied', 'denied', 'Remote execution denied: no approval callback configured for this host.')
      throw new Error('Remote execution denied: no approval callback is configured. A visible approval surface is required for remote commands.')
    }

    const approvalRequest: RemoteApprovalRequest = {
      approvalId: `approval_${randomUUID()}`,
      runnerId: hostId,
      hostLabel: handle.label,
      command,
      cwd,
      requestedAt: new Date().toISOString(),
      requireRemoteLabel: true
    }
    handle.pendingApprovals.add(approvalRequest.approvalId)

    this.audit(hostId, 'approval-requested', 'requested', `REMOTE approval requested for: ${command}`, approvalRequest.approvalId)

    let decision: RemoteApprovalDecision
    try {
      decision = await approvalCallback(approvalRequest)
    } finally {
      // Always clean up pending approval, even if the callback throws
      handle.pendingApprovals.delete(approvalRequest.approvalId)
    }

    if (decision === 'deny') {
      this.audit(hostId, 'exec-denied', 'denied', `REMOTE approval denied for: ${command}`, approvalRequest.approvalId)
      throw new Error(`Remote command denied by approval policy: ${command}`)
    }

    this.audit(hostId, 'exec-allowed', 'allowed', `REMOTE approval granted for: ${command}`, approvalRequest.approvalId)

    // Execute with budget/timeout
    this.updateHandleStatus(hostId, 'executing')
    const execOpts: SshExecOptions = {
      cwd: opts?.cwd,
      env: opts?.env,
      timeoutMs: effectiveTimeoutMs,
      maxOutputBytes: opts?.maxOutputBytes ?? 1_000_000
    }
    const runId = await connector.exec(command, execOpts)
    handle.activeRunId = runId

    this.activeRuns.set(runId, {
      runnerId: hostId,
      command,
      cwd,
      output: '',
      exitCode: null,
      signal: null
    })

    this.audit(hostId, 'exec-start', 'requested', `Started: ${command}`, runId)
    return runId
  }

  getActiveRun(runId: string): typeof this.activeRuns extends Map<string, infer T> ? T | undefined : undefined {
    return this.activeRuns.get(runId)
  }

  /* ---- Stop / Resume / Reconnect ---- */

  async stopRun(hostId: string): Promise<void> {
    const handle = this.handles.get(hostId)
    if (!handle) throw new Error(`Host not registered: ${hostId}`)

    const connector = this.connectors.get(hostId)
    if (!connector) return

    if (handle.activeRunId) {
      // Store run info for potential resume
      const run = this.activeRuns.get(handle.activeRunId)
      if (run) {
        this.pausedRuns.set(hostId, {
          runnerId: hostId,
          command: run.command,
          cwd: run.cwd
        })
      }
      connector.signal(handle.activeRunId, 'SIGTERM')
      this.audit(hostId, 'exec-stop', 'completed', 'Run stopped by host')
    }

    this.updateHandleStatus(hostId, 'paused')
  }

  async resumeRun(hostId: string): Promise<string | null> {
    const handle = this.handles.get(hostId)
    if (!handle) throw new Error(`Host not registered: ${hostId}`)

    const connector = this.connectors.get(hostId)
    if (!connector || connector.state !== 'connected') {
      // Reconnect if needed
      if (connector) {
        await connector.connect()
        await this.handshakeHost(hostId)
      }
    }

    const paused = this.pausedRuns.get(hostId)
    if (paused) {
      this.pausedRuns.delete(hostId)
      this.audit(hostId, 'exec-resume', 'requested', `Resuming: ${paused.command}`)
      // Re-execute the paused command
      return this.execCommand(hostId, paused.command, { cwd: paused.cwd })
    }

    return null
  }

  async reconnectHost(hostId: string): Promise<void> {
    const handle = this.handles.get(hostId)
    if (!handle) throw new Error(`Host not registered: ${hostId}`)

    // Disconnect existing
    await this.disconnectHost(hostId)
    // Reconnect
    await this.connectHost(hostId)
    this.audit(hostId, 'reconnect', 'completed')
  }

  /* ---- Audit ---- */

  getAuditLog(): RemoteRunnerAuditEntryV1[] {
    return this.settings.auditLog
  }

  /* ---- Internal ---- */

  private handleConnectorEvent(hostId: string, event: SshConnectorEvent): void {
    const handle = this.handles.get(hostId)
    if (!handle) return

    switch (event.kind) {
      case 'state': {
        const statusMap: Record<string, RemoteRunnerStatus> = {
          disconnected: 'idle',
          connecting: 'connecting',
          handshaking: 'handshaking',
          connected: 'connected',
          error: 'error'
        }
        const newStatus = statusMap[event.state] ?? 'idle'
        this.updateHandleStatus(hostId, newStatus, event.error)
        break
      }
      case 'output': {
        const run = this.activeRuns.get(event.runId)
        if (run) {
          run.output += event.data
        }
        break
      }
      case 'exit': {
        const run = this.activeRuns.get(event.runId)
        if (run) {
          run.exitCode = event.exitCode
          run.signal = event.signal
        }
        this.updateHandleStatus(hostId, 'connected')
        if (handle.activeRunId === event.runId) {
          handle.activeRunId = null
        }
        this.audit(hostId, 'exec-complete', event.exitCode === 0 ? 'completed' : 'failed',
          `Exit: ${event.exitCode}${event.signal ? ` signal:${event.signal}` : ''}`, event.runId)
        break
      }
    }
  }

  private updateHandleStatus(hostId: string, status: RemoteRunnerStatus, error?: string): void {
    const handle = this.handles.get(hostId)
    if (handle) {
      this.handles.set(hostId, { ...handle, status, lastError: error ?? handle.lastError })
    }
  }

  private audit(
    runnerId: string,
    action: string,
    outcome: RemoteRunnerAuditEntryV1['outcome'],
    reason?: string,
    runId?: string,
    consentId?: string
  ): void {
    const entry: RemoteRunnerAuditEntryV1 = {
      id: `audit_${randomUUID()}`,
      timestamp: new Date().toISOString(),
      runnerId,
      runId,
      actor: 'host',
      action: `remote-runner.${action}`,
      outcome,
      payloadRedaction: 'metadata',
      consentId,
      reason
    }

    // Update settings audit log (respect max)
    const maxEntries = this.settings.maxAuditEntries
    const updatedAuditLog = [...this.settings.auditLog, entry].slice(-maxEntries)
    this.settings = { ...this.settings, auditLog: updatedAuditLog }

    // Notify callback
    this.callbacks?.onAudit(entry)
  }

  private hostConfigToSshConfig(host: RemoteRunnerHostConfigV1): RemoteSshHostConfig {
    return {
      id: host.id,
      label: host.label,
      enabled: host.enabled,
      endpointRef: host.endpointRef,
      usernameRef: host.usernameRef,
      credentialStorage: host.credentialStorage,
      hostKeyPolicy: host.hostKeyPolicy
    }
  }

  private validateDataPolicy(hostId: string, policy: RemoteRunnerCapabilityHandshake['dataPolicy']): void {
    const never = new Set(this.settings.dataPolicy.never)
    for (const item of policy.defaultAllowed) {
      if (never.has(item)) {
        this.callbacks?.onEgressPolicyViolation(hostId, item, `Never-relayed data class in defaultAllowed: ${item}`)
      }
    }
  }

  /**
   * Enforce data egress policy on a command before it is sent to a remote
   * connector.  H10 stop-gate: fail-closed — violations throw to block
   * connector.exec, not merely notify a callback.
   */
  private enforceDataEgress(
    hostId: string,
    _policy: RemoteRunnerCapabilityHandshake['dataPolicy'],
    command: string
  ): void {
    const neverRelayed = new Set(this.settings.dataPolicy.never)
    const sensitivePattern = /(api[-_]?keys?|token|secret|password|credential|authorization)\s*[:=]\s*\S+/gi
    const matches = command.match(sensitivePattern)
    if (matches) {
      for (const match of matches) {
        if (neverRelayed.has('api_keys') || neverRelayed.has('env_values') || neverRelayed.has('keychain_material')) {
          const detail = `Potential secret in command being sent to remote: pattern matched in "${match.slice(0, 20)}..."`
          this.callbacks?.onEgressPolicyViolation(hostId, 'api_keys', detail)
          this.audit(hostId, 'egress-blocked', 'blocked', detail)
          throw new Error(`Data egress policy violation: ${detail}`)
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Redacted preview helper                                            */
/* ------------------------------------------------------------------ */

export function redactedHostPreview(host: RemoteRunnerHostConfigV1): RemoteRunnerHostConfigV1 {
  return redactRemoteRunnerConfig({
    ...host,
    // Ensure credential refs and endpoint refs are redacted
    endpointRef: host.endpointRef,
    usernameRef: host.usernameRef,
    credentialStorage: host.credentialStorage
  }) as unknown as RemoteRunnerHostConfigV1
}
