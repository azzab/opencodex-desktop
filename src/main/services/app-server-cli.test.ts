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
})
