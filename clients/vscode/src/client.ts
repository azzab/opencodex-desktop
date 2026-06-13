/**
 * Thin protocol client for VS Code extension.
 * Same protocol as the CLI — HTTP/SSE calls to Kun.
 * No business logic.
 */

export type VsCodeCliResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string }

export type VsCodeThread = {
  id: string
  title: string
  workspaceRoot: string
  model: string
  mode: 'agent' | 'plan'
  status: 'idle' | 'running' | 'archived' | 'deleted'
  createdAt: string
  updatedAt: string
}

export type VsCodeTurn = {
  id: string
  threadId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted'
  promptPreview: string
}

export type VsCodeCreateThreadRequest = {
  workspaceRoot: string
  title?: string
  model?: string
  mode?: 'agent' | 'plan'
}

export type VsCodeApproval = {
  id: string
  threadId: string
  turnId: string
  toolName: string
  status: 'pending' | 'allowed' | 'denied' | 'expired'
  summary: string
}

export type VsCodeSseEvent = {
  id?: string
  event?: string
  data: string
}

export class OpenCodexVsCodeClient {
  private baseUrl: string
  private token: string

  constructor(host: string, port: number, token: string) {
    this.baseUrl = `http://${host}:${port}`
    this.token = token
  }

  private authHeaders(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ ok: boolean; status: number; body: string }> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      ...this.authHeaders()
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      })
      return {
        ok: response.ok,
        status: response.status,
        body: await response.text()
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async health(): Promise<VsCodeCliResult<{ ok: boolean; protocolVersion: number }>> {
    const response = await this.request('GET', '/health')
    if (!response.ok) return { ok: false, status: response.status, message: response.body }
    try {
      const data = JSON.parse(response.body) as Record<string, unknown>
      return { ok: true, value: { ok: Boolean(data.ok), protocolVersion: Number(data.protocolVersion ?? 1) } }
    } catch {
      return { ok: false, status: response.status, message: 'Invalid response' }
    }
  }

  async listThreads(opts: {
    limit?: number
    search?: string
  } = {}): Promise<VsCodeCliResult<VsCodeThread[]>> {
    const query = new URLSearchParams()
    if (opts.limit) query.set('limit', String(opts.limit))
    if (opts.search) query.set('search', opts.search)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    const response = await this.request('GET', `/v1/threads${suffix}`)
    if (!response.ok) return { ok: false, status: response.status, message: response.body }
    try {
      const data = JSON.parse(response.body) as Record<string, unknown>
      const threads = Array.isArray(data.threads) ? data.threads : Array.isArray(data) ? data : []
      return {
        ok: true,
        value: threads.map((t: Record<string, unknown>) => ({
          id: String(t.id ?? ''),
          title: String(t.title ?? ''),
          workspaceRoot: String(t.workspace ?? t.workspaceRoot ?? ''),
          model: String(t.model ?? ''),
          mode: t.mode === 'plan' ? 'plan' as const : 'agent' as const,
          status: (t.status === 'running' || t.status === 'archived' || t.status === 'deleted' ? t.status : 'idle') as VsCodeThread['status'],
          createdAt: String(t.createdAt ?? ''),
          updatedAt: String(t.updatedAt ?? '')
        }))
      }
    } catch {
      return { ok: false, status: response.status, message: 'Invalid response' }
    }
  }

  async getThread(threadId: string): Promise<VsCodeCliResult<VsCodeThread>> {
    const response = await this.request('GET', `/v1/threads/${encodeURIComponent(threadId)}`)
    if (!response.ok) return { ok: false, status: response.status, message: response.body }
    try {
      const t = JSON.parse(response.body) as Record<string, unknown>
      return {
        ok: true,
        value: {
          id: String(t.id ?? ''),
          title: String(t.title ?? ''),
          workspaceRoot: String(t.workspace ?? t.workspaceRoot ?? ''),
          model: String(t.model ?? ''),
          mode: t.mode === 'plan' ? 'plan' as const : 'agent' as const,
          status: (t.status === 'running' || t.status === 'archived' || t.status === 'deleted' ? t.status : 'idle') as VsCodeThread['status'],
          createdAt: String(t.createdAt ?? ''),
          updatedAt: String(t.updatedAt ?? '')
        }
      }
    } catch {
      return { ok: false, status: response.status, message: 'Invalid response' }
    }
  }

  async createThread(request: VsCodeCreateThreadRequest): Promise<VsCodeCliResult<VsCodeThread>> {
    const response = await this.request(
      'POST',
      '/v1/threads',
      {
        workspace: request.workspaceRoot,
        title: request.title,
        model: request.model ?? 'auto',
        mode: request.mode ?? 'agent'
      }
    )
    if (!response.ok) return { ok: false, status: response.status, message: response.body }
    try {
      const t = JSON.parse(response.body) as Record<string, unknown>
      return {
        ok: true,
        value: {
          id: String(t.id ?? ''),
          title: String(t.title ?? ''),
          workspaceRoot: String(t.workspace ?? t.workspaceRoot ?? ''),
          model: String(t.model ?? ''),
          mode: t.mode === 'plan' ? 'plan' as const : 'agent' as const,
          status: (t.status === 'running' || t.status === 'archived' || t.status === 'deleted' ? t.status : 'idle') as VsCodeThread['status'],
          createdAt: String(t.createdAt ?? ''),
          updatedAt: String(t.updatedAt ?? '')
        }
      }
    } catch {
      return { ok: false, status: response.status, message: 'Invalid response' }
    }
  }

  async sendTurn(
    threadId: string,
    prompt: string,
    mode: 'agent' | 'plan' = 'agent'
  ): Promise<VsCodeCliResult<VsCodeTurn>> {
    const response = await this.request(
      'POST',
      `/v1/threads/${encodeURIComponent(threadId)}/turns`,
      { prompt, mode }
    )
    if (!response.ok) return { ok: false, status: response.status, message: response.body }
    try {
      const data = JSON.parse(response.body) as Record<string, unknown>
      return {
        ok: true,
        value: {
          id: String(data.turnId ?? ''),
          threadId: String(data.threadId ?? threadId),
          status: 'queued',
          promptPreview: prompt.length > 200 ? prompt.slice(0, 197) + '...' : prompt
        }
      }
    } catch {
      return { ok: false, status: response.status, message: 'Invalid response' }
    }
  }

  async listApprovals(): Promise<VsCodeCliResult<VsCodeApproval[]>> {
    const response = await this.request('GET', '/v1/approvals')
    if (!response.ok) return { ok: false, status: response.status, message: response.body }
    try {
      const data = JSON.parse(response.body) as Record<string, unknown>
      const approvals = Array.isArray(data.approvals) ? data.approvals : Array.isArray(data) ? data : []
      return {
        ok: true,
        value: approvals.map((a: Record<string, unknown>) => ({
          id: String(a.id ?? ''),
          threadId: String(a.threadId ?? ''),
          turnId: String(a.turnId ?? ''),
          toolName: String(a.toolName ?? ''),
          status: (a.status === 'pending' || a.status === 'allowed' || a.status === 'denied' || a.status === 'expired' ? a.status : 'pending') as VsCodeApproval['status'],
          summary: String(a.summary ?? '')
        }))
      }
    } catch {
      return { ok: false, status: response.status, message: 'Invalid response' }
    }
  }

  async respondApproval(
    approvalId: string,
    decision: 'allow' | 'deny'
  ): Promise<VsCodeCliResult<{ ok: true }>> {
    const response = await this.request(
      'POST',
      `/v1/approvals/${encodeURIComponent(approvalId)}`,
      { decision, reason: `IDE ${decision}` }
    )
    if (!response.ok) return { ok: false, status: response.status, message: response.body }
    return { ok: true, value: { ok: true } }
  }

  async streamEvents(
    threadId: string
  ): Promise<VsCodeCliResult<ReadableStream<Uint8Array>>> {
    const url = `${this.baseUrl}/v1/threads/${encodeURIComponent(threadId)}/events`
    const headers: Record<string, string> = {
      ...this.authHeaders(),
      Accept: 'text/event-stream'
    }
    try {
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok || !response.body) {
        return { ok: false, status: response.status, message: 'Stream unavailable' }
      }
      return { ok: true, value: response.body }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
