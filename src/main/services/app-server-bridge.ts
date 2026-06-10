import {
  APP_SERVER_PROTOCOL_VERSION,
  AppServerForkThreadRequestSchema,
  AppServerHealthResponseSchema,
  AppServerNotificationOptionsSchema,
  AppServerProjectSchema,
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

export type AppServerBridgeOptions = {
  runtimeRequest: AppServerRuntimeRequest
  auth: AppServerAuthConfig
  defaultModel: string
  getProjects: () => Promise<AppServerBridgeProject[]>
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
  'automation'
]

export class AppServerBridge {
  constructor(private readonly options: AppServerBridgeOptions) {}

  async health(client: AppServerClientAuth): Promise<AppServerBridgeResult<AppServerHealthResponse>> {
    return this.authorized(client, async () => {
      const response = await this.options.runtimeRequest(KUN_HEALTH_PATH, { method: 'GET' })
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
        }
      })
    })
  }

  async listProjects(client: AppServerClientAuth): Promise<AppServerBridgeResult<AppServerProject[]>> {
    return this.authorized(client, async () => {
      const projects = await this.options.getProjects()
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
            automation: true
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
