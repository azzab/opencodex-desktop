import { describe, expect, it, vi } from 'vitest'
import {
  parseAppServerCliArgs,
  runAppServerCliCommand
} from './app-server-cli'

describe('app-server CLI bridge prototype', () => {
  it('parses supported bridge commands', () => {
    expect(parseAppServerCliArgs(['health'])).toEqual({ ok: true, command: { kind: 'health' } })
    expect(parseAppServerCliArgs(['projects'])).toEqual({ ok: true, command: { kind: 'projects' } })
    expect(parseAppServerCliArgs(['threads', '--limit', '10', '--search=phase', '--include-archived'])).toEqual({
      ok: true,
      command: { kind: 'threads', limit: 10, search: 'phase', includeArchived: true }
    })
    expect(parseAppServerCliArgs([
      'start',
      '--workspace',
      '/repo',
      '--title',
      'Phase 8',
      '--mode',
      'plan',
      '--prompt',
      'Plan work'
    ])).toEqual({
      ok: true,
      command: {
        kind: 'start',
        workspaceRoot: '/repo',
        title: 'Phase 8',
        model: undefined,
        mode: 'plan',
        initialPrompt: 'Plan work'
      }
    })
    expect(parseAppServerCliArgs(['resume', '--session', 'sess_1', '--workspace', '/repo'])).toEqual({
      ok: true,
      command: {
        kind: 'resume',
        sessionId: 'sess_1',
        workspaceRoot: '/repo',
        model: undefined,
        mode: undefined
      }
    })
    expect(parseAppServerCliArgs(['steer', '--thread', 'thr_1', '--turn', 'turn_1', '--text', 'stop'])).toEqual({
      ok: true,
      command: { kind: 'steer', threadId: 'thr_1', turnId: 'turn_1', text: 'stop' }
    })
  })

  it('returns machine-readable JSON from the dispatcher', async () => {
    const bridge = {
      health: vi.fn(async () => ({ ok: true, value: { ok: true, protocolVersion: 1 } }))
    }

    const output = await runAppServerCliCommand(
      bridge as never,
      { host: '127.0.0.1', token: 'local-token' },
      ['health']
    )

    expect(JSON.parse(output)).toEqual({
      ok: true,
      value: { ok: true, protocolVersion: 1 }
    })
    expect(bridge.health).toHaveBeenCalledWith({ host: '127.0.0.1', token: 'local-token' })
  })

  it('fails closed for missing required command arguments', () => {
    expect(parseAppServerCliArgs(['start'])).toMatchObject({
      ok: false,
      message: 'start requires --workspace <path>.'
    })
    expect(parseAppServerCliArgs(['steer', '--thread', 'thr_1'])).toMatchObject({
      ok: false,
      message: 'steer requires --thread <id> --turn <id> --text <text>.'
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Remote Runner CLI Commands (Phase H10)                            */
  /* ------------------------------------------------------------------ */

  it('parses remote runner CLI commands', () => {
    expect(parseAppServerCliArgs(['remote-status'])).toEqual({
      ok: true,
      command: { kind: 'remote-status' }
    })

    expect(parseAppServerCliArgs(['remote-action', '--host', 'h1', '--action', 'connect'])).toEqual({
      ok: true,
      command: { kind: 'remote-action', hostId: 'h1', action: 'connect' }
    })

    expect(parseAppServerCliArgs(['remote-trust', '--host', 'h1', '--action', 'trust', '--path', '/tmp', '--label', 'Workspace'])).toEqual({
      ok: true,
      command: { kind: 'remote-trust', hostId: 'h1', action: 'trust', path: '/tmp', label: 'Workspace' }
    })

    expect(parseAppServerCliArgs(['remote-exec', '--host', 'h1', '--command', 'echo hello', '--cwd', '/tmp'])).toEqual({
      ok: true,
      command: { kind: 'remote-exec', hostId: 'h1', command: 'echo hello', cwd: '/tmp', timeoutMs: undefined, maxOutputBytes: undefined }
    })

    expect(parseAppServerCliArgs(['remote-stop', '--host', 'h1'])).toEqual({
      ok: true,
      command: { kind: 'remote-stop', hostId: 'h1' }
    })

    expect(parseAppServerCliArgs(['remote-resume', '--host', 'h1'])).toEqual({
      ok: true,
      command: { kind: 'remote-resume', hostId: 'h1' }
    })

    expect(parseAppServerCliArgs(['remote-audit', '--limit', '50'])).toEqual({
      ok: true,
      command: { kind: 'remote-audit', limit: 50 }
    })
  })

  it('rejects invalid remote runner CLI arguments', () => {
    expect(parseAppServerCliArgs(['remote-action'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('requires')
    })
    expect(parseAppServerCliArgs(['remote-action', '--host', 'h1', '--action', 'invalid'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('must be')
    })
    expect(parseAppServerCliArgs(['remote-trust', '--host', 'h1'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('requires')
    })
    expect(parseAppServerCliArgs(['remote-exec'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('requires')
    })
    expect(parseAppServerCliArgs(['remote-stop'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('requires')
    })
    expect(parseAppServerCliArgs(['remote-resume'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('requires')
    })
  })

  it('dispatches remote runner CLI commands to bridge methods', async () => {
    const remoteRunnerStatus = vi.fn(async () => ({
      ok: true,
      value: { hosts: [], enabled: false, auditLog: [] }
    }))
    const remoteRunnerAction = vi.fn(async () => ({
      ok: true,
      value: { ok: true, hostId: 'h1' }
    }))
    const remoteRunnerExec = vi.fn(async () => ({
      ok: true,
      value: { ok: true, runId: 'run_1', output: 'hello', exitCode: 0 }
    }))
    const remoteRunnerStop = vi.fn(async () => ({
      ok: true,
      value: { ok: true, hostId: 'h1', wasRunning: false }
    }))
    const remoteRunnerResume = vi.fn(async () => ({
      ok: true,
      value: { ok: true, hostId: 'h1', runId: 'run_2', restored: true }
    }))
    const remoteRunnerAuditLog = vi.fn(async () => ({
      ok: true,
      value: { entries: [] }
    }))

    const bridge = {
      remoteRunnerStatus,
      remoteRunnerAction,
      remoteRunnerExec,
      remoteRunnerStop,
      remoteRunnerResume,
      remoteRunnerAuditLog
    }

    const client = { host: '127.0.0.1', token: 'local-token' }

    let output = await runAppServerCliCommand(bridge as never, client, ['remote-status'])
    expect(JSON.parse(output)).toMatchObject({ ok: true })
    expect(remoteRunnerStatus).toHaveBeenCalledWith(client)

    output = await runAppServerCliCommand(bridge as never, client, ['remote-action', '--host', 'h1', '--action', 'connect'])
    expect(JSON.parse(output)).toMatchObject({ ok: true })
    expect(remoteRunnerAction).toHaveBeenCalledWith(client, { hostId: 'h1', action: 'connect' })

    output = await runAppServerCliCommand(bridge as never, client, ['remote-exec', '--host', 'h1', '--command', 'echo hello'])
    expect(JSON.parse(output)).toMatchObject({ ok: true })
    expect(remoteRunnerExec).toHaveBeenCalledWith(client, {
      hostId: 'h1',
      command: 'echo hello',
      cwd: undefined,
      timeoutMs: undefined,
      maxOutputBytes: undefined
    })

    output = await runAppServerCliCommand(bridge as never, client, ['remote-stop', '--host', 'h1'])
    expect(JSON.parse(output)).toMatchObject({ ok: true })
    expect(remoteRunnerStop).toHaveBeenCalledWith(client, { hostId: 'h1' })

    output = await runAppServerCliCommand(bridge as never, client, ['remote-resume', '--host', 'h1'])
    expect(JSON.parse(output)).toMatchObject({ ok: true })
    expect(remoteRunnerResume).toHaveBeenCalledWith(client, { hostId: 'h1' })

    output = await runAppServerCliCommand(bridge as never, client, ['remote-audit', '--limit', '10'])
    expect(JSON.parse(output)).toMatchObject({ ok: true })
    expect(remoteRunnerAuditLog).toHaveBeenCalledWith(client, { limit: 10 })
  })
})
