import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { Terminal as XtermTerminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Plus, Trash2, Terminal as TerminalIcon, Activity, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CoreRuntimeEventJson } from '../../agent/kun-contract'
import type { ThreadEventSink } from '../../agent/types'
import { dispatchKunRuntimeEvent } from '../../agent/kun-mapper'

const AGENT_OUTPUT_TRUNCATE_AUDIT = 500

type UserTab = {
  id: string
  sessionId: string
  title: string
}

type AgentActivityEntry = {
  id: string
  threadId: string
  toolName: string
  output: string
  isError: boolean
  timestamp: string
}

type TerminalTab = 'agent' | { kind: 'user'; tabId: string }

type TerminalPanelProps = {
  workspaceRoot: string
  className?: string
}

function xtermTheme(): Record<string, string> {
  return {
    background: '#1a1b26',
    foreground: '#a9b1d6',
    cursor: '#c0caf5',
    cursorAccent: '#1a1b26',
    selectionBackground: '#33467c',
    black: '#32344a',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#ad8ee6',
    cyan: '#449dab',
    white: '#787c99',
    brightBlack: '#444b6a',
    brightRed: '#ff7a93',
    brightGreen: '#b9f27c',
    brightYellow: '#ff9e64',
    brightBlue: '#7da6ff',
    brightMagenta: '#bb9af7',
    brightCyan: '#0db9d7',
    brightWhite: '#acb0d0'
  }
}

function truncateOutput(output: string, maxLen: number): string {
  if (output.length <= maxLen) return output
  return output.slice(0, maxLen) + '…'
}

/**
 * Create a lightweight ThreadEventSink that captures only
 * command_execution tool events for the agent-activity panel.
 * Uses the same Kun mapper dispatch path as the chat timeline.
 */
function createAgentActivitySink(
  onEntry: (entry: AgentActivityEntry) => void
): ThreadEventSink {
  return {
    onSeq: () => undefined,
    onDeltas: () => undefined,
    onUserMessage: () => undefined,
    onTool: (ev) => {
      if (ev.toolKind !== 'command_execution') return
      const detail = ev.detail ?? ''
      const command = typeof ev.meta?.command === 'string' ? ev.meta.command : undefined
      const outputStr = detail || command || ev.summary || ''
      if (!outputStr && ev.status !== 'running') return
      onEntry({
        id: ev.itemId,
        threadId: typeof ev.meta?.threadId === 'string' ? ev.meta.threadId : '',
        toolName: typeof ev.meta?.toolName === 'string' ? ev.meta.toolName : 'bash',
        output: outputStr,
        isError: ev.status === 'error',
        timestamp: new Date().toISOString()
      })
    },
    onCompaction: () => undefined,
    onApproval: () => undefined,
    onUserInput: () => undefined,
    onUserInputStatus: () => undefined,
    onGoal: () => undefined,
    onTodos: () => undefined,
    onTurnComplete: () => undefined,
    onError: () => undefined
  }
}

export function TerminalPanel({ workspaceRoot }: TerminalPanelProps): ReactElement {
  const { t } = useTranslation('common')
  const [activeTab, setActiveTab] = useState<TerminalTab>('agent')
  const [userTabs, setUserTabs] = useState<UserTab[]>([])
  const [nextTabNumber, setNextTabNumber] = useState(1)
  const [agentEntries, setAgentEntries] = useState<AgentActivityEntry[]>([])
  const [terminalEnabled, setTerminalEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const xtermRef = useRef<XtermTerminal | null>(null)
  const xtermContainerRef = useRef<HTMLDivElement>(null)
  const currentSessionRef = useRef<string | null>(null)
  const sseCleanupRef = useRef<(() => void) | null>(null)
  const pendingPtyRef = useRef<{ sessionId: string; cols: number; rows: number } | null>(null)

  // Dedup: track which item IDs have already been audited so partial
  // updates do not spam unbounded duplicate audit events.
  const auditedRef = useRef<Set<string>>(new Set())

  // Check terminal settings on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (typeof window !== 'undefined' && window.dsGui?.terminalGetSettings) {
      window.dsGui.terminalGetSettings()
        .then((result) => {
          if (!cancelled) {
            setTerminalEnabled(result.enabled)
            setLoading(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(t('terminalSettingsError'))
            setLoading(false)
          }
        })
    } else {
      setLoading(false)
    }
    return () => { cancelled = true }
  }, [t])

  // Subscribe to SSE events using the Kun mapper dispatch path.
  // The same normalized command_execution tool events the chat timeline
  // uses flow through this sink so the panel stays in sync.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.dsGui?.onSseEvent) return

    const sink = createAgentActivitySink((entry) => {
      setAgentEntries((prev) => {
        const next = [...prev]
        // Upsert: replace existing entry with same id (handles partial→complete updates)
        const existingIdx = next.findIndex((e) => e.id === entry.id)
        if (existingIdx >= 0) {
          next[existingIdx] = entry
        } else {
          next.push(entry)
        }
        // Keep last 500 entries
        return next.slice(-500)
      })

      // Emit audit event when rendering agent command output.
      // Only audit each item once (dedup by id) and truncate output
      // to bound audit payload size.
      const alreadyAudited = auditedRef.current.has(entry.id)
      if (!alreadyAudited && typeof window !== 'undefined' && window.dsGui?.terminalAgentExecObserved) {
        auditedRef.current.add(entry.id)
        // Prevent unbounded set growth
        if (auditedRef.current.size > 2000) {
          auditedRef.current = new Set([...auditedRef.current].slice(-1000))
        }
        window.dsGui.terminalAgentExecObserved({
          threadId: entry.threadId || undefined,
          toolName: entry.toolName || undefined,
          toolKind: 'command_execution',
          summary: truncateOutput(entry.output, AGENT_OUTPUT_TRUNCATE_AUDIT),
          exitCode: entry.isError ? 1 : 0
        }).catch(() => { /* audit fire-and-forget */ })
      }
    })

    const cleanup = window.dsGui.onSseEvent((payload) => {
      try {
        const data = payload.data
        if (!data || typeof data !== 'object') return
        const event = data as CoreRuntimeEventJson
        // Only process events that carry an item with tool data
        if (!event.item) return
        void dispatchKunRuntimeEvent(event, sink, async () => undefined)
      } catch {
        // Silently ignore malformed SSE events
      }
    })
    sseCleanupRef.current = cleanup
    return () => { cleanup() }
  }, [])

  // Cleanup xterm on tab switch
  const disposeXterm = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.dispose()
      xtermRef.current = null
    }
    currentSessionRef.current = null
  }, [])

  // Subscribe to PTY output from main process and write to xterm
  useEffect(() => {
    if (typeof window === 'undefined' || !window.dsGui?.onTerminalData) return

    const cleanup = window.dsGui.onTerminalData((payload) => {
      if (payload.sessionId === currentSessionRef.current && xtermRef.current) {
        xtermRef.current.write(payload.data)
      }
    })
    return cleanup
  }, [])

  // Setup xterm for user PTY tab
  const setupXterm = useCallback((sessionId: string, cols: number, rows: number) => {
    disposeXterm()

    if (!xtermContainerRef.current) return
    const container = xtermContainerRef.current

    const term = new XtermTerminal({
      theme: xtermTheme(),
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      cursorBlink: true,
      cursorStyle: 'bar',
      cols,
      rows,
      allowProposedApi: true
    })

    term.open(container)
    term.focus()

    // Send input to PTY
    term.onData((data) => {
      if (typeof window !== 'undefined' && window.dsGui?.terminalWrite) {
        window.dsGui.terminalWrite(sessionId, data).catch(() => {})
      }
    })

    // Resize handler
    term.onResize(({ cols: newCols, rows: newRows }) => {
      if (typeof window !== 'undefined' && window.dsGui?.terminalResize) {
        window.dsGui.terminalResize(sessionId, newCols, newRows).catch(() => {})
      }
    })

    xtermRef.current = term
    currentSessionRef.current = sessionId

    // Focus after a short delay to ensure DOM is ready
    setTimeout(() => term.focus(), 100)
  }, [disposeXterm])

  // Spawn a new user PTY tab
  const addUserTab = useCallback(async () => {
    if (typeof window === 'undefined' || !window.dsGui?.terminalSpawn) return

    setError(null)
    try {
      const result = await window.dsGui.terminalSpawn(workspaceRoot)
      if (!result.ok) {
        setError(result.message)
        return
      }

      const tabId = `tab_${Date.now()}`
      const newTab: UserTab = {
        id: tabId,
        sessionId: result.sessionId,
        title: t('terminalUserTabTitle', { number: nextTabNumber })
      }

      setUserTabs((prev) => [...prev, newTab])
      setNextTabNumber((n) => n + 1)
      setActiveTab({ kind: 'user', tabId })
      pendingPtyRef.current = { sessionId: result.sessionId, cols: result.cols, rows: result.rows }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('terminalSpawnError'))
    }
  }, [workspaceRoot, t, nextTabNumber])

  // Close a user PTY tab
  const closeUserTab = useCallback(async (tabId: string) => {
    const tab = userTabs.find((t) => t.id === tabId)
    if (tab) {
      if (typeof window !== 'undefined' && window.dsGui?.terminalKill) {
        await window.dsGui.terminalKill(tab.sessionId).catch(() => {})
      }
    }

    setUserTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      if (activeTab && typeof activeTab !== 'string' && activeTab.tabId === tabId) {
        setActiveTab(next.length > 0 ? { kind: 'user', tabId: next[0].id } : 'agent')
      }
      return next
    })

    if (currentSessionRef.current === tab?.sessionId) {
      disposeXterm()
    }
  }, [userTabs, activeTab, disposeXterm])

  // Set up xterm when active tab changes to a user PTY tab.
  // Must run after DOM paint so xtermContainerRef is populated.
  useLayoutEffect(() => {
    if (typeof activeTab === 'string') return
    if (!xtermContainerRef.current) return
    const userTab = userTabs.find((t) => t.id === activeTab.tabId)
    if (!userTab) return
    if (currentSessionRef.current === userTab.sessionId && xtermRef.current) return

    // New tab spawned via addUserTab — use the exact cols/rows from PTY
    if (pendingPtyRef.current) {
      const { sessionId, cols, rows } = pendingPtyRef.current
      pendingPtyRef.current = null
      setupXterm(sessionId, cols, rows)
      return
    }

    // Switching to an existing tab
    setupXterm(userTab.sessionId, 80, 24)
  }, [activeTab, userTabs, setupXterm])

  // Switch between tabs
  const switchTab = useCallback((tab: TerminalTab) => {
    if (typeof tab === 'string') {
      disposeXterm()
      setActiveTab('agent')
    } else {
      const userTab = userTabs.find((t) => t.id === tab.tabId)
      if (userTab) {
        setActiveTab(tab)
      }
    }
  }, [userTabs, disposeXterm])

  // Render agent activity tab content
  const renderAgentActivity = (): ReactElement => {
    if (agentEntries.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <Activity className="h-8 w-8 text-ds-faint" strokeWidth={1.5} />
          <p className="text-[13px] leading-5 text-ds-muted">{t('terminalAgentEmpty')}</p>
          <p className="text-[12px] leading-4 text-ds-faint">{t('terminalAgentEmptyDesc')}</p>
        </div>
      )
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto font-mono text-[12px] leading-5">
        {agentEntries.map((entry) => (
          <div
            key={entry.id}
            className={`border-b border-ds-border-muted px-3 py-1.5 ${
              entry.isError
                ? 'bg-red-500/5 text-red-400'
                : 'text-green-300'
            }`}
            dir="ltr"
          >
            <span className="select-none text-[10px] text-ds-faint">
              [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.toolName} &gt;{' '}
            </span>
            <span className="whitespace-pre-wrap break-all">{entry.output}</span>
          </div>
        ))}
      </div>
    )
  }

  // Render user PTY tab content
  const renderUserPty = (): ReactElement => {
    if (!terminalEnabled) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <TerminalIcon className="h-8 w-8 text-ds-faint" strokeWidth={1.5} />
          <p className="text-[13px] leading-5 text-ds-muted">{t('terminalDisabled')}</p>
          <p className="text-[12px] leading-4 text-ds-faint">{t('terminalDisabledDesc')}</p>
        </div>
      )
    }

    if (typeof activeTab !== 'string' && userTabs.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <TerminalIcon className="h-8 w-8 text-ds-faint" strokeWidth={1.5} />
          <p className="text-[13px] leading-5 text-ds-muted">{t('terminalUserEmpty')}</p>
          <p className="text-[12px] leading-4 text-ds-faint">{t('terminalUserEmptyDesc')}</p>
          <button
            type="button"
            onClick={addUserTab}
            className="inline-flex items-center gap-2 rounded-full border border-ds-border bg-ds-card px-4 py-2 text-[12.5px] font-medium text-ds-muted shadow-sm transition hover:bg-ds-hover hover:text-ds-ink"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.9} />
            {t('terminalAddSession')}
          </button>
        </div>
      )
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={xtermContainerRef}
          className="min-h-0 flex-1"
          dir="ltr"
          style={{ direction: 'ltr' }}
        />
      </div>
    )
  }

  // Render loading state
  if (loading) {
    return (
      <div
        className="ds-no-drag flex h-full w-full flex-col border-s border-ds-border-muted backdrop-blur-xl"
        dir="ltr"
      >
        <div className="flex min-h-[44px] shrink-0 items-center border-b border-ds-border-muted px-3">
          <div className="truncate text-[12px] font-semibold text-ds-ink">{t('terminalTitle')}</div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 text-ds-faint">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.9} />
          <span className="text-[13px]">{t('loading')}</span>
        </div>
      </div>
    )
  }

  // Render error state
  if (error && userTabs.length === 0) {
    return (
      <div
        className="ds-no-drag flex h-full w-full flex-col border-s border-ds-border-muted backdrop-blur-xl"
        dir="ltr"
      >
        <div className="flex min-h-[44px] shrink-0 items-center border-b border-ds-border-muted px-3">
          <div className="truncate text-[12px] font-semibold text-ds-ink">{t('terminalTitle')}</div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-full bg-red-500/10 p-3">
            <TerminalIcon className="h-5 w-5 text-red-400" strokeWidth={1.5} />
          </div>
          <p className="text-[13px] leading-5 text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  // Main render
  return (
    <div
      className="ds-no-drag flex h-full w-full flex-col border-s border-ds-border-muted backdrop-blur-xl"
      dir="ltr"
    >
      {/* Tab bar */}
      <div className="flex min-h-[44px] shrink-0 items-center border-b border-ds-border-muted">
        {/* Agent activity tab */}
        <button
          type="button"
          onClick={() => switchTab('agent')}
          className={`flex items-center gap-2 border-e border-ds-border-muted px-4 py-2.5 text-[12px] font-medium transition ${
            activeTab === 'agent'
              ? 'bg-ds-card text-ds-ink'
              : 'text-ds-muted hover:bg-ds-hover hover:text-ds-ink'
          }`}
        >
          <Activity className="h-3.5 w-3.5" strokeWidth={1.7} />
          <span className="truncate">{t('terminalAgentTab')}</span>
        </button>

        {/* User PTY tabs */}
        {userTabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center border-e border-ds-border-muted ${
              typeof activeTab !== 'string' && activeTab.tabId === tab.id
                ? 'bg-ds-card'
                : ''
            }`}
          >
            <button
              type="button"
              onClick={() => switchTab({ kind: 'user', tabId: tab.id })}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition ${
                typeof activeTab !== 'string' && activeTab.tabId === tab.id
                  ? 'text-ds-ink'
                  : 'text-ds-muted hover:bg-ds-hover hover:text-ds-ink'
              }`}
            >
              <TerminalIcon className="h-3.5 w-3.5" strokeWidth={1.7} />
              <span className="truncate max-w-[100px]">{tab.title}</span>
            </button>
            <button
              type="button"
              onClick={() => closeUserTab(tab.id)}
              className="me-1.5 rounded p-0.5 text-ds-faint transition hover:bg-red-500/10 hover:text-red-400"
              aria-label={t('terminalCloseTab')}
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.7} />
            </button>
          </div>
        ))}

        {/* Add tab button */}
        <button
          type="button"
          onClick={addUserTab}
          className="ms-auto flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink"
          disabled={!terminalEnabled}
          aria-label={t('terminalAddSession')}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 flex-1 flex-col bg-[#1a1b26]">
        {activeTab === 'agent' ? renderAgentActivity() : renderUserPty()}
      </div>
    </div>
  )
}
