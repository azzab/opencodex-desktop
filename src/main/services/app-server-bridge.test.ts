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

  /* ------------------------------------------------------------------ */
  /*  Remote Runner Bridge Tests (Phase H10)                            */
  /* ------------------------------------------------------------------ */

  it('exposes remote runner capability in health', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const getRemoteRunnerStatus = vi.fn(async () => ({
      hosts: [{
        id: 'host_1',
        label: 'Build Host',
        enabled: true,
        connectionStatus: 'connected',
        lastHandshake: {
          issuedAt: '2026-06-12T10:00:00.000Z',
          shell: { os: 'linux', shell: 'bash' },
          gitAvailable: true,
          toolPolicy: { terminal: 'consent_required' }
        },
        lastError: null,
        trustedPathCount: 3
      }],
      enabled: true,
      auditLog: []
    }))

    const service = new AppServerBridge({
      runtimeRequest,
      auth: { token: 'local-token', loopbackOnly: true },
      defaultModel: 'gpt-5.5',
      now,
      getProjects: async () => [],
      getRemoteRunnerStatus
    })

    const result = await service.health({ host: '127.0.0.1', token: 'local-token' })
    expect(result).toMatchObject({
      ok: true,
      value: {
        remoteRunners: { available: true, enabled: true }
      }
    })
    expect(getRemoteRunnerStatus).toHaveBeenCalled()
  })

  it('returns remote runner status with metadata-only hosts and audit log', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const getRemoteRunnerStatus = vi.fn(async () => ({
      hosts: [{
        id: 'host_1',
        label: 'Build Host',
        enabled: true,
        connectionStatus: 'connected',
        lastHandshake: {
          issuedAt: '2026-06-12T10:00:00.000Z',
          shell: { os: 'linux', shell: 'bash' },
          gitAvailable: true,
          toolPolicy: { terminal: 'consent_required' }
        },
        lastError: null,
        trustedPathCount: 3
      }],
      enabled: true,
      auditLog: [{
        id: 'audit_1',
        timestamp: '2026-06-12T10:00:00.000Z',
        runnerId: 'host_1',
        action: 'remote-runner.connect',
        outcome: 'completed',
        reason: null
      }]
    }))

    const service = new AppServerBridge({
      runtimeRequest,
      auth: { token: 'local-token', loopbackOnly: true },
      defaultModel: 'gpt-5.5',
      now,
      getProjects: async () => [],
      getRemoteRunnerStatus
    })

    const result = await service.remoteRunnerStatus({ host: '127.0.0.1', token: 'local-token' })
    expect(result).toMatchObject({
      ok: true,
      value: {
        hosts: [{ id: 'host_1', trustedPathCount: 3 }],
        enabled: true,
        auditLog: [{ action: 'remote-runner.connect' }]
      }
    })

    // Verify metadata-only: no raw endpoint refs, credential refs, or trusted path details
    const json = JSON.stringify(result)
    expect(json).not.toContain('endpointRef')
    expect(json).not.toContain('credentialRef')
    expect(json).not.toContain('ssh-config')
    expect(json).not.toContain('keychain')
  })

  it('returns 501 when remote runner service is not available', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const service = new AppServerBridge({
      runtimeRequest,
      auth: { token: 'local-token', loopbackOnly: true },
      defaultModel: 'gpt-5.5',
      now,
      getProjects: async () => []
    })

    const result = await service.remoteRunnerStatus({ host: '127.0.0.1', token: 'local-token' })
    expect(result).toMatchObject({
      ok: false,
      status: 501,
      message: expect.stringContaining('not available')
    })
  })

  it('routes remote runner actions (connect/disconnect/reconnect/handshake)', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const remoteRunnerConnect = vi.fn(async () => ({ ok: true }))
    const remoteRunnerDisconnect = vi.fn(async () => ({ ok: true }))
    const remoteRunnerReconnect = vi.fn(async () => ({ ok: true }))
    const remoteRunnerHandshake = vi.fn(async () => ({ ok: true }))

    const service = new AppServerBridge({
      runtimeRequest,
      auth: { token: 'local-token', loopbackOnly: true },
      defaultModel: 'gpt-5.5',
      now,
      getProjects: async () => [],
      remoteRunnerConnect,
      remoteRunnerDisconnect,
      remoteRunnerReconnect,
      remoteRunnerHandshake
    })

    const client = { host: '127.0.0.1', token: 'local-token' }

    expect(await service.remoteRunnerAction(client, { hostId: 'host_1', action: 'connect' }))
      .toMatchObject({ ok: true, value: { ok: true, hostId: 'host_1' } })
    expect(remoteRunnerConnect).toHaveBeenCalledWith('host_1')

    expect(await service.remoteRunnerAction(client, { hostId: 'host_1', action: 'disconnect' }))
      .toMatchObject({ ok: true, value: { ok: true, hostId: 'host_1' } })
    expect(remoteRunnerDisconnect).toHaveBeenCalledWith('host_1')

    expect(await service.remoteRunnerAction(client, { hostId: 'host_1', action: 'reconnect' }))
      .toMatchObject({ ok: true, value: { ok: true, hostId: 'host_1' } })
    expect(remoteRunnerReconnect).toHaveBeenCalledWith('host_1')

    expect(await service.remoteRunnerAction(client, { hostId: 'host_1', action: 'handshake' }))
      .toMatchObject({ ok: true, value: { ok: true, hostId: 'host_1' } })
    expect(remoteRunnerHandshake).toHaveBeenCalledWith('host_1')
  })

  it('routes trust and revoke trust path operations', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const remoteRunnerTrustPath = vi.fn(async (_hostId: string, _path: string, _label?: string) => ({
      ok: true,
      path: '/trusted/path'
    }))
    const remoteRunnerRevokeTrust = vi.fn(async (_hostId: string, _path: string) => ({
      ok: true,
      path: '/trusted/path'
    }))

    const service = new AppServerBridge({
      runtimeRequest,
      auth: { token: 'local-token', loopbackOnly: true },
      defaultModel: 'gpt-5.5',
      now,
      getProjects: async () => [],
      remoteRunnerTrustPath,
      remoteRunnerRevokeTrust
    })

    const client = { host: '127.0.0.1', token: 'local-token' }

    expect(await service.remoteRunnerTrust(client, {
      hostId: 'host_1',
      action: 'trust',
      path: '/trusted/path',
      label: 'Workspace'
    })).toMatchObject({ ok: true, value: { ok: true, path: '/trusted/path' } })
    expect(remoteRunnerTrustPath).toHaveBeenCalledWith('host_1', '/trusted/path', 'Workspace')

    expect(await service.remoteRunnerTrust(client, {
      hostId: 'host_1',
      action: 'revoke',
      path: '/trusted/path'
    })).toMatchObject({ ok: true, value: { ok: true, path: '/trusted/path' } })
    expect(remoteRunnerRevokeTrust).toHaveBeenCalledWith('host_1', '/trusted/path')
  })

  it('routes exec, stop, resume, and audit log operations', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const remoteRunnerExec = vi.fn(async () => ({
      ok: true,
      runId: 'run_1',
      output: 'hello\n',
      exitCode: 0
    }))
    const remoteRunnerStop = vi.fn(async () => ({
      ok: true,
      hostId: 'host_1',
      wasRunning: true
    }))
    const remoteRunnerResume = vi.fn(async () => ({
      ok: true,
      hostId: 'host_1',
      runId: 'run_2',
      restored: true
    }))
    const remoteRunnerAuditLog = vi.fn(async () => [{
      id: 'audit_1',
      timestamp: '2026-06-12T10:00:00.000Z',
      runnerId: 'host_1',
      action: 'remote-runner.exec-allowed',
      outcome: 'allowed',
      reason: 'Approved'
    }])

    const service = new AppServerBridge({
      runtimeRequest,
      auth: { token: 'local-token', loopbackOnly: true },
      defaultModel: 'gpt-5.5',
      now,
      getProjects: async () => [],
      remoteRunnerExec,
      remoteRunnerStop,
      remoteRunnerResume,
      remoteRunnerAuditLog
    })

    const client = { host: '127.0.0.1', token: 'local-token' }

    expect(await service.remoteRunnerExec(client, {
      hostId: 'host_1',
      command: 'echo hello',
      cwd: '/trusted'
    })).toMatchObject({
      ok: true,
      value: { ok: true, runId: 'run_1', output: 'hello\n', exitCode: 0 }
    })

    expect(await service.remoteRunnerStop(client, { hostId: 'host_1' }))
      .toMatchObject({ ok: true, value: { ok: true, hostId: 'host_1', wasRunning: true } })

    expect(await service.remoteRunnerResume(client, { hostId: 'host_1' }))
      .toMatchObject({ ok: true, value: { ok: true, hostId: 'host_1', runId: 'run_2', restored: true } })

    expect(await service.remoteRunnerAuditLog(client, { limit: 10 }))
      .toMatchObject({
        ok: true,
        value: { entries: [{ action: 'remote-runner.exec-allowed' }] }
      })

    expect(remoteRunnerExec).toHaveBeenCalledWith({ hostId: 'host_1', command: 'echo hello', cwd: '/trusted' })
    expect(remoteRunnerStop).toHaveBeenCalledWith('host_1')
    expect(remoteRunnerResume).toHaveBeenCalledWith('host_1')
    expect(remoteRunnerAuditLog).toHaveBeenCalledWith(10)
  })

  it('returns 501 when remote runner operation callbacks are missing', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const service = new AppServerBridge({
      runtimeRequest,
      auth: { token: 'local-token', loopbackOnly: true },
      defaultModel: 'gpt-5.5',
      now,
      getProjects: async () => []
    })

    const client = { host: '127.0.0.1', token: 'local-token' }

    expect(await service.remoteRunnerAction(client, { hostId: 'h1', action: 'connect' }))
      .toMatchObject({ ok: false, status: 501 })
    expect(await service.remoteRunnerTrust(client, { hostId: 'h1', action: 'trust', path: '/tmp' }))
      .toMatchObject({ ok: false, status: 501 })
    expect(await service.remoteRunnerExec(client, { hostId: 'h1', command: 'ls' }))
      .toMatchObject({ ok: false, status: 501 })
    expect(await service.remoteRunnerStop(client, { hostId: 'h1' }))
      .toMatchObject({ ok: false, status: 501 })
    expect(await service.remoteRunnerResume(client, { hostId: 'h1' }))
      .toMatchObject({ ok: false, status: 501 })
    expect(await service.remoteRunnerAuditLog(client))
      .toMatchObject({ ok: false, status: 501 })
  })

  it('health reports remote runners unavailable when getRemoteRunnerStatus is not provided', async () => {
    const runtimeRequest = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }))
    const service = new AppServerBridge({
      runtimeRequest,
      auth: { token: 'local-token', loopbackOnly: true },
      defaultModel: 'gpt-5.5',
      now,
      getProjects: async () => []
    })

    const result = await service.health({ host: '127.0.0.1', token: 'local-token' })
    expect(result).toMatchObject({
      ok: true,
      value: {
        remoteRunners: { available: false, enabled: false }
      }
    })
  })
})
