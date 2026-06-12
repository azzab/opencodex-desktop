import {
  APP_SERVER_PROTOCOL_VERSION,
  AppServerForkThreadRequestSchema,
  AppServerHealthResponseSchema,
  AppServerNotificationOptionsSchema,
  AppServerProjectSchema,
  AppServerRemoteRunnerActionResponseSchema,
  AppServerRemoteRunnerAuditResponseSchema,
  AppServerRemoteRunnerExecResponseSchema,
  AppServerRemoteRunnerResumeResponseSchema,
  AppServerRemoteRunnerStatusResponseSchema,
  AppServerRemoteRunnerStopResponseSchema,
  AppServerRemoteRunnerTrustResponseSchema,
  AppServerResumeThreadRequestSchema,
  AppServerStartThreadRequestSchema,
  AppServerSteerTurnRequestSchema,
  AppServerThreadSchema,
  AppServerThreadStartResponseSchema,
  type AppServerForkThreadRequest,
  type AppServerHealthResponse,
  type AppServerNotificationCategory,
  type AppServerNotificationOptions,
  type AppServerProject,
  type AppServerRemoteRunnerActionRequest,
  type AppServerRemoteRunnerActionResponse,
  type AppServerRemoteRunnerAuditRequest,
  type AppServerRemoteRunnerAuditResponse,
  type AppServerRemoteRunnerExecRequest,
  type AppServerRemoteRunnerExecResponse,
  type AppServerRemoteRunnerResumeRequest,
  type AppServerRemoteRunnerResumeResponse,
  type AppServerRemoteRunnerStatusResponse,
  type AppServerRemoteRunnerStopRequest,
  type AppServerRemoteRunnerStopResponse,
  type AppServerRemoteRunnerTrustRequest,
  type AppServerRemoteRunnerTrustResponse,
  type AppServerResumeThreadRequest,
  type AppServerStartThreadRequest,
  type AppServerSteerTurnRequest,
  type AppServerThread,
  type AppServerThreadStartResponse
} from '../../shared/app-server-protocol'
import {
  KUN_HEALTH_PATH,
  KUN_THREADS_PATH,
  kunSessionResumePath,
  kunThreadForkPath,
  kunThreadPath,
  kunThreadSteerPath,
  kunThreadTurnsPath,
  kunThreadEventsPath
} from '../../shared/kun-endpoints'
import {
  validateAppServerClientAuth,
  type AppServerAuthConfig,
  type AppServerClientAuth
} from './app-server-auth'

export type AppServerRuntimeRequest = (
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> }
) => Promise<{ ok: boolean; status: number; body: string }>

export type AppServerBridgeProject = {
  root: string
  label?: string
  trusted?: boolean
  active?: boolean
}

export type AppServerBridgeRemoteRunnerHost = {
  id: string
  label: string
  enabled: boolean
  connectionStatus: string
  lastHandshake: {
    issuedAt: string
    shell: { os: string; shell: string }
    gitAvailable: boolean
    toolPolicy: Record<string, string>
  } | null
  lastError: string | null
  trustedPathCount: number
}

export type AppServerBridgeRemoteRunnerAuditEntry = {
  id: string
  timestamp: string
  runnerId: string
  action: string
  outcome: string
  reason?: string | null
}

export type AppServerBridgeRemoteRunnerStatus = {
  hosts: AppServerBridgeRemoteRunnerHost[]
  enabled: boolean
  auditLog: AppServerBridgeRemoteRunnerAuditEntry[]
}

export type AppServerBridgeOptions = {
  runtimeRequest: AppServerRuntimeRequest
  auth: AppServerAuthConfig
  defaultModel: string
  getProjects: () => Promise<AppServerBridgeProject[]>
  getRemoteRunnerStatus?: () => Promise<AppServerBridgeRemoteRunnerStatus>
  remoteRunnerConnect?: (hostId: string) => Promise<{ ok: boolean; message?: string }>
  remoteRunnerDisconnect?: (hostId: string) => Promise<{ ok: boolean; message?: string }>
  remoteRunnerReconnect?: (hostId: string) => Promise<{ ok: boolean; message?: string }>
  remoteRunnerHandshake?: (hostId: string) => Promise<{ ok: boolean; message?: string }>
  remoteRunnerTrustPath?: (hostId: string, path: string, label?: string) => Promise<{ ok: boolean; path: string; message?: string }>
  remoteRunnerRevokeTrust?: (hostId: string, path: string) => Promise<{ ok: boolean; path: string; message?: string }>
  remoteRunnerExec?: (request: AppServerRemoteRunnerExecRequest) => Promise<{ ok: boolean; runId?: string; output?: string; exitCode?: number | null; message?: string }>
  remoteRunnerStop?: (hostId: string) => Promise<{ ok: boolean; hostId: string; wasRunning: boolean; message?: string }>
  remoteRunnerResume?: (hostId: string) => Promise<{ ok: boolean; hostId: string; runId?: string | null; restored: boolean; message?: string }>
  remoteRunnerAuditLog?: (limit?: number) => Promise<AppServerBridgeRemoteRunnerAuditEntry[]>
  now?: () => Date
}

export type AppServerBridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string }

const ALL_NOTIFICATION_CATEGORIES: AppServerNotificationCategory[] = [
  'health',
  'thread',
  'turn',
  'item',
  'tool_call',
  'approval',
  'artifact',
  'usage',
  'goal',
  'loop',
  'subagent',
  'automation',
  'remote_runner'
]

export class AppServerBridge {
  constructor(private readonly options: AppServerBridgeOptions) {}

  async health(client: AppServerClientAuth): Promise<AppServerBridgeResult<AppServerHealthResponse>> {
    return this.authorized(client, async () => {
      const response = await this.options.runtimeRequest(KUN_HEALTH_PATH, { method: 'GET' })
      const rrStatus = await this.options.getRemoteRunnerStatus?.().catch(() => undefined)
      return AppServerHealthResponseSchema.parse({
        ok: response.ok,
        protocolVersion: APP_SERVER_PROTOCOL_VERSION,
        runtime: {
          ok: response.ok,
          status: response.status,
          owner: 'kun'
        },
        auth: {
          loopbackOnly: this.options.auth.loopbackOnly !== false,
          tokenRequired: Boolean(this.options.auth.requireToken || this.options.auth.token?.trim())
        },
        remoteRunners: {
          available: this.options.getRemoteRunnerStatus !== undefined,
          enabled: rrStatus?.enabled ?? false
        }
      })
    })
  }

  async listProjects(client: AppServerClientAuth): Promise<AppServerBridgeResult<AppServerProject[]>> {
    return this.authorized(client, async () => {
      const projects = await this.options.getProjects()
      const rrStatus = await this.options.getRemoteRunnerStatus?.().catch(() => undefined)
      return projects.map((project, index) =>
        AppServerProjectSchema.parse({
          id: projectId(project.root),
          root: project.root,
          label: project.label || compactProjectLabel(project.root),
          trusted: project.trusted ?? true,
          active: project.active ?? index === 0,
          capabilities: {
            threads: true,
            approvals: true,
            usage: true,
            events: true,
            attachments: true,
            automation: true,
            remoteRunners: rrStatus?.enabled ?? false
          }
        })
      )
    })
  }

  async listThreads(
    client: AppServerClientAuth,
    options: { limit?: number; search?: string; includeArchived?: boolean } = {}
  ): Promise<AppServerBridgeResult<AppServerThread[]>> {
    return this.authorized(client, async () => {
      const query = new URLSearchParams()
      if (options.limit) query.set('limit', String(options.limit))
      if (options.search) query.set('search', options.search)
      if (options.includeArchived) query.set('include_archived', 'true')
      const suffix = query.size > 0 ? `?${query.toString()}` : ''
      const payload = await this.runtimeJson<{ threads?: unknown[] }>(`${KUN_THREADS_PATH}${suffix}`, {
        method: 'GET'
      })
      return (payload.threads ?? []).map((thread) => mapRuntimeThread(thread, this.options.now))
    })
  }

  async startThread(
    client: AppServerClientAuth,
    request: AppServerStartThreadRequest
  ): Promise<AppServerBridgeResult<AppServerThreadStartResponse>> {
    return this.authorized(client, async () => {
      const parsed = AppServerStartThreadRequestSchema.parse(request)
      const model = parsed.model?.trim() || this.options.defaultModel
      const threadRaw = await this.runtimeJson<unknown>(KUN_THREADS_PATH, {
        method: 'POST',
        body: JSON.stringify({
          title: parsed.title,
          workspace: parsed.workspaceRoot,
          model,
          mode: parsed.mode,
          approvalPolicy: parsed.approvalPolicy,
          sandboxMode: parsed.sandboxMode
        })
      })
      const thread = mapRuntimeThread(threadRaw, this.options.now)
      let turn: AppServerThreadStartResponse['turn']
      if (parsed.initialPrompt?.trim()) {
        const turnRaw = await this.runtimeJson<{ threadId: string; turnId: string }>(
          kunThreadTurnsPath(thread.id),
          {
            method: 'POST',
            body: JSON.stringify({
              prompt: parsed.initialPrompt,
              mode: parsed.mode
            })
          }
        )
        turn = {
          threadId: turnRaw.threadId,
          turnId: turnRaw.turnId
        }
      }
      return AppServerThreadStartResponseSchema.parse({
        thread,
        ...(turn ? { turn } : {})
      })
    })
  }

  async resumeThread(
    client: AppServerClientAuth,
    request: AppServerResumeThreadRequest
  ): Promise<AppServerBridgeResult<AppServerThread>> {
    return this.authorized(client, async () => {
      const parsed = AppServerResumeThreadRequestSchema.parse(request)
      const resumed = await this.runtimeJson<{ thread_id: string }>(
        kunSessionResumePath(parsed.sessionId),
        {
          method: 'POST',
          body: JSON.stringify({
            workspace: parsed.workspaceRoot,
            model: parsed.model,
            mode: parsed.mode
          })
        }
      )
      return this.getThreadById(resumed.thread_id)
    })
  }

  async forkThread(
    client: AppServerClientAuth,
    request: AppServerForkThreadRequest
  ): Promise<AppServerBridgeResult<AppServerThread>> {
    return this.authorized(client, async () => {
      const parsed = AppServerForkThreadRequestSchema.parse(request)
      const fork = await this.runtimeJson<unknown>(kunThreadForkPath(parsed.threadId), {
        method: 'POST',
        body: JSON.stringify({
          relation: parsed.relation,
          title: parsed.title
        })
      })
      return mapRuntimeThread(fork, this.options.now)
    })
  }

  async steerTurn(
    client: AppServerClientAuth,
    request: AppServerSteerTurnRequest
  ): Promise<AppServerBridgeResult<{ ok: true }>> {
    return this.authorized(client, async () => {
      const parsed = AppServerSteerTurnRequestSchema.parse(request)
      await this.runtimeJson<{ ok: boolean }>(kunThreadSteerPath(parsed.threadId, parsed.turnId), {
        method: 'POST',
        body: JSON.stringify({ text: parsed.text })
      })
      return { ok: true as const }
    })
  }

  async remoteRunnerStatus(
    client: AppServerClientAuth
  ): Promise<AppServerBridgeResult<AppServerRemoteRunnerStatusResponse>> {
    return this.authorized(client, async () => {
      if (!this.options.getRemoteRunnerStatus) {
        throw new RuntimeBridgeError(501, 'Remote runner support is not available on this host.')
      }
      const status = await this.options.getRemoteRunnerStatus()
      return AppServerRemoteRunnerStatusResponseSchema.parse({
        hosts: status.hosts.map((host) => ({
          id: host.id,
          label: host.label,
          enabled: host.enabled,
          connectionStatus: host.connectionStatus,
          lastHandshake: host.lastHandshake
            ? {
                issuedAt: host.lastHandshake.issuedAt,
                shell: {
                  os: host.lastHandshake.shell.os,
                  shell: host.lastHandshake.shell.shell
                },
                gitAvailable: host.lastHandshake.gitAvailable,
                toolPolicy: host.lastHandshake.toolPolicy
              }
            : null,
          lastError: host.lastError,
          trustedPathCount: host.trustedPathCount
        })),
        enabled: status.enabled,
        auditLog: status.auditLog.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          runnerId: entry.runnerId,
          action: entry.action,
          outcome: entry.outcome,
          reason: entry.reason
        }))
      })
    })
  }

  async remoteRunnerAction(
    client: AppServerClientAuth,
    request: AppServerRemoteRunnerActionRequest
  ): Promise<AppServerBridgeResult<AppServerRemoteRunnerActionResponse>> {
    return this.authorized(client, async () => {
      const fn = mapRemoteRunnerActionFn(request.action, this.options)
      if (!fn) {
        throw new RuntimeBridgeError(501, `Remote runner action '${request.action}' is not available on this host.`)
      }
      const result = await fn(request.hostId)
      return AppServerRemoteRunnerActionResponseSchema.parse({
        ok: result.ok,
        hostId: request.hostId,
        message: result.message
      })
    })
  }

  async remoteRunnerTrust(
    client: AppServerClientAuth,
    request: AppServerRemoteRunnerTrustRequest
  ): Promise<AppServerBridgeResult<AppServerRemoteRunnerTrustResponse>> {
    return this.authorized(client, async () => {
      if (request.action === 'trust') {
        const fn = this.options.remoteRunnerTrustPath
        if (!fn) {
          throw new RuntimeBridgeError(501, 'Remote runner trust-path operation is not available on this host.')
        }
        const result = await fn(request.hostId, request.path, request.label)
        return AppServerRemoteRunnerTrustResponseSchema.parse({
          ok: result.ok,
          hostId: request.hostId,
          path: result.path,
          message: result.message
        })
      }
      // revoke
      const fn = this.options.remoteRunnerRevokeTrust
      if (!fn) {
        throw new RuntimeBridgeError(501, 'Remote runner revoke-trust operation is not available on this host.')
      }
      const result = await fn(request.hostId, request.path)
      return AppServerRemoteRunnerTrustResponseSchema.parse({
        ok: result.ok,
        hostId: request.hostId,
        path: result.path,
        message: result.message
      })
    })
  }

  async remoteRunnerExec(
    client: AppServerClientAuth,
    request: AppServerRemoteRunnerExecRequest
  ): Promise<AppServerBridgeResult<AppServerRemoteRunnerExecResponse>> {
    return this.authorized(client, async () => {
      const fn = this.options.remoteRunnerExec
      if (!fn) {
        throw new RuntimeBridgeError(501, 'Remote runner exec operation is not available on this host.')
      }
      const result = await fn(request)
      return AppServerRemoteRunnerExecResponseSchema.parse({
        ok: result.ok,
        runId: result.runId,
        output: result.output,
        exitCode: result.exitCode,
        message: result.message
      })
    })
  }

  async remoteRunnerStop(
    client: AppServerClientAuth,
    request: AppServerRemoteRunnerStopRequest
  ): Promise<AppServerBridgeResult<AppServerRemoteRunnerStopResponse>> {
    return this.authorized(client, async () => {
      const fn = this.options.remoteRunnerStop
      if (!fn) {
        throw new RuntimeBridgeError(501, 'Remote runner stop operation is not available on this host.')
      }
      const result = await fn(request.hostId)
      return AppServerRemoteRunnerStopResponseSchema.parse({
        ok: result.ok,
        hostId: result.hostId,
        wasRunning: result.wasRunning,
        message: result.message
      })
    })
  }

  async remoteRunnerResume(
    client: AppServerClientAuth,
    request: AppServerRemoteRunnerResumeRequest
  ): Promise<AppServerBridgeResult<AppServerRemoteRunnerResumeResponse>> {
    return this.authorized(client, async () => {
      const fn = this.options.remoteRunnerResume
      if (!fn) {
        throw new RuntimeBridgeError(501, 'Remote runner resume operation is not available on this host.')
      }
      const result = await fn(request.hostId)
      return AppServerRemoteRunnerResumeResponseSchema.parse({
        ok: result.ok,
        hostId: result.hostId,
        runId: result.runId,
        restored: result.restored,
        message: result.message
      })
    })
  }

  async remoteRunnerAuditLog(
    client: AppServerClientAuth,
    request: AppServerRemoteRunnerAuditRequest = {}
  ): Promise<AppServerBridgeResult<AppServerRemoteRunnerAuditResponse>> {
    return this.authorized(client, async () => {
      const fn = this.options.remoteRunnerAuditLog
      if (!fn) {
        throw new RuntimeBridgeError(501, 'Remote runner audit log is not available on this host.')
      }
      const entries = await fn(request.limit)
      return AppServerRemoteRunnerAuditResponseSchema.parse({
        entries: entries.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          runnerId: entry.runnerId,
          action: entry.action,
          outcome: entry.outcome,
          reason: entry.reason
        }))
      })
    })
  }

  buildNotificationSubscription(options: AppServerNotificationOptions = {}): {
    categories: AppServerNotificationCategory[]
    kunEventPath?: string
    redaction: 'metadata'
  } {
    const parsed = AppServerNotificationOptionsSchema.parse(options)
    const requested = parsed.categories ?? ALL_NOTIFICATION_CATEGORIES
    const optOut = new Set(parsed.optOutCategories)
    const categories = requested.filter((category) => !optOut.has(category))
    const query = new URLSearchParams()
    if (parsed.sinceSeq !== undefined) query.set('since_seq', String(parsed.sinceSeq))
    const kunEventPath = parsed.threadId
      ? `${kunThreadEventsPath(parsed.threadId)}${query.size > 0 ? `?${query.toString()}` : ''}`
      : undefined
    return {
      categories,
      ...(kunEventPath ? { kunEventPath } : {}),
      redaction: 'metadata'
    }
  }

  private async getThreadById(threadId: string): Promise<AppServerThread> {
    const thread = await this.runtimeJson<unknown>(kunThreadPath(threadId), { method: 'GET' })
    return mapRuntimeThread(thread, this.options.now)
  }

  private async authorized<T>(
    client: AppServerClientAuth,
    fn: () => Promise<T>
  ): Promise<AppServerBridgeResult<T>> {
    const auth = validateAppServerClientAuth(client, this.options.auth)
    if (!auth.ok) {
      return { ok: false, status: auth.status, message: auth.message }
    }
    try {
      return { ok: true, value: await fn() }
    } catch (error) {
      return {
        ok: false,
        status: error instanceof RuntimeBridgeError ? error.status : 500,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private async runtimeJson<T>(
    path: string,
    init: { method?: string; body?: string; headers?: Record<string, string> }
  ): Promise<T> {
    const response = await this.options.runtimeRequest(path, init)
    const parsed = parseJson(response.body)
    if (!response.ok) {
      throw new RuntimeBridgeError(response.status, runtimeErrorMessage(parsed, response.body))
    }
    return parsed as T
  }
}

class RuntimeBridgeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function parseJson(value: string): unknown {
  if (!value.trim()) return {}
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function runtimeErrorMessage(parsed: unknown, fallback: string): string {
  if (parsed && typeof parsed === 'object' && 'message' in parsed) {
    const message = (parsed as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback || 'Kun runtime request failed.'
}

function mapRuntimeThread(value: unknown, now: (() => Date) | undefined): AppServerThread {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const workspace = stringValue(raw.workspace)
  const createdAt = stringValue(raw.createdAt) || nowIso(now)
  const updatedAt = stringValue(raw.updatedAt) || createdAt
  return AppServerThreadSchema.parse({
    id: stringValue(raw.id) || 'unknown-thread',
    title: stringValue(raw.title),
    projectId: workspace ? projectId(workspace) : undefined,
    workspaceRoot: workspace,
    model: stringValue(raw.model) || 'auto',
    mode: raw.mode === 'plan' ? 'plan' : 'agent',
    status: normalizeThreadStatus(raw.status),
    relation: normalizeRelation(raw.relation),
    parentThreadId: stringValue(raw.parentThreadId) || undefined,
    forkedFromThreadId: stringValue(raw.forkedFromThreadId) || undefined,
    goal: mapGoal(raw.goal),
    createdAt,
    updatedAt
  })
}

function mapGoal(value: unknown): AppServerThread['goal'] {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const threadId = stringValue(raw.threadId)
  const objective = stringValue(raw.objective)
  if (!threadId || !objective) return undefined
  return {
    threadId,
    objective,
    status: normalizeGoalStatus(raw.status),
    tokenBudget: numberOrNull(raw.tokenBudget),
    tokensUsed: nonnegativeInteger(raw.tokensUsed),
    updatedAt: stringValue(raw.updatedAt) || new Date(0).toISOString()
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeThreadStatus(value: unknown): AppServerThread['status'] {
  return value === 'running' || value === 'archived' || value === 'deleted' ? value : 'idle'
}

function normalizeRelation(value: unknown): AppServerThread['relation'] | undefined {
  return value === 'fork' || value === 'side' || value === 'primary' ? value : undefined
}

function normalizeGoalStatus(value: unknown): NonNullable<AppServerThread['goal']>['status'] {
  if (
    value === 'paused' ||
    value === 'blocked' ||
    value === 'usageLimited' ||
    value === 'budgetLimited' ||
    value === 'complete'
  ) {
    return value
  }
  return 'active'
}

function numberOrNull(value: unknown): number | null | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function nonnegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

function nowIso(now: (() => Date) | undefined): string {
  return (now ?? (() => new Date()))().toISOString()
}

function projectId(root: string): string {
  return `project_${Buffer.from(root).toString('base64url').slice(0, 48)}`
}

function compactProjectLabel(root: string): string {
  return root.replaceAll('\\', '/').split('/').filter(Boolean).pop() || root
}

function mapRemoteRunnerActionFn(
  action: string,
  options: AppServerBridgeOptions
): ((hostId: string) => Promise<{ ok: boolean; message?: string }>) | undefined {
  switch (action) {
    case 'connect':
      return options.remoteRunnerConnect
    case 'disconnect':
      return options.remoteRunnerDisconnect
    case 'reconnect':
      return options.remoteRunnerReconnect
    case 'handshake':
      return options.remoteRunnerHandshake
    default:
      return undefined
  }
}
