import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  Camera,
  Globe,
  ImageOff,
  PanelRightClose,
  SearchX,
  Terminal
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '../../store/chat-store'
import type { ChatBlock } from '../../agent/types'
import { kunThreadEvidencePath } from '@shared/kun-endpoints'

type Props = {
  className?: string
  onCollapse: () => void
}

type EvidenceTab = 'screenshots' | 'console' | 'network'

type ExtractedEvidence = {
  id: string
  kind: 'screenshot' | 'console' | 'network'
  timestamp: string
  screenshotBase64?: string
  screenshotUrl?: string
  url?: string
  title?: string
  consoleEntries?: Array<{
    type: string
    text: string
    timestamp?: string
    location?: string
  }>
  networkEntries?: Array<{
    method: string
    url: string
    status: number
    statusText?: string
    timestamp?: string
  }>
}

/**
 * Extract evidence from automation tool-result blocks in the current thread.
 * Automation tools (browser_navigate, browser_screenshot) embed evidence
 * in their output text (ToolBlock.detail) and metadata (ToolBlock.meta).
 */
function extractEvidenceFromBlocks(blocks: ChatBlock[]): ExtractedEvidence[] {
  const evidence: ExtractedEvidence[] = []
  const seen = new Set<string>()

  for (const block of blocks) {
    if (block.kind !== 'tool') continue

    const toolName =
      block.meta && typeof block.meta === 'object' && 'toolName' in block.meta
        ? String(block.meta.toolName)
        : undefined

    if (
      toolName !== 'browser_navigate' &&
      toolName !== 'browser_screenshot' &&
      toolName !== 'browser_click' &&
      toolName !== 'browser_type'
    ) {
      continue
    }

    // The tool result detail is a JSON string with { status, evidence, ... }
    let output: Record<string, unknown> | null = null
    if (block.detail) {
      try {
        output = JSON.parse(block.detail) as Record<string, unknown>
      } catch {
        continue
      }
    }

    if (!output) continue

    const ev = output.evidence as Record<string, unknown> | undefined
    if (!ev) continue

    const timestamp = block.createdAt ?? new Date().toISOString()

    const base: Omit<
      ExtractedEvidence,
      'id' | 'kind' | 'screenshotBase64' | 'consoleEntries' | 'networkEntries'
    > = {
      timestamp,
      url: typeof ev.url === 'string' ? ev.url : undefined,
      title: typeof ev.title === 'string' ? ev.title : undefined
    }

    // Screenshot evidence: look for screenshotBase64 in the output.
    const screenshotBase64 =
      typeof ev.screenshotBase64 === 'string' ? ev.screenshotBase64 : undefined
    if (screenshotBase64) {
      const id = `scr_${evidence.length}`
      if (!seen.has(id)) {
        seen.add(id)
        evidence.push({
          ...base,
          id,
          kind: 'screenshot',
          screenshotBase64,
          screenshotUrl:
            typeof ev.screenshotUrl === 'string'
              ? ev.screenshotUrl
              : undefined
        })
      }
    }

    // Console evidence.
    const consoleEntries = ev.consoleEntries as
      | Array<{ type: string; text: string; timestamp?: string; location?: string }>
      | undefined
    if (Array.isArray(consoleEntries) && consoleEntries.length > 0) {
      const id = `con_${evidence.length}`
      if (!seen.has(id)) {
        seen.add(id)
        evidence.push({ ...base, id, kind: 'console', consoleEntries })
      }
    }

    // Network evidence.
    const networkEntries = ev.networkEntries as
      | Array<{ method: string; url: string; status: number; statusText?: string; timestamp?: string }>
      | undefined
    if (Array.isArray(networkEntries) && networkEntries.length > 0) {
      const id = `net_${evidence.length}`
      if (!seen.has(id)) {
        seen.add(id)
        evidence.push({ ...base, id, kind: 'network', networkEntries })
      }
    }
  }

  return evidence
}

function statusBadge(status: number): string {
  if (status < 200) return 'text-blue-600 dark:text-blue-400'
  if (status < 300) return 'text-emerald-600 dark:text-emerald-400'
  if (status < 400) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export function EvidencePanel({ className = '', onCollapse }: Props): ReactElement {
  const { t } = useTranslation('common')
  const [activeTab, setActiveTab] = useState<EvidenceTab>('screenshots')

  const blocks = useChatStore((s) => s.blocks)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const [apiEvidence, setApiEvidence] = useState<ExtractedEvidence[]>([])

  // Fetch evidence from the Kun API evidence store for the active thread.
  const fetchApiEvidence = useCallback(async (threadId: string) => {
    try {
      const path = kunThreadEvidencePath(threadId)
      const result = await window.dsGui.runtimeRequest(path, 'GET')
      if (!result.ok) return
      const data = JSON.parse(result.body) as {
        entries?: Array<{
          id: string
          kind: 'screenshot' | 'console' | 'network'
          threadId: string
          timestamp: string
          screenshotBase64?: string
          screenshotUrl?: string
          consoleEntries?: Array<{ type: string; text: string; timestamp?: string; location?: string }>
          networkEntries?: Array<{ method: string; url: string; status: number; statusText?: string; timestamp?: string }>
        }>
      }
      if (!data.entries) return
      const extracted: ExtractedEvidence[] = data.entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        timestamp: e.timestamp,
        screenshotBase64: e.screenshotBase64,
        screenshotUrl: e.screenshotUrl,
        consoleEntries: e.consoleEntries,
        networkEntries: e.networkEntries
      }))
      setApiEvidence(extracted)
    } catch {
      // API evidence is best-effort; block parsing is the primary source.
    }
  }, [])

  useEffect(() => {
    if (activeThreadId) {
      void fetchApiEvidence(activeThreadId)
    } else {
      setApiEvidence([])
    }
  }, [activeThreadId, fetchApiEvidence])

  const blockEvidence = useMemo(() => extractEvidenceFromBlocks(blocks), [blocks])

  // Merge API evidence with block evidence, deduplicating by ID.
  const evidence = useMemo(() => {
    const seen = new Set<string>()
    const merged: ExtractedEvidence[] = []
    // Block evidence first (real-time), then API evidence (persisted).
    for (const e of blockEvidence) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        merged.push(e)
      }
    }
    for (const e of apiEvidence) {
      if (!seen.has(e.id)) {
        seen.add(e.id)
        merged.push(e)
      }
    }
    return merged
  }, [blockEvidence, apiEvidence])

  const screenshots = useMemo(
    () => evidence.filter((e) => e.kind === 'screenshot'),
    [evidence]
  )
  const consoleEntries = useMemo(
    () => evidence.filter((e) => e.kind === 'console'),
    [evidence]
  )
  const networkEntries = useMemo(
    () => evidence.filter((e) => e.kind === 'network'),
    [evidence]
  )

  const tabs: { id: EvidenceTab; icon: ReactElement; label: string; count: number }[] =
    [
      {
        id: 'screenshots',
        icon: <Camera className="h-4 w-4" strokeWidth={1.75} />,
        label: t('evidenceScreenshots', 'Screenshots'),
        count: screenshots.length
      },
      {
        id: 'console',
        icon: <Terminal className="h-4 w-4" strokeWidth={1.75} />,
        label: t('evidenceConsole', 'Console'),
        count: consoleEntries.length
      },
      {
        id: 'network',
        icon: <Globe className="h-4 w-4" strokeWidth={1.75} />,
        label: t('evidenceNetwork', 'Network'),
        count: networkEntries.length
      }
    ]

  if (evidence.length === 0) {
    return (
      <aside
        className={`ds-no-drag flex min-h-0 flex-col border-l border-ds-border-muted bg-white dark:bg-ds-canvas ${className}`}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-ds-border-muted bg-white/92 px-4 dark:bg-ds-card">
          <button
            type="button"
            onClick={onCollapse}
            className="ds-sidebar-toggle-button shrink-0"
            aria-label={t('rightPanelCollapse')}
            title={t('rightPanelCollapse')}
          >
            <PanelRightClose className="h-4 w-4" strokeWidth={1.85} />
          </button>
          <SearchX className="h-4 w-4 shrink-0 text-ds-faint" strokeWidth={1.85} />
          <span className="truncate text-[13px] font-semibold text-ds-ink">
            {t('evidencePanelTitle', 'Evidence')}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-ds-surface-subtle p-3 text-ds-faint dark:bg-white/6">
              <SearchX className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ds-ink">
                {t('evidenceEmptyTitle', 'No evidence captured yet')}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ds-faint">
                {t(
                  'evidenceEmptyDescription',
                  'Browser automation evidence (screenshots, console logs, network) will appear here after the agent runs a browser action.'
                )}
              </p>
            </div>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={`ds-no-drag flex min-h-0 flex-col border-l border-ds-border-muted bg-white dark:bg-ds-canvas ${className}`}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-ds-border-muted bg-white/92 dark:bg-ds-card">
        <div className="flex h-12 min-w-0 items-center gap-2 px-4">
          <button
            type="button"
            onClick={onCollapse}
            className="ds-sidebar-toggle-button shrink-0"
            aria-label={t('rightPanelCollapse')}
            title={t('rightPanelCollapse')}
          >
            <PanelRightClose className="h-4 w-4" strokeWidth={1.85} />
          </button>
          <Camera className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.85} />
          <span className="truncate text-[13px] font-semibold text-ds-ink">
            {t('evidencePanelTitle', 'Evidence')}
          </span>
          <span className="ms-auto rounded-full bg-ds-surface-subtle px-2 py-0.5 text-[11px] font-medium text-ds-faint dark:bg-white/8">
            {evidence.length}
          </span>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-ds-border-muted px-2" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition ${
                activeTab === tab.id
                  ? 'border-b-2 border-accent text-accent'
                  : 'border-b-2 border-transparent text-ds-faint hover:text-ds-ink'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count > 0 ? (
                <span className="ms-0.5 rounded-full bg-ds-surface-subtle px-1.5 py-px text-[11px] dark:bg-white/8">
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'screenshots' ? (
          <ScreenshotTab entries={screenshots} />
        ) : activeTab === 'console' ? (
          <ConsoleTab entries={consoleEntries} />
        ) : (
          <NetworkTab entries={networkEntries} />
        )}
      </div>
    </aside>
  )
}

function ScreenshotTab({
  entries
}: {
  entries: ExtractedEvidence[]
}): ReactElement {
  const { t } = useTranslation('common')

  return (
    <div className="space-y-3 p-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="overflow-hidden rounded-lg border border-ds-border-muted bg-ds-card dark:bg-white/4"
        >
          {entry.screenshotBase64 ? (
            <img
              src={`data:image/png;base64,${entry.screenshotBase64}`}
              alt={entry.title ?? t('evidenceScreenshotAlt', 'Browser screenshot')}
              className="w-full object-cover"
              style={{ maxHeight: 320 }}
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-ds-faint">
              <ImageOff className="h-8 w-8" strokeWidth={1.25} />
            </div>
          )}
          <div className="border-t border-ds-border-muted px-3 py-2">
            <p className="truncate text-[12px] font-medium text-ds-ink">
              {entry.title ?? entry.screenshotUrl ?? entry.url ?? t('evidenceUntitled', 'Untitled')}
            </p>
            {entry.screenshotUrl ? (
              <p className="mt-0.5 truncate text-[11px] text-ds-faint">
                {entry.screenshotUrl}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function ConsoleTab({
  entries
}: {
  entries: ExtractedEvidence[]
}): ReactElement {
  const { t } = useTranslation('common')
  const allEntries = entries.flatMap(
    (e) => e.consoleEntries?.map((c) => ({ ...c, evidenceId: e.id })) ?? []
  )

  if (allEntries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-ds-faint">
        <SearchX className="me-2 h-4 w-4" strokeWidth={1.5} />
        {t('evidenceConsoleEmpty', 'No console entries captured')}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="border-b border-ds-border-muted text-start text-ds-faint">
          <tr>
            <th className="px-3 py-2 text-start font-medium">
              {t('evidenceConsoleType', 'Type')}
            </th>
            <th className="px-3 py-2 text-start font-medium">
              {t('evidenceConsoleText', 'Message')}
            </th>
            <th className="px-3 py-2 text-start font-medium">
              {t('evidenceConsoleLocation', 'Location')}
            </th>
          </tr>
        </thead>
        <tbody>
          {allEntries.map((entry, idx) => (
            <tr
              key={`${entry.evidenceId}_${idx}`}
              className="border-b border-ds-border-muted/50 transition hover:bg-ds-hover/30 dark:hover:bg-white/4"
            >
              <td className="px-3 py-1.5 font-mono text-[11px]">
                <span
                  className={
                    entry.type === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : entry.type === 'warning'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-ds-faint'
                  }
                >
                  {entry.type}
                </span>
              </td>
              <td className="max-w-[320px] truncate px-3 py-1.5 font-mono text-[11px] text-ds-ink">
                {entry.text}
              </td>
              <td className="max-w-[160px] truncate px-3 py-1.5 font-mono text-[11px] text-ds-faint">
                {entry.location ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NetworkTab({
  entries
}: {
  entries: ExtractedEvidence[]
}): ReactElement {
  const { t } = useTranslation('common')
  const allEntries = entries.flatMap(
    (e) => e.networkEntries?.map((n) => ({ ...n, evidenceId: e.id })) ?? []
  )

  if (allEntries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-ds-faint">
        <SearchX className="me-2 h-4 w-4" strokeWidth={1.5} />
        {t('evidenceNetworkEmpty', 'No network requests captured')}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="border-b border-ds-border-muted text-start text-ds-faint">
          <tr>
            <th className="px-3 py-2 text-start font-medium">
              {t('evidenceNetworkMethod', 'Method')}
            </th>
            <th className="px-3 py-2 text-start font-medium">
              {t('evidenceNetworkUrl', 'URL')}
            </th>
            <th className="px-3 py-2 text-start font-medium">
              {t('evidenceNetworkStatus', 'Status')}
            </th>
          </tr>
        </thead>
        <tbody>
          {allEntries.map((entry, idx) => (
            <tr
              key={`${entry.evidenceId}_${idx}`}
              className="border-b border-ds-border-muted/50 transition hover:bg-ds-hover/30 dark:hover:bg-white/4"
            >
              <td className="px-3 py-1.5 font-mono text-[11px] font-medium text-ds-ink">
                {entry.method}
              </td>
              <td className="max-w-[320px] truncate px-3 py-1.5 font-mono text-[11px] text-ds-ink">
                {entry.url}
              </td>
              <td className="px-3 py-1.5 font-mono text-[11px]">
                <span className={statusBadge(entry.status)}>
                  {entry.status}
                  {entry.statusText ? ` ${entry.statusText}` : ''}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
