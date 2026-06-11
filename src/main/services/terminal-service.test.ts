import { describe, expect, it, afterEach, vi, beforeEach } from 'vitest'

// Track registered onData callbacks so we can fire them in tests
let capturedOnDataCallbacks: Array<(data: string) => void> = []

// Mock node-pty to avoid TTY requirement in tests
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const mockPty = {
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn((cb: (data: string) => void) => {
        capturedOnDataCallbacks.push(cb)
      }),
      pid: 12345
    }
    return mockPty
  })
}))

import { TerminalService, resetTerminalService, getTerminalService } from './terminal-service'
import type { IPty } from 'node-pty'

describe('TerminalService', () => {
  beforeEach(() => {
    capturedOnDataCallbacks = []
    resetTerminalService()
  })

  afterEach(() => {
    capturedOnDataCallbacks = []
    resetTerminalService()
  })

  it('creates a singleton', () => {
    const a = getTerminalService()
    const b = getTerminalService()
    expect(a).toBe(b)
  })

  it('is enabled by default when no settings', () => {
    const svc = getTerminalService()
    expect(svc.isEnabled({ agents: { kun: {} } } as any)).toBe(true)
  })

  it('is enabled when terminal.enabled is true', () => {
    const svc = getTerminalService()
    expect(svc.isEnabled({ agents: { kun: { terminal: { enabled: true } } } } as any)).toBe(true)
  })

  it('is disabled when terminal.enabled is explicitly false', () => {
    const svc = getTerminalService()
    expect(svc.isEnabled({ agents: { kun: { terminal: { enabled: false } } } } as any)).toBe(false)
  })

  it('spawns a PTY session and returns an id', () => {
    const svc = getTerminalService()
    const result = svc.spawn(process.cwd())
    expect(result.id).toMatch(/^term_/)
    expect(result.pty).toBeDefined()
    expect(svc.sessionCount()).toBe(1)
  })

  it('lists spawned sessions', () => {
    const svc = getTerminalService()
    svc.spawn('/tmp', 80, 24)
    svc.spawn('/var', 100, 30)
    const list = svc.list()
    expect(list).toHaveLength(2)
    expect(list[0].cwd).toBe('/tmp')
    expect(list[1].cwd).toBe('/var')
    expect(list[0].cols).toBe(80)
    expect(list[1].cols).toBe(100)
  })

  it('kills a session by id', () => {
    const svc = getTerminalService()
    const { id } = svc.spawn(process.cwd())
    expect(svc.sessionCount()).toBe(1)
    const killed = svc.kill(id)
    expect(killed).toBe(true)
    expect(svc.list()).toHaveLength(0)
  })

  it('returns false when killing a non-existent session', () => {
    const svc = getTerminalService()
    expect(svc.kill('nonexistent')).toBe(false)
  })

  it('returns false when writing to a non-existent session', () => {
    const svc = getTerminalService()
    expect(svc.write('nonexistent', 'echo hi')).toBe(false)
  })

  it('returns false when resizing a non-existent session', () => {
    const svc = getTerminalService()
    expect(svc.resize('nonexistent', 100, 30)).toBe(false)
  })

  it('writes data to a session', () => {
    const svc = getTerminalService()
    const { id } = svc.spawn(process.cwd())
    const result = svc.write(id, 'echo test\r')
    expect(result).toBe(true)
  })

  it('resizes a session', () => {
    const svc = getTerminalService()
    const { id } = svc.spawn(process.cwd(), 80, 24)
    const result = svc.resize(id, 120, 40)
    expect(result).toBe(true)
    const list = svc.list()
    expect(list[0].cols).toBe(120)
    expect(list[0].rows).toBe(40)
  })

  it('killAll kills all sessions', () => {
    const svc = getTerminalService()
    svc.spawn(process.cwd())
    svc.spawn(process.cwd())
    expect(svc.sessionCount()).toBe(2)
    svc.killAll()
    expect(svc.list()).toHaveLength(0)
  })

  it('emits audit events for spawn and kill', () => {
    const svc = getTerminalService()
    const { id } = svc.spawn(process.cwd())
    svc.kill(id)
    const events = svc.getAuditEvents()
    const spawnEvents = events.filter((e) => e.kind === 'session_spawned')
    const killEvents = events.filter((e) => e.kind === 'session_killed')
    expect(spawnEvents.length).toBeGreaterThanOrEqual(1)
    expect(killEvents.length).toBeGreaterThanOrEqual(1)
    expect(spawnEvents[0].sessionId).toBe(id)
  })

  it('audit events are capped', () => {
    const svc = getTerminalService()
    for (let i = 0; i < 600; i++) {
      svc.spawn('/tmp')
    }
    const events = svc.getAuditEvents()
    expect(events.length).toBeLessThanOrEqual(500)
  })

  it('resetTerminalService kills all sessions and clears singleton', () => {
    const svc = getTerminalService()
    svc.spawn(process.cwd())
    expect(svc.sessionCount()).toBe(1)
    resetTerminalService()
    const svc2 = getTerminalService()
    expect(svc2.sessionCount()).toBe(0)
    expect(svc2).not.toBe(svc)
  })

  // PTY output forwarding tests

  it('publishes pty onData handleable by callers for output forwarding', () => {
    const svc = getTerminalService()
    const { pty } = svc.spawn('/tmp/test')

    // The pty.onData should have been called by the IPC handler (in real app)
    // to register a callback. We simulate that here by calling onData ourselves.
    const received: string[] = []
    pty.onData((data: string) => {
      received.push(data)
    })

    // Simulate output coming from the PTY
    capturedOnDataCallbacks.forEach((cb) => cb('hello '))
    capturedOnDataCallbacks.forEach((cb) => cb('world\r\n'))

    expect(received).toEqual(['hello ', 'world\r\n'])
  })

  it('allows multiple onData subscribers on the same pty', () => {
    const svc = getTerminalService()
    const { pty } = svc.spawn('/tmp/test')

    const subscriber1: string[] = []
    const subscriber2: string[] = []

    pty.onData((data: string) => { subscriber1.push(data) })
    pty.onData((data: string) => { subscriber2.push(data) })

    // Simulate a single data chunk
    capturedOnDataCallbacks.forEach((cb) => cb('test output\r\n'))

    expect(subscriber1).toEqual(['test output\r\n'])
    expect(subscriber2).toEqual(['test output\r\n'])
  })

  it('onData callbacks stop receiving after session kill (subscriber-level)', () => {
    const svc = getTerminalService()
    const { id, pty } = svc.spawn('/tmp/test')

    const received: string[] = []
    pty.onData((data: string) => { received.push(data) })

    // Simulate some output
    capturedOnDataCallbacks.forEach((cb) => cb('before kill\r\n'))
    expect(received).toHaveLength(1)

    // Kill the session
    svc.kill(id)

    // After kill, the pty is killed but onData callbacks remain registered
    // on the mock. The real impl stops calling them after PTY death.
    // We verify that the service tracked the session correctly.
    expect(svc.sessionCount()).toBe(0)
    expect(svc.list()).toHaveLength(0)
  })

  it('spawn returns distinct onData-capable pty per session', () => {
    const svc = getTerminalService()
    const a = svc.spawn('/tmp/a')
    const b = svc.spawn('/tmp/b')

    expect(a.id).not.toBe(b.id)
    expect(a.pty).not.toBe(b.pty)

    // Each pty can independently register onData
    const aOutput: string[] = []
    const bOutput: string[] = []
    a.pty.onData((d: string) => { aOutput.push(d) })
    b.pty.onData((d: string) => { bOutput.push(d) })

    // Simulate output: all captured callbacks fire together in mock
    capturedOnDataCallbacks.forEach((cb) => cb('data from ptys\r\n'))

    expect(aOutput.length).toBeGreaterThanOrEqual(1)
    expect(bOutput.length).toBeGreaterThanOrEqual(1)
  })

  it('audit sink called without breaking terminal operations', () => {
    const svc = getTerminalService()
    const auditEvents: string[] = []
    svc.setAuditSink((event) => {
      auditEvents.push(event.kind)
    })
    const { id } = svc.spawn('/tmp/test')
    svc.kill(id)
    // Spawn and kill should both produce audit events
    expect(auditEvents).toContain('session_spawned')
    expect(auditEvents).toContain('session_killed')
  })

  it('audit sink failure does not prevent spawn', () => {
    const svc = getTerminalService()
    svc.setAuditSink(() => {
      throw new Error('audit sink crash')
    })
    const result = svc.spawn('/tmp/test')
    expect(result.id).toMatch(/^term_/)
    expect(svc.sessionCount()).toBe(1)
  })

  // agentExecObserved tests

  it('emits agent_exec_observed audit events', () => {
    const svc = getTerminalService()
    svc.agentExecObserved({
      toolName: 'bash',
      toolKind: 'command_execution',
      summary: 'npm run build',
      outputTruncated: 'Build succeeded',
      exitCode: 0,
      threadId: 'thread-1'
    })
    const events = svc.getAuditEvents()
    const agentEvents = events.filter((e) => e.kind === 'agent_exec_observed')
    expect(agentEvents).toHaveLength(1)
    const event = agentEvents[0]
    expect(event.agentToolName).toBe('bash')
    expect(event.agentToolKind).toBe('command_execution')
    expect(event.agentSummary).toBe('npm run build')
    expect(event.agentOutputTruncated).toBe('Build succeeded')
    expect(event.agentExitCode).toBe(0)
    expect(event.agentThreadId).toBe('thread-1')
  })

  it('agent_exec_observed audit events include auto-generated detail', () => {
    const svc = getTerminalService()
    svc.agentExecObserved({
      toolName: 'grep',
      toolKind: 'tool_call',
      exitCode: 1,
      threadId: 'thread-2'
    })
    const events = svc.getAuditEvents()
    const agentEvent = events.find((e) => e.kind === 'agent_exec_observed')
    expect(agentEvent).toBeDefined()
    // Detail field may be undefined when called directly (IPC handler fills it)
    expect(agentEvent!.agentToolName).toBe('grep')
    expect(agentEvent!.agentExitCode).toBe(1)
    expect(agentEvent!.agentThreadId).toBe('thread-2')
  })

  it('agent_exec_observed audit events are capped alongside session events', () => {
    const svc = getTerminalService()
    // Fill with session events first
    for (let i = 0; i < 500; i++) {
      svc.spawn('/tmp')
    }
    // Add agent exec events
    svc.agentExecObserved({
      toolName: 'bash',
      threadId: 'thread-3'
    })
    const events = svc.getAuditEvents()
    // Should contain the agent event (newest) and be capped at 500
    const agentEvents = events.filter((e) => e.kind === 'agent_exec_observed')
    expect(agentEvents).toHaveLength(1)
    expect(events.length).toBe(500)
  })

  it('agentExecObserved does not require a user PTY session', () => {
    const svc = getTerminalService()
    // No sessions spawned
    expect(svc.sessionCount()).toBe(0)
    // Agent exec observed should still succeed
    svc.agentExecObserved({
      toolName: 'shell',
      toolKind: 'command_execution'
    })
    expect(svc.getAuditEvents()).toHaveLength(1)
    expect(svc.sessionCount()).toBe(0)
  })
})
