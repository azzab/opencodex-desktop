/**
 * Thin protocol client — maps CLI commands to Kun HTTP/SSE.
 * No business logic, no approvals, no session store.
 */
import type { FetchTransport } from './transport.js'

/* ------------------------------------------------------------------ */
/*  Types (mirror of app-server-protocol, kept small for CLI)          */
/* ------------------------------------------------------------------ */

export type CliResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string }

export type CliThread = {
  id: string
  title: string
  workspaceRoot: string
  model: string
  mode: 'agent' | 'plan'
  status: 'idle' | 'running' | 'archived' | 'deleted'
  createdAt: string
  updatedAt: string
}

export type CliTurn = {
  id: string
  threadId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted'
  promptPreview: string
  startedAt?: string
  finishedAt?: string
}

export type CliApproval = {
  id: string
  threadId: string
  turnId: string
  toolName: string
  status: 'pending' | 'allowed' | 'denied' | 'expired'
  summary: string
  expiresAt?: string
}

export type CliUsage = {
  threadId?: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cachedTokens: number
  totalTokens: number
  costUsd: number | null
  cacheHitRate: number | null
}

export type CliServerHealth = {
  ok: boolean
  protocolVersion: number
  runtime: { ok: boolean; status: number }
  auth: { loopbackOnly: boolean; tokenRequired: boolean }
}

/* ------------------------------------------------------------------ */
/*  SSE helper                                                          */
/* ------------------------------------------------------------------ */

export type SseEvent = {
  id?: string
  event?: string
  data: string
}

export function parseSseChunk(chunk: string): SseEvent {
  const lines = chunk.split('\n')
  const event: SseEvent = { data: '' }
  for (const line of lines) {
    if (line.startsWith('id:')) event.id = line.slice(3).trim()
    else if (line.startsWith('event:')) event.event = line.slice(6).trim()
    else if (line.startsWith('data:')) event.data = line.slice(5).trim()
    else if (line === '' && event.data) break
  }
  return event
}

export async function* streamSseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) continue
        const event = parseSseChunk(trimmed)
        if (event.data) yield event
      }
    }
    if (buffer.trim()) {
      const event = parseSseChunk(buffer.trim())
      if (event.data) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

/* ------------------------------------------------------------------ */
/*  Protocol client                                                     */
/* ------------------------------------------------------------------ */

export class OpenCodexProtocolClient {
  constructor(private transport: FetchTransport) {}

  async health(): Promise<CliResult<CliServerHealth>> {
    return this.get('/health', mapHealth)
  }

  async listThreads(opts: {
    limit?: number
    search?: string
    includeArchived?: boolean
  } = {}): Promise<CliResult<CliThread[]>> {
    const query = new URLSearchParams()
    if (opts.limit) query.set('limit', String(opts.limit))
    if (opts.search) query.set('search', opts.search)
    if (opts.includeArchived) query.set('include_archived', 'true')
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    return this.get(`/v1/threads${suffix}`, mapThreadList)
  }

  async getThread(threadId: string): Promise<CliResult<CliThread>> {
    return this.get(`/v1/threads/${encodeURIComponent(threadId)}`, mapThread)
  }

  async startThread(request: {
    workspaceRoot: string
    title?: string
    model?: string
    mode?: 'agent' | 'plan'
    initialPrompt?: string
  }): Promise<CliResult<{ thread: CliThread; turn?: { threadId: string; turnId: string } }>> {
    const body = {
      workspace: request.workspaceRoot,
      title: request.title,
      model: request.model,
      mode: request.mode ?? 'agent'
    }
    const threadResult = await this.post<unknown>('/v1/threads', body)
    if (!threadResult.ok) return threadResult
    const thread = mapThread(threadResult.value)
    let turn: { threadId: string; turnId: string } | undefined
    if (request.initialPrompt?.trim()) {
      const turnResult = await this.post<unknown>(
        `/v1/threads/${encodeURIComponent(thread.id)}/turns`,
        { prompt: request.initialPrompt, mode: request.mode ?? 'agent' }
      )
      if (turnResult.ok) {
        const raw = turnResult.value as Record<string, unknown>
        turn = { threadId: String(raw.threadId ?? ''), turnId: String(raw.turnId ?? '') }
      }
    }
    return { ok: true, value: { thread, ...(turn ? { turn } : {}) } }
  }

  async sendTurn(threadId: string, prompt: string, mode?: 'agent' | 'plan'): Promise<CliResult<CliTurn>> {
    const result = await this.post<unknown>(
      `/v1/threads/${encodeURIComponent(threadId)}/turns`,
      { prompt, mode: mode ?? 'agent' }
    )
    if (!result.ok) return result
    const raw = result.value as Record<string, unknown>
    return {
      ok: true,
      value: {
        id: String(raw.turnId ?? ''),
        threadId: String(raw.threadId ?? threadId),
        status: 'queued',
        promptPreview: prompt.length > 200 ? prompt.slice(0, 197) + '...' : prompt
      }
    }
  }

  async streamThreadEvents(
    threadId: string,
    sinceSeq?: number
  ): Promise<CliResult<ReadableStream<Uint8Array>>> {
    const query = sinceSeq !== undefined ? `?since_seq=${sinceSeq}` : ''
    const result = await this.transport.stream(
      `/v1/threads/${encodeURIComponent(threadId)}/events${query}`
    )
    if (!result.ok || !result.stream) {
      return { ok: false, status: result.status, message: 'Failed to connect to event stream' }
    }
    return { ok: true, value: result.stream }
  }

  async listApprovals(threadId?: string): Promise<CliResult<CliApproval[]>> {
    // GET /v1/approvals returns the gate's pending list directly.
    const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''
    return this.get(`/v1/approvals${query}`, (data) => {
      const raw = data as Record<string, unknown>
      const approvals = Array.isArray(raw.approvals) ? raw.approvals : []
      return approvals.map((a: Record<string, unknown>) => ({
        id: String(a.id ?? ''),
        threadId: String(a.threadId ?? ''),
        turnId: String(a.turnId ?? ''),
        toolName: String(a.toolName ?? ''),
        status: normalizeApprovalStatus(a.status),
        summary: String(a.summary ?? '')
      }))
    })
  }

  async respondApproval(
    approvalId: string,
    decision: 'allow' | 'deny'
  ): Promise<CliResult<{ ok: true }>> {
    const result = await this.post<unknown>(
      `/v1/approvals/${encodeURIComponent(approvalId)}`,
      { decision, reason: `CLI ${decision}` }
    )
    if (!result.ok) return result
    return { ok: true, value: { ok: true } }
  }

  async getUsage(threadId?: string): Promise<CliResult<CliUsage>> {
    const path = threadId
      ? `/v1/threads/${encodeURIComponent(threadId)}/usage`
      : '/v1/usage'
    return this.get(path, mapUsage)
  }

  private async get<T>(
    path: string,
    mapper: (data: unknown) => T
  ): Promise<CliResult<T>> {
    const response = await this.transport.request('GET', path)
    if (!response.ok) {
      return { ok: false, status: response.status, message: response.body || 'Request failed' }
    }
    try {
      const data = JSON.parse(response.body) as unknown
      return { ok: true, value: mapper(data) }
    } catch {
      return { ok: false, status: response.status, message: 'Invalid JSON response' }
    }
  }

  private async post<T>(path: string, body: unknown): Promise<CliResult<T>> {
    const response = await this.transport.request('POST', path, body)
    if (!response.ok) {
      return { ok: false, status: response.status, message: response.body || 'Request failed' }
    }
    try {
      return { ok: true, value: JSON.parse(response.body) as T }
    } catch {
      return { ok: false, status: response.status, message: 'Invalid JSON response' }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Response mappers                                                    */
/* ------------------------------------------------------------------ */

function mapHealth(data: unknown): CliServerHealth {
  const raw = data as Record<string, unknown>
  return {
    ok: Boolean(raw.ok),
    protocolVersion: Number(raw.protocolVersion ?? 1),
    runtime: {
      ok: Boolean((raw.runtime as Record<string, unknown>)?.ok),
      status: Number((raw.runtime as Record<string, unknown>)?.status ?? 0)
    },
    auth: {
      loopbackOnly: Boolean((raw.auth as Record<string, unknown>)?.loopbackOnly),
      tokenRequired: Boolean((raw.auth as Record<string, unknown>)?.tokenRequired)
    }
  }
}

function mapThreadList(data: unknown): CliThread[] {
  const raw = data as Record<string, unknown>
  const threads = Array.isArray(raw.threads) ? raw.threads : (Array.isArray(raw) ? raw : [])
  return threads.map((t) => mapThread(t))
}

function mapThread(data: unknown): CliThread {
  const raw = data as Record<string, unknown>
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    workspaceRoot: String(raw.workspace ?? raw.workspaceRoot ?? ''),
    model: String(raw.model ?? ''),
    mode: raw.mode === 'plan' ? 'plan' : 'agent',
    status: normalizeThreadStatus(raw.status),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? '')
  }
}

function normalizeThreadStatus(v: unknown): CliThread['status'] {
  if (v === 'running' || v === 'archived' || v === 'deleted') return v
  return 'idle'
}

function normalizeApprovalStatus(v: unknown): CliApproval['status'] {
  if (v === 'pending' || v === 'allowed' || v === 'denied' || v === 'expired') return v
  return 'pending'
}

function mapUsage(data: unknown): CliUsage {
  const raw = data as Record<string, unknown>
  return {
    threadId: raw.threadId ? String(raw.threadId) : undefined,
    inputTokens: Number(raw.inputTokens ?? 0),
    outputTokens: Number(raw.outputTokens ?? 0),
    reasoningTokens: Number(raw.reasoningTokens ?? 0),
    cachedTokens: Number(raw.cachedTokens ?? 0),
    totalTokens: Number(raw.totalTokens ?? 0),
    costUsd: typeof raw.costUsd === 'number' ? raw.costUsd : null,
    cacheHitRate: typeof raw.cacheHitRate === 'number' ? raw.cacheHitRate : null
  }
}
