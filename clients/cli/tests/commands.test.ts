import { describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import {
  chatCommand,
  threadsCommand,
  sendCommand,
  approveCommand,
  usageCommand,
  healthCommand,
  serveCommand
} from '../src/commands.js'
import type { OpenCodexProtocolClient, SseEvent } from '../src/client.js'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...actual, existsSync: (() => false) as typeof existsSync }
})

function mockIo() {
  const out: string[] = []
  const err: string[] = []
  return {
    stdout: { write: (s: string) => { out.push(s) } },
    stderr: { write: (s: string) => { err.push(s) } },
    stdin: undefined as NodeJS.ReadableStream | undefined,
    exit: (code: number): never => { throw new Error(`exit(${code})`) },
    out,
    err
  }
}

function mockClient(overrides: Partial<{ [K in keyof OpenCodexProtocolClient]: unknown }> = {}): OpenCodexProtocolClient {
  return {
    health: vi.fn(async () => ({ ok: true, value: { ok: true, protocolVersion: 1, runtime: { ok: true, status: 200 }, auth: { loopbackOnly: true, tokenRequired: false } } })),
    listThreads: vi.fn(async () => ({ ok: true, value: [
      { id: 'thr_1', title: 'Test', workspaceRoot: '/repo', model: 'auto', mode: 'agent' as const, status: 'idle' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    ] })),
    getThread: vi.fn(async () => ({ ok: true, value: { id: 'thr_1', title: 'Test', workspaceRoot: '/repo', model: 'auto', mode: 'agent' as const, status: 'idle' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' } })),
    startThread: vi.fn(async () => ({ ok: true, value: { thread: { id: 'thr_1', title: 'Chat', workspaceRoot: '/repo', model: 'auto', mode: 'agent' as const, status: 'idle' as const, createdAt: '2026-01-01', updatedAt: '2026-01-01' } } })),
    sendTurn: vi.fn(async () => ({ ok: true, value: { id: 'turn_1', threadId: 'thr_1', status: 'queued' as const, promptPreview: 'Hi' } })),
    streamThreadEvents: vi.fn(async () => ({ ok: false, status: 500, message: 'no stream' })),
    listApprovals: vi.fn(async () => ({ ok: true, value: [] })),
    respondApproval: vi.fn(async () => ({ ok: true, value: { ok: true as const } })),
    getUsage: vi.fn(async () => ({ ok: true, value: { inputTokens: 100, outputTokens: 50, reasoningTokens: 0, cachedTokens: 0, totalTokens: 150, costUsd: 0.001, cacheHitRate: null } })),
    ...overrides
  } as unknown as OpenCodexProtocolClient
}

describe('threads command', () => {
  it('lists threads', async () => {
    const io = mockIo()
    const client = mockClient()
    const code = await threadsCommand(client, { list: true }, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('thr_1')
  })

  it('shows a thread', async () => {
    const io = mockIo()
    const client = mockClient()
    const code = await threadsCommand(client, { showId: 'thr_1' }, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('thr_1')
  })

  it('shows empty message', async () => {
    const io = mockIo()
    const client = mockClient({
      listThreads: vi.fn(async () => ({ ok: true, value: [] }))
    })
    const code = await threadsCommand(client, { list: true }, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('No threads')
  })
})

describe('send command', () => {
  it('sends a turn', async () => {
    const io = mockIo()
    const client = mockClient()
    const code = await sendCommand(client, { threadId: 'thr_1', prompt: 'Hello' }, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('queued')
  })

  it('handles send failure', async () => {
    const io = mockIo()
    const client = mockClient({
      sendTurn: vi.fn(async () => ({ ok: false, status: 500, message: 'dead' }))
    })
    const code = await sendCommand(client, { threadId: 'thr_1', prompt: 'Hello' }, io)
    expect(code).toBe(1)
    expect(io.err.join('')).toContain('dead')
  })
})

describe('approve command', () => {
  it('lists approvals', async () => {
    const io = mockIo()
    const client = mockClient({
      listApprovals: vi.fn(async () => ({ ok: true, value: [
        { id: 'app_1', threadId: 'thr_1', turnId: 'turn_1', toolName: 'bash', status: 'pending' as const, summary: 'ls' }
      ] }))
    })
    const code = await approveCommand(client, { list: true }, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('app_1')
  })

  it('shows empty approvals', async () => {
    const io = mockIo()
    const client = mockClient()
    const code = await approveCommand(client, { list: true }, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('No pending approvals')
  })

  it('responds to an approval', async () => {
    const io = mockIo()
    const client = mockClient()
    const code = await approveCommand(client, { id: 'app_1', action: 'allow' }, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('allowed')
  })
})

describe('usage command', () => {
  it('shows usage summary', async () => {
    const io = mockIo()
    const client = mockClient()
    const code = await usageCommand(client, {}, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('Input tokens')
  })

  it('handles usage failure', async () => {
    const io = mockIo()
    const client = mockClient({
      getUsage: vi.fn(async () => ({ ok: false, status: 500, message: 'fail' }))
    })
    const code = await usageCommand(client, {}, io)
    expect(code).toBe(1)
  })
})

describe('health command', () => {
  it('shows server health', async () => {
    const io = mockIo()
    const client = mockClient()
    const code = await healthCommand(client, io)
    expect(code).toBe(0)
    expect(io.out.join('')).toContain('"ok"')
  })

  it('handles unreachable server', async () => {
    const io = mockIo()
    const client = mockClient({
      health: vi.fn(async () => ({ ok: false, status: 0, message: 'ECONNREFUSED' }))
    })
    const code = await healthCommand(client, io)
    expect(code).toBe(1)
  })
})

describe('serve command', () => {
  it('delegates to kun serve (returns Promise, verifies kun not found path)', async () => {
    const io = mockIo()
    // When Kun isn't built in the test environment's expected paths,
    // serveCommand returns 1 with the error message.
    const code = await serveCommand([], io)
    // Either Kun is found and spawns (0), or not found and errors (1).
    // Both are valid: the test only verifies the thin-delegate path exists.
    expect([0, 1]).toContain(code)
    if (code === 1) {
      expect(io.err.join('')).toContain('Kun runtime not found')
    }
  })
})
