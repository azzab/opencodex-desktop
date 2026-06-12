import { describe, expect, it, vi } from 'vitest'
import type { FetchTransport } from '../src/transport.js'
import { OpenCodexProtocolClient, parseSseChunk, streamSseEvents } from '../src/client.js'

function mockTransport(responses: Record<string, { ok: boolean; status: number; body: string }>): FetchTransport {
  return {
    request: vi.fn(async (method, path) => {
      const key = `${method} ${path}`
      const match = responses[key] ?? responses[path] ?? { ok: false, status: 404, body: '{"message":"not found"}' }
      return match
    }),
    stream: vi.fn(async () => ({
      ok: true,
      status: 200,
      stream: null
    }))
  }
}

function makeClient(responses: Record<string, { ok: boolean; status: number; body: string }>): OpenCodexProtocolClient {
  return new OpenCodexProtocolClient(mockTransport(responses))
}

describe('OpenCodexProtocolClient', () => {
  it('checks health', async () => {
    const client = makeClient({
      '/health': { ok: true, status: 200, body: JSON.stringify({
        ok: true,
        protocolVersion: 1,
        runtime: { ok: true, status: 200 },
        auth: { loopbackOnly: true, tokenRequired: false }
      }) }
    })
    const result = await client.health()
    expect(result).toEqual({
      ok: true,
      value: {
        ok: true,
        protocolVersion: 1,
        runtime: { ok: true, status: 200 },
        auth: { loopbackOnly: true, tokenRequired: false }
      }
    })
  })

  it('returns error when server is unreachable', async () => {
    const client = makeClient({})
    const result = await client.health()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
  })

  it('lists threads', async () => {
    const client = makeClient({
      '/v1/threads': { ok: true, status: 200, body: JSON.stringify({
        threads: [
          { id: 'thr_1', title: 'Test', workspace: '/repo', model: 'gpt-5.5', mode: 'agent', status: 'idle', createdAt: '2026-01-01', updatedAt: '2026-01-02' }
        ]
      }) }
    })
    const result = await client.listThreads()
    expect(result).toMatchObject({
      ok: true,
      value: [{ id: 'thr_1', title: 'Test', workspaceRoot: '/repo', mode: 'agent' }]
    })
  })

  it('lists threads with query params', async () => {
    const transport = mockTransport({
      '/v1/threads?limit=5&search=foo': { ok: true, status: 200, body: JSON.stringify({ threads: [] }) }
    })
    const client = new OpenCodexProtocolClient(transport)
    const result = await client.listThreads({ limit: 5, search: 'foo' })
    expect(result.ok).toBe(true)
  })

  it('gets a single thread', async () => {
    const client = makeClient({
      '/v1/threads/thr_2': { ok: true, status: 200, body: JSON.stringify({
        id: 'thr_2', title: 'Solo', workspace: '/app', model: 'auto', mode: 'plan', status: 'running', createdAt: '2026-02-01', updatedAt: '2026-02-02'
      }) }
    })
    const result = await client.getThread('thr_2')
    expect(result).toMatchObject({
      ok: true,
      value: { id: 'thr_2', mode: 'plan', status: 'running' }
    })
  })

  it('starts a thread without initial prompt', async () => {
    const client = makeClient({
      '/v1/threads': { ok: true, status: 201, body: JSON.stringify({
        id: 'thr_new', title: 'CLI', workspace: '/repo', model: 'gpt-5.5', mode: 'agent', status: 'idle', createdAt: '2026-03-01', updatedAt: '2026-03-01'
      }) }
    })
    const result = await client.startThread({ workspaceRoot: '/repo', title: 'CLI' })
    expect(result).toMatchObject({
      ok: true,
      value: { thread: { id: 'thr_new' } }
    })
    expect(result.ok && result.value.turn).toBeUndefined()
  })

  it('starts a thread with initial prompt', async () => {
    const client = makeClient({
      '/v1/threads': { ok: true, status: 201, body: JSON.stringify({
        id: 'thr_new', title: 'CLI', workspace: '/repo', model: 'gpt-5.5', mode: 'agent', status: 'idle', createdAt: '2026-03-01', updatedAt: '2026-03-01'
      }) },
      '/v1/threads/thr_new/turns': { ok: true, status: 202, body: JSON.stringify({ threadId: 'thr_new', turnId: 'turn_1' }) }
    })
    const result = await client.startThread({ workspaceRoot: '/repo', title: 'CLI', initialPrompt: 'Hello' })
    expect(result).toMatchObject({
      ok: true,
      value: { thread: { id: 'thr_new' }, turn: { threadId: 'thr_new', turnId: 'turn_1' } }
    })
  })

  it('sends a turn', async () => {
    const client = makeClient({
      '/v1/threads/thr_1/turns': { ok: true, status: 202, body: JSON.stringify({ threadId: 'thr_1', turnId: 'turn_2' }) }
    })
    const result = await client.sendTurn('thr_1', 'Do work')
    expect(result).toMatchObject({
      ok: true,
      value: { id: 'turn_2', threadId: 'thr_1', status: 'queued' }
    })
  })

  it('lists approvals', async () => {
    const client = makeClient({
      '/v1/approvals': { ok: true, status: 200, body: JSON.stringify({
        approvals: [
          { id: 'app_1', threadId: 'thr_1', turnId: 'turn_1', toolName: 'bash', status: 'pending', summary: 'Run command' }
        ]
      }) }
    })
    const result = await client.listApprovals()
    expect(result).toMatchObject({
      ok: true,
      value: [{ id: 'app_1', toolName: 'bash', status: 'pending' }]
    })
  })

  it('responds to an approval', async () => {
    const client = makeClient({
      '/v1/approvals/app_1': { ok: true, status: 200, body: JSON.stringify({ ok: true }) }
    })
    const result = await client.respondApproval('app_1', 'allow')
    expect(result).toEqual({ ok: true, value: { ok: true } })
  })

  it('gets usage', async () => {
    const client = makeClient({
      '/v1/usage': { ok: true, status: 200, body: JSON.stringify({
        inputTokens: 1000, outputTokens: 500, reasoningTokens: 0, cachedTokens: 200, totalTokens: 1700, costUsd: 0.003, cacheHitRate: 0.12
      }) }
    })
    const result = await client.getUsage()
    expect(result).toMatchObject({
      ok: true,
      value: { inputTokens: 1000, outputTokens: 500, totalTokens: 1700, costUsd: 0.003, cacheHitRate: 0.12 }
    })
  })
})

describe('SSE parsing', () => {
  it('parses a simple SSE chunk', () => {
    const event = parseSseChunk('data: {"hello":"world"}\n\n')
    expect(event.data).toBe('{"hello":"world"}')
  })

  it('parses SSE with id and event type', () => {
    const event = parseSseChunk('id: 1\nevent: delta\ndata: {"text":"hi"}\n\n')
    expect(event.id).toBe('1')
    expect(event.event).toBe('delta')
    expect(event.data).toBe('{"text":"hi"}')
  })

  it('handles empty chunks', () => {
    const event = parseSseChunk('')
    expect(event.data).toBe('')
  })
})

describe('streamSseEvents', () => {
  it('yields events from a stream', async () => {
    const encoder = new TextEncoder()
    const chunks = [
      encoder.encode('data: {"a":1}\n\ndata: {"b":2}\n\n')
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      }
    })
    const events: Array<{ data: string }> = []
    for await (const event of streamSseEvents(stream)) {
      events.push({ data: event.data })
    }
    expect(events).toEqual([{ data: '{"a":1}' }, { data: '{"b":2}' }])
  })

  it('handles split chunks across reads', async () => {
    const encoder = new TextEncoder()
    const chunks = [
      encoder.encode('data: {"a'),
      encoder.encode('":1}\n\ndata: {"b":2}\n\n')
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      }
    })
    const events: Array<{ data: string }> = []
    for await (const event of streamSseEvents(stream)) {
      events.push({ data: event.data })
    }
    expect(events).toEqual([{ data: '{"a":1}' }, { data: '{"b":2}' }])
  })
})
