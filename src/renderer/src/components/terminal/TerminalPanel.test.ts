/**
 * @vitest-environment jsdom
 *
 * Mounted behaviour tests for TerminalPanel.
 * Every test exercises real React effects, subscriptions, and
 * user-action paths through @testing-library/react + jsdom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import React from 'react'

// ── Module-level mocks (vi.mock is hoisted) ──────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, _opts?: Record<string, unknown>) => key,
    i18n: { language: 'en' }
  })
}))

// @xterm/xterm — use a regular function (NOT arrow) so `new Terminal()` works.
// The factory is inline because vi.mock hoisting prevents referencing top-level vars.
const xtermInstances: Array<{
  open: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  onData: ReturnType<typeof vi.fn>
  onResize: ReturnType<typeof vi.fn>
  onDataHandler?: (data: string) => void
  onResizeHandler?: (size: { cols: number; rows: number }) => void
}> = []

vi.mock('@xterm/xterm', () => {
  function MockTerminalCtor(this: Record<string, unknown>) {
    this.open = vi.fn()
    this.write = vi.fn()
    this.focus = vi.fn()
    this.dispose = vi.fn()
    this.onData = vi.fn((handler: (data: string) => void) => {
      this.onDataHandler = handler as unknown as Record<string, unknown>
    })
    this.onResize = vi.fn((handler: (size: { cols: number; rows: number }) => void) => {
      this.onResizeHandler = handler as unknown as Record<string, unknown>
    })
    xtermInstances.push(this as unknown as (typeof xtermInstances)[number])
  }
  return { Terminal: vi.fn(MockTerminalCtor) }
})

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

// ── Imports under test ───────────────────────────────────────────

import { TerminalPanel } from './TerminalPanel'
import { Terminal as MockTerminal } from '@xterm/xterm'

// ── Helpers ──────────────────────────────────────────────────────

type SseEventHandler = (payload: { streamId: string; data: unknown }) => void
type TerminalDataHandler = (payload: { sessionId: string; data: string }) => void

interface MockDsGui {
  platform: string
  terminalGetSettings: ReturnType<typeof vi.fn>
  terminalSpawn: ReturnType<typeof vi.fn>
  terminalKill: ReturnType<typeof vi.fn>
  terminalWrite: ReturnType<typeof vi.fn>
  terminalResize: ReturnType<typeof vi.fn>
  terminalGetAuditEvents: ReturnType<typeof vi.fn>
  terminalAgentExecObserved: ReturnType<typeof vi.fn>
  terminalList: ReturnType<typeof vi.fn>
  onSseEvent: (handler: SseEventHandler) => () => void
  onTerminalData: (handler: TerminalDataHandler) => () => void
  _sseHandlers: SseEventHandler[]
  _terminalDataHandlers: TerminalDataHandler[]
}

function createMockDsGui(overrides: Partial<MockDsGui> = {}): MockDsGui {
  const sseHandlers: SseEventHandler[] = []
  const terminalDataHandlers: TerminalDataHandler[] = []

  return {
    platform: 'darwin',
    terminalGetSettings: vi.fn(),
    terminalSpawn: vi.fn(),
    terminalKill: vi.fn(),
    terminalWrite: vi.fn(),
    terminalResize: vi.fn(),
    terminalGetAuditEvents: vi.fn(),
    terminalAgentExecObserved: vi.fn().mockResolvedValue({ ok: true }),
    terminalList: vi.fn(),
    onSseEvent: (handler: SseEventHandler) => {
      sseHandlers.push(handler)
      return () => {
        const idx = sseHandlers.indexOf(handler)
        if (idx >= 0) sseHandlers.splice(idx, 1)
      }
    },
    onTerminalData: (handler: TerminalDataHandler) => {
      terminalDataHandlers.push(handler)
      return () => {
        const idx = terminalDataHandlers.indexOf(handler)
        if (idx >= 0) terminalDataHandlers.splice(idx, 1)
      }
    },
    _sseHandlers: sseHandlers,
    _terminalDataHandlers: terminalDataHandlers,
    ...overrides
  }
}

function fireSseEvent(data: unknown, mock: MockDsGui): void {
  for (const handler of mock._sseHandlers) {
    handler({ streamId: 'sse-1', data })
  }
}

function fireTerminalData(
  payload: { sessionId: string; data: string },
  mock: MockDsGui
): void {
  for (const handler of mock._terminalDataHandlers) {
    handler(payload)
  }
}

function deferred<T>(): [Promise<T>, (value: T) => void, (reason: unknown) => void] {
  let resolve!: (v: T) => void
  let reject!: (r: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return [promise, resolve, reject]
}

function makeCommandExecEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'item_created',
    seq: 1,
    threadId: 'thread-1',
    turnId: 'turn-1',
    item: {
      id: overrides.itemId ?? 'item_bash_1',
      turnId: 'turn-1',
      threadId: 'thread-1',
      role: 'tool',
      status: 'completed',
      createdAt: '2026-06-12T00:00:00.000Z',
      kind: 'tool_result',
      toolName: 'bash',
      toolKind: 'command_execution',
      callId: overrides.callId ?? 'call_bash_1',
      output: {
        command: 'npm run build',
        stdout: 'Build succeeded\n',
        exit_code: 0
      },
      ...(overrides.item as Record<string, unknown> ?? {})
    },
    ...overrides
  }
}

// ── Test suite ───────────────────────────────────────────────────

describe('TerminalPanel (mounted)', () => {
  let mock: MockDsGui

  beforeEach(() => {
    xtermInstances.length = 0
    ;(MockTerminal as unknown as ReturnType<typeof vi.fn>).mockClear()
    mock = createMockDsGui()
    mock.terminalGetSettings.mockResolvedValue({ enabled: true })
    ;(window as unknown as Record<string, unknown>).dsGui = mock
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (window as unknown as Record<string, unknown>).dsGui
  })

  // ==============================================================
  // Settings loading
  // ==============================================================

  describe('settings loading', () => {
    it('calls terminalGetSettings on mount and resolves to agent empty state', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      expect(mock.terminalGetSettings).toHaveBeenCalledTimes(1)

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      expect(screen.getByText('terminalAgentEmpty')).toBeInTheDocument()
      expect(screen.getByText('terminalAgentEmptyDesc')).toBeInTheDocument()
    })

    it('shows loading state while settings are pending, resolves to agent view', async () => {
      const [promise, resolve] = deferred<{ enabled: boolean }>()
      mock.terminalGetSettings.mockReturnValue(promise)

      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      expect(screen.getByText('loading')).toBeInTheDocument()

      resolve({ enabled: true })

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      expect(screen.getByText('terminalAgentEmpty')).toBeInTheDocument()
    })
  })

  // ==============================================================
  // Disabled state
  // ==============================================================

  describe('disabled state', () => {
    it('renders with disabled add-session button when terminal is disabled', async () => {
      mock.terminalGetSettings.mockResolvedValue({ enabled: false })

      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      const addBtn = screen.getByLabelText('terminalAddSession')
      expect(addBtn).toBeDisabled()
      expect(screen.getByText('terminalAgentEmpty')).toBeInTheDocument()
    })
  })

  // ==============================================================
  // Error state
  // ==============================================================

  describe('error state', () => {
    it('renders error view when settings promise rejects', async () => {
      mock.terminalGetSettings.mockRejectedValue(new Error('fail'))

      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.getByText('terminalSettingsError')).toBeInTheDocument()
      })
    })

    it('shows error text with red styling on rejection', async () => {
      mock.terminalGetSettings.mockRejectedValue(new Error('denied'))

      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.getByText('terminalSettingsError')).toBeInTheDocument()
      })

      const errorEl = screen.getByText('terminalSettingsError')
      expect(errorEl.className).toContain('red')
    })
  })

  // ==============================================================
  // SSE subscription & cleanup
  // ==============================================================

  describe('SSE subscription', () => {
    it('registers onSseEvent handler on mount', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      expect(mock._sseHandlers.length).toBe(1)
    })

    it('removes onSseEvent handler on unmount (cleanup)', async () => {
      const { unmount } = render(
        React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' })
      )

      await waitFor(() => {
        expect(mock._sseHandlers.length).toBe(1)
      })

      unmount()
      expect(mock._sseHandlers.length).toBe(0)
    })
  })

  // ==============================================================
  // SSE event → agent output + audit
  // ==============================================================
  // NOTE: fireSseEvent triggers handlers synchronously but
  // dispatchKunRuntimeEvent is async. Use waitFor to poll for
  // React state updates. Avoid act() here — it tracks all pending
  // async work including the fire-and-forget dispatch promise and
  // can hang.

  describe('SSE command_execution → agent output + audit', () => {
    it('adds visible agent output when a command_execution event fires', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      fireSseEvent(makeCommandExecEvent(), mock)

      await waitFor(() => {
        expect(screen.getByText(/Build succeeded/)).toBeInTheDocument()
      })
    })

    it('calls terminalAgentExecObserved once per item id with truncated payload', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      fireSseEvent(makeCommandExecEvent(), mock)

      await waitFor(() => {
        expect(mock.terminalAgentExecObserved).toHaveBeenCalledTimes(1)
      })

      const call = mock.terminalAgentExecObserved.mock.calls[0][0]
      expect(call.toolKind).toBe('command_execution')
      expect(call.toolName).toBe('bash')
      expect(typeof call.summary).toBe('string')
      expect(call.summary.length).toBeLessThanOrEqual(500)
    })

    it('ignores events without an item property (no crash, no audit)', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      fireSseEvent({ kind: 'usage', seq: 1 }, mock)

      // Let any microtasks flush, then verify no audit was emitted
      await new Promise((r) => setTimeout(r, 50))
      expect(mock.terminalAgentExecObserved).not.toHaveBeenCalled()
      expect(screen.getByText('terminalAgentEmpty')).toBeInTheDocument()
    })

    it('ignores non-command_execution tool events (no audit)', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      fireSseEvent(
        {
          kind: 'item_created',
          seq: 1,
          item: {
            id: 'item_file_1',
            turnId: 'turn-1',
            threadId: 'thread-1',
            role: 'tool',
            status: 'completed',
            createdAt: '2026-06-12T00:00:00.000Z',
            kind: 'tool_result',
            toolName: 'write',
            toolKind: 'file_change',
            callId: 'call_file',
            output: { path: '/tmp/file.ts' }
          }
        },
        mock
      )

      expect(mock.terminalAgentExecObserved).not.toHaveBeenCalled()
      expect(screen.getByText('terminalAgentEmpty')).toBeInTheDocument()
    })
  })

  // ==============================================================
  // Audit dedup
  // ==============================================================

  describe('audit dedup', () => {
    it('only calls terminalAgentExecObserved once when same item ID fires multiple SSE events', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      const item = {
        id: 'item_dedup',
        turnId: 'turn-1',
        threadId: 'thread-1',
        role: 'tool' as const,
        status: 'running' as const,
        createdAt: '2026-06-12T00:00:00.000Z',
        kind: 'tool_result' as const,
        toolName: 'bash',
        toolKind: 'command_execution' as const,
        callId: 'call_dedup',
        output: { command: 'ls', stdout: 'a\nb\n' }
      }

      fireSseEvent(
        { kind: 'item_created', seq: 1, threadId: 'thread-1', turnId: 'turn-1', item },
        mock
      )

      await waitFor(() => {
        expect(mock.terminalAgentExecObserved).toHaveBeenCalledTimes(1)
      })

      fireSseEvent(
        {
          kind: 'item_updated',
          seq: 2,
          threadId: 'thread-1',
          turnId: 'turn-1',
          item: { ...item, status: 'completed' as const }
        },
        mock
      )

      // Still only one audit call — dedup via auditedRef
      expect(mock.terminalAgentExecObserved).toHaveBeenCalledTimes(1)
    })

    it('does not prevent audit for different item IDs', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      // Different callId produces different tool block ids, so dedup won't kick in
      fireSseEvent(makeCommandExecEvent({ itemId: 'item_A', callId: 'call_A' }), mock)

      await waitFor(() => {
        expect(mock.terminalAgentExecObserved).toHaveBeenCalledTimes(1)
      })

      fireSseEvent(makeCommandExecEvent({ itemId: 'item_B', callId: 'call_B' }), mock)

      await waitFor(() => {
        expect(mock.terminalAgentExecObserved).toHaveBeenCalledTimes(2)
      })
    })
  })

  // ==============================================================
  // onTerminalData subscription
  // ==============================================================

  describe('onTerminalData subscription', () => {
    it('registers onTerminalData handler on mount', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      expect(mock._terminalDataHandlers.length).toBe(1)
    })

    it('removes onTerminalData handler on unmount', async () => {
      const { unmount } = render(
        React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' })
      )

      await waitFor(() => {
        expect(mock._terminalDataHandlers.length).toBe(1)
      })

      unmount()
      expect(mock._terminalDataHandlers.length).toBe(0)
    })
  })

  // ==============================================================
  // Add session → xterm creation + data write
  // ==============================================================

  describe('add session', () => {
    it('clicking add session calls terminalSpawn with workspaceRoot', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/myproject' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      mock.terminalSpawn.mockResolvedValue({
        ok: true,
        sessionId: 'sess_1',
        cols: 80,
        rows: 24
      })

      const addBtn = screen.getByLabelText('terminalAddSession')
      fireEvent.click(addBtn)

      await waitFor(() => {
        expect(mock.terminalSpawn).toHaveBeenCalledWith('/tmp/myproject')
      })
    })

    it('creates a user tab after successful spawn', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      mock.terminalSpawn.mockResolvedValue({
        ok: true,
        sessionId: 'sess_1',
        cols: 80,
        rows: 24
      })

      const addBtn = screen.getByLabelText('terminalAddSession')
      fireEvent.click(addBtn)

      await waitFor(() => {
        expect(screen.getByText('terminalUserTabTitle')).toBeInTheDocument()
      })
    })

    it('constructs xterm and opens it after add session', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      mock.terminalSpawn.mockResolvedValue({
        ok: true,
        sessionId: 'sess_1',
        cols: 120,
        rows: 40
      })

      const addBtn = screen.getByLabelText('terminalAddSession')
      fireEvent.click(addBtn)

      // xterm should be constructed via useLayoutEffect after re-render
      await waitFor(() => {
        expect(MockTerminal).toHaveBeenCalled()
      })

      expect(xtermInstances.length).toBeGreaterThanOrEqual(1)
      const xterm = xtermInstances[0]!
      expect(xterm.open).toHaveBeenCalled()
      expect(xterm.onData).toHaveBeenCalled()
      expect(xterm.onResize).toHaveBeenCalled()
    })

    it('writes terminal data for current session to xterm', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      mock.terminalSpawn.mockResolvedValue({
        ok: true,
        sessionId: 'sess_1',
        cols: 80,
        rows: 24
      })

      const addBtn = screen.getByLabelText('terminalAddSession')
      fireEvent.click(addBtn)

      await waitFor(() => {
        expect(xtermInstances.length).toBeGreaterThanOrEqual(1)
      })

      fireTerminalData({ sessionId: 'sess_1', data: 'hello world' }, mock)

      const xterm = xtermInstances[0]!
      expect(xterm.write).toHaveBeenCalledWith('hello world')
    })

    it('does NOT write terminal data for non-current session to xterm', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      mock.terminalSpawn.mockResolvedValue({
        ok: true,
        sessionId: 'sess_1',
        cols: 80,
        rows: 24
      })

      const addBtn = screen.getByLabelText('terminalAddSession')
      fireEvent.click(addBtn)

      await waitFor(() => {
        expect(xtermInstances.length).toBeGreaterThanOrEqual(1)
      })

      const xterm = xtermInstances[0]!

      fireTerminalData({ sessionId: 'sess_other', data: 'should not write' }, mock)

      expect(xterm.write).not.toHaveBeenCalledWith('should not write')
      expect(xterm.write).not.toHaveBeenCalled()
    })

    it('shows spawn error message when terminalSpawn returns !ok', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      mock.terminalSpawn.mockResolvedValue({
        ok: false,
        message: 'PTY allocation failed'
      })

      const addBtn = screen.getByLabelText('terminalAddSession')
      fireEvent.click(addBtn)

      await waitFor(() => {
        expect(screen.getByText('PTY allocation failed')).toBeInTheDocument()
      })
    })

    it('shows spawn error when terminalSpawn throws', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      mock.terminalSpawn.mockRejectedValue(new Error('IPC timeout'))

      const addBtn = screen.getByLabelText('terminalAddSession')
      fireEvent.click(addBtn)

      await waitFor(() => {
        expect(screen.getByText('IPC timeout')).toBeInTheDocument()
      })
    })
  })

  // ==============================================================
  // Missing dsGui API — graceful fallback
  // ==============================================================

  describe('missing dsGui API', () => {
    it('stops loading without crash when dsGui is absent', async () => {
      delete (window as unknown as Record<string, unknown>).dsGui

      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      // Without dsGui, loading is set to false immediately (no API call)
      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      // Should render the main view (agent empty state)
      expect(screen.getByText('terminalAgentEmpty')).toBeInTheDocument()
    })
  })

  // ==============================================================
  // Structural / regression guards
  // ==============================================================

  describe('structural integrity', () => {
    it('does not throw when workspaceRoot is empty', async () => {
      ;(window as unknown as Record<string, unknown>).dsGui = mock
      render(React.createElement(TerminalPanel, { workspaceRoot: '' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      expect(screen.getByText('terminalAgentEmpty')).toBeInTheDocument()
    })

    it('does not throw with a long workspaceRoot', async () => {
      ;(window as unknown as Record<string, unknown>).dsGui = mock
      render(React.createElement(TerminalPanel, { workspaceRoot: '/'.repeat(4000) }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      expect(screen.getByText('terminalAgentEmpty')).toBeInTheDocument()
    })

    it('has the ds-no-drag class on the root container', async () => {
      render(React.createElement(TerminalPanel, { workspaceRoot: '/tmp/test' }))

      await waitFor(() => {
        expect(screen.queryByText('loading')).not.toBeInTheDocument()
      })

      const root = document.querySelector('.ds-no-drag')
      expect(root).not.toBeNull()
      expect(root?.className).toContain('backdrop-blur-xl')
    })
  })
})
