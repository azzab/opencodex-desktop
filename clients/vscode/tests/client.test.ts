import { describe, expect, it, vi, afterEach } from 'vitest'
import { OpenCodexVsCodeClient } from '../src/client.js'

// Mock global fetch
const originalFetch = globalThis.fetch

function mockFetch(responses: Record<string, { ok: boolean; status: number; body: string }>): void {
  globalThis.fetch = vi.fn(async (url, init) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : String(url)
    const key = urlStr.replace(/^http:\/\/[^/]+/, '')
    const match = responses[key]
    if (match) {
      return {
        ok: match.ok,
        status: match.status,
        text: async () => match.body,
        body: null
      } as unknown as Response
    }
    return {
      ok: false,
      status: 404,
      text: async () => '{"message":"not found"}',
      body: null
    } as unknown as Response
  }) as unknown as typeof fetch
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch
}

describe('OpenCodexVsCodeClient', () => {
  afterEach(() => {
    restoreFetch()
  })

  it('checks health', async () => {
    mockFetch({
      '/health': { ok: true, status: 200, body: JSON.stringify({ ok: true, protocolVersion: 1 }) }
    })
    const client = new OpenCodexVsCodeClient('127.0.0.1', 18999, '')
    const result = await client.health()
    expect(result).toEqual({ ok: true, value: { ok: true, protocolVersion: 1 } })
  })

  it('returns error when unreachable', async () => {
    mockFetch({})
    const client = new OpenCodexVsCodeClient('127.0.0.1', 18999, '')
    const result = await client.health()
    expect(result.ok).toBe(false)
  })

  it('lists threads', async () => {
    mockFetch({
      '/v1/threads': {
        ok: true,
        status: 200,
        body: JSON.stringify({
          threads: [{ id: 't1', title: 'Test', workspace: '/repo', model: 'auto', mode: 'agent', status: 'idle', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]
        })
      }
    })
    const client = new OpenCodexVsCodeClient('127.0.0.1', 18999, '')
    const result = await client.listThreads()
    expect(result).toMatchObject({
      ok: true,
      value: [{ id: 't1', title: 'Test', mode: 'agent' }]
    })
  })

  it('gets a thread', async () => {
    mockFetch({
      '/v1/threads/t1': {
        ok: true,
        status: 200,
        body: JSON.stringify({ id: 't1', title: 'Test', workspace: '/repo', model: 'auto', mode: 'plan', status: 'running', createdAt: '2026-01-01', updatedAt: '2026-01-01' })
      }
    })
    const client = new OpenCodexVsCodeClient('127.0.0.1', 18999, '')
    const result = await client.getThread('t1')
    expect(result).toMatchObject({ ok: true, value: { id: 't1', mode: 'plan', status: 'running' } })
  })

  it('sends a turn', async () => {
    mockFetch({
      '/v1/threads/t1/turns': {
        ok: true,
        status: 202,
        body: JSON.stringify({ threadId: 't1', turnId: 'turn_1' })
      }
    })
    const client = new OpenCodexVsCodeClient('127.0.0.1', 18999, '')
    const result = await client.sendTurn('t1', 'Hello')
    expect(result).toMatchObject({
      ok: true,
      value: { id: 'turn_1', threadId: 't1', status: 'queued' }
    })
  })

  it('lists approvals', async () => {
    mockFetch({
      '/v1/approvals': {
        ok: true,
        status: 200,
        body: JSON.stringify({
          approvals: [{ id: 'a1', threadId: 't1', turnId: 'turn_1', toolName: 'bash', status: 'pending', summary: 'Run ls' }]
        })
      }
    })
    const client = new OpenCodexVsCodeClient('127.0.0.1', 18999, '')
    const result = await client.listApprovals()
    expect(result).toMatchObject({
      ok: true,
      value: [{ id: 'a1', toolName: 'bash', status: 'pending' }]
    })
  })

  it('responds to approval', async () => {
    mockFetch({
      '/v1/approvals/a1': {
        ok: true,
        status: 200,
        body: JSON.stringify({ ok: true })
      }
    })
    const client = new OpenCodexVsCodeClient('127.0.0.1', 18999, '')
    const result = await client.respondApproval('a1', 'allow')
    expect(result).toEqual({ ok: true, value: { ok: true } })
  })
})
