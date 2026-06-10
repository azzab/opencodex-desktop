import { describe, expect, it, vi } from 'vitest'
import { AppServerBridge, type AppServerRuntimeRequest } from './app-server-bridge'

const now = () => new Date('2026-06-10T12:00:00.000Z')

function thread(id = 'thr_1') {
  return {
    id,
    title: 'Bridge thread',
    workspace: '/repo',
    model: 'gpt-5.5',
    mode: 'agent',
    status: 'idle',
    relation: 'primary',
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    turns: []
  }
}

function bridge(runtimeRequest: AppServerRuntimeRequest) {
  return new AppServerBridge({
    runtimeRequest,
    auth: { token: 'local-token', loopbackOnly: true },
    defaultModel: 'gpt-5.5',
    now,
    getProjects: async () => [{ root: '/repo', label: 'repo', trusted: true, active: true }]
  })
}

describe('AppServerBridge', () => {
  it('guards app-server access with loopback and token checks', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const service = bridge(runtimeRequest)

    expect(await service.health({ host: 'https://example.com', token: 'local-token' })).toMatchObject({
      ok: false,
      status: 403
    })
    expect(await service.health({ host: '127.0.0.1' })).toMatchObject({
      ok: false,
      status: 401
    })
    expect(await service.health({ host: '127.0.0.1', authorization: 'Bearer local-token' })).toMatchObject({
      ok: true,
      value: {
        ok: true,
        protocolVersion: 1,
        runtime: { owner: 'kun' },
        auth: { loopbackOnly: true, tokenRequired: true }
      }
    })
  })

  it('lists projects and threads through the shared protocol shape', async () => {
    const runtimeRequest = vi.fn(async (path) => {
      if (path.startsWith('/v1/threads')) {
        return { ok: true, status: 200, body: JSON.stringify({ threads: [thread()] }) }
      }
      return { ok: true, status: 200, body: '{}' }
    })
    const service = bridge(runtimeRequest)

    const projects = await service.listProjects({ host: 'localhost', token: 'local-token' })
    const threads = await service.listThreads({ host: 'localhost', token: 'local-token' }, {
      limit: 5,
      search: 'Bridge'
    })

    expect(projects).toMatchObject({ ok: true, value: [{ root: '/repo', active: true }] })
    expect(threads).toMatchObject({ ok: true, value: [{ id: 'thr_1', workspaceRoot: '/repo' }] })
    expect(runtimeRequest).toHaveBeenCalledWith('/v1/threads?limit=5&search=Bridge', { method: 'GET' })
  })

  it('starts a thread and optional initial turn through Kun', async () => {
    const calls: Array<{ path: string; body?: string; method?: string }> = []
    const runtimeRequest = vi.fn(async (path, init) => {
      calls.push({ path, body: init.body, method: init.method })
      if (path === '/v1/threads') {
        return { ok: true, status: 201, body: JSON.stringify(thread('thr_new')) }
      }
      if (path === '/v1/threads/thr_new/turns') {
        return { ok: true, status: 202, body: JSON.stringify({ threadId: 'thr_new', turnId: 'turn_1' }) }
      }
      return { ok: false, status: 404, body: '{"message":"not found"}' }
    })
    const service = bridge(runtimeRequest)

    const result = await service.startThread({ host: '::1', token: 'local-token' }, {
      workspaceRoot: '/repo',
      title: 'CLI started',
      initialPrompt: 'Start work'
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        thread: { id: 'thr_new', model: 'gpt-5.5' },
        turn: { threadId: 'thr_new', turnId: 'turn_1' }
      }
    })
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({
      workspace: '/repo',
      title: 'CLI started',
      model: 'gpt-5.5'
    })
    expect(JSON.parse(calls[1]?.body ?? '{}')).toMatchObject({ prompt: 'Start work' })
  })

  it('resumes, forks, steers, and builds Kun notification subscriptions', async () => {
    const runtimeRequest = vi.fn(async (path) => {
      if (path === '/v1/sessions/sess_1/resume-thread') {
        return { ok: true, status: 201, body: JSON.stringify({ thread_id: 'thr_resumed' }) }
      }
      if (path === '/v1/threads/thr_resumed') {
        return { ok: true, status: 200, body: JSON.stringify(thread('thr_resumed')) }
      }
      if (path === '/v1/threads/thr_1/fork') {
        return { ok: true, status: 201, body: JSON.stringify(thread('thr_fork')) }
      }
      if (path === '/v1/threads/thr_1/turns/turn_1/steer') {
        return { ok: true, status: 200, body: JSON.stringify({ ok: true }) }
      }
      return { ok: false, status: 404, body: '{"message":"not found"}' }
    })
    const service = bridge(runtimeRequest)
    const client = { host: '127.0.0.1', token: 'local-token' }

    expect(await service.resumeThread(client, { sessionId: 'sess_1' })).toMatchObject({
      ok: true,
      value: { id: 'thr_resumed' }
    })
    expect(await service.forkThread(client, { threadId: 'thr_1', relation: 'fork' })).toMatchObject({
      ok: true,
      value: { id: 'thr_fork' }
    })
    expect(await service.steerTurn(client, { threadId: 'thr_1', turnId: 'turn_1', text: 'narrow scope' })).toEqual({
      ok: true,
      value: { ok: true }
    })
    expect(service.buildNotificationSubscription({
      threadId: 'thr_1',
      sinceSeq: 7,
      optOutCategories: ['usage', 'automation']
    })).toMatchObject({
      kunEventPath: '/v1/threads/thr_1/events?since_seq=7',
      redaction: 'metadata'
    })
    expect(service.buildNotificationSubscription({
      threadId: 'thr_1',
      optOutCategories: ['usage', 'automation']
    }).categories).not.toEqual(expect.arrayContaining(['usage', 'automation']))
  })
})
