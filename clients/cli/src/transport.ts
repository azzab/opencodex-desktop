/**
 * Thin HTTP transport for the CLI. No business logic — just fetch + SSE.
 */
export type FetchTransport = {
  request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<{ ok: boolean; status: number; body: string }>
  stream(
    path: string,
    headers?: Record<string, string>
  ): Promise<{ ok: boolean; status: number; stream: ReadableStream<Uint8Array> | null }>
}

export function createFetchTransport(baseUrl: string, token?: string): FetchTransport {
  const resolvedBase = baseUrl.replace(/\/+$/, '')
  const authHeaders: Record<string, string> = {}
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`
  }

  async function request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<{ ok: boolean; status: number; body: string }> {
    const url = `${resolvedBase}${path}`
    const headers: Record<string, string> = {
      ...authHeaders,
      ...extraHeaders
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const init: RequestInit = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    }
    try {
      const response = await fetch(url, init)
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

  async function stream(
    path: string,
    extraHeaders?: Record<string, string>
  ): Promise<{ ok: boolean; status: number; stream: ReadableStream<Uint8Array> | null }> {
    const url = `${resolvedBase}${path}`
    const headers: Record<string, string> = {
      ...authHeaders,
      Accept: 'text/event-stream',
      ...extraHeaders
    }
    try {
      const response = await fetch(url, { method: 'GET', headers })
      return {
        ok: response.ok,
        status: response.status,
        stream: response.ok && response.body ? response.body : null
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        stream: null
      }
    }
  }

  return { request, stream }
}
