import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  Coins,
  Gauge,
  Hash,
  Loader2,
  PanelRightClose,
  RefreshCw,
  Users,
  Zap
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ThreadUsageState, ThreadUsageSummary } from '../../hooks/use-thread-usage'
import {
  formatCompactNumber,
  formatCost,
  formatPercent,
  useThreadUsageState,
  useThreadUsage
} from '../../hooks/use-thread-usage'
import { useChatStore } from '../../store/chat-store'
import { useShallow } from 'zustand/react/shallow'
import { useModelUsageState } from '../../hooks/use-model-usage'
import {
  useDailyUsageState,
  defaultDailyUsageRange,
  type DailyUsageSummary,
  DEFAULT_USAGE_HEATMAP_DAYS
} from '../../hooks/use-daily-usage'

type Props = {
  className?: string
  onClose: () => void
}

type SubagentDiagnostics = {
  enabled: boolean
  active: number
  childRuns: Array<{
    id: string
    label?: string
    model?: string
    status: string
    summary?: string
    usage?: {
      totalTokens?: number
      costUsd?: number
      cacheHitRate?: number | null
    }
  }>
  aggregates: Array<{
    key: string
    runs: number
    completed: number
    failed: number
    totalTokens: number
    costUsd?: number
    cacheHitRate: number | null
    summaries: string[]
  }>
  usage: {
    totalTokens: number
    costUsd?: number
    cacheHitRate: number | null
  }
}

function metricNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.round(value))
}

function MetricCard({
  label,
  value,
  detail,
  icon
}: {
  label: string
  value: string
  detail?: string
  icon?: ReactElement
}): ReactElement {
  return (
    <div className="rounded-lg border border-ds-border-muted bg-ds-card/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0] text-ds-faint">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-[15px] font-semibold text-ds-ink">{value}</div>
      {detail ? <div className="mt-0.5 truncate text-[11px] text-ds-muted">{detail}</div> : null}
    </div>
  )
}

function SectionHeader({
  icon,
  title
}: {
  icon: ReactElement
  title: string
}): ReactElement {
  return (
    <div className="mb-3 flex min-w-0 items-center gap-2 text-[12px] font-semibold text-ds-ink">
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ds-subtle text-ds-muted">
        {icon}
      </span>
      <span className="truncate">{title}</span>
    </div>
  )
}

function CacheState({
  hitRate,
  className = ''
}: {
  hitRate: number | null
  className?: string
}): ReactElement {
  const { t } = useTranslation('common')

  if (hitRate == null || !Number.isFinite(hitRate)) {
    return (
      <span className={`ds-usage-cache-unknown inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-100/70 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-600/30 dark:bg-amber-900/30 dark:text-amber-200 ${className}`}>
        <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={1.8} />
        {t('usageCacheUnknown')}
      </span>
    )
  }

  const pct = Math.max(0, Math.min(100, hitRate * 100))
  const label = pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`
  const isGood = pct >= 80
  const isModerate = pct >= 50

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className} ${
        isGood
          ? 'border border-emerald-300/40 bg-emerald-100/70 text-emerald-800 dark:border-emerald-600/30 dark:bg-emerald-900/30 dark:text-emerald-200'
          : isModerate
            ? 'border border-blue-300/40 bg-blue-100/70 text-blue-800 dark:border-blue-600/30 dark:bg-blue-900/30 dark:text-blue-200'
            : 'border border-rose-300/40 bg-rose-100/70 text-rose-800 dark:border-rose-600/30 dark:bg-rose-900/30 dark:text-rose-200'
      }`}
    >
      <Zap className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      {label}
    </span>
  )
}

function ThreadSummaryCard({
  usage,
  t,
  locale
}: {
  usage: ThreadUsageSummary
  t: (key: string, opts?: Record<string, unknown>) => string
  locale: string
}): ReactElement {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          icon={<ArrowUpRight className="h-3 w-3 text-ds-faint" strokeWidth={1.8} />}
          label={t('usageInputTokens')}
          value={formatCompactNumber(usage.inputTokens)}
        />
        <MetricCard
          icon={<ArrowDownRight className="h-3 w-3 text-ds-faint" strokeWidth={1.8} />}
          label={t('usageOutputTokens')}
          value={formatCompactNumber(usage.outputTokens)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          icon={<Zap className="h-3 w-3 text-ds-faint" strokeWidth={1.8} />}
          label={t('usageCacheRead')}
          value={formatCompactNumber(usage.cachedTokens)}
          detail={t('usageCacheHitTokens', { tokens: formatCompactNumber(usage.cachedTokens), miss: formatCompactNumber(usage.cacheMissTokens) })}
        />
        <MetricCard
          icon={<Coins className="h-3 w-3 text-ds-faint" strokeWidth={1.8} />}
          label={t('usageCostEstimate')}
          value={formatCost(usage.costUsd, locale, usage.costCny)}
          detail={t('usageTurnsCount', { turns: usage.turns })}
        />
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-ds-border-muted bg-ds-card/50 px-3 py-2.5">
        <span className="text-[11px] font-medium text-ds-muted">{t('usageCacheRate')}</span>
        <CacheState hitRate={usage.cacheHitRate} />
        <span className="ms-auto text-[11px] tabular-nums text-ds-faint">
          {t('usageTotalTokens', { tokens: formatCompactNumber(usage.totalTokens) })}
        </span>
      </div>
      {usage.cacheSavingsUsd > 0 || usage.tokenEconomySavingsTokens > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ds-muted">
          {usage.cacheSavingsUsd > 0 ? (
            <span className="rounded-full bg-emerald-100/70 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              {t('usageCacheSavings', { amount: formatCost(usage.cacheSavingsUsd, locale, usage.cacheSavingsCny) })}
            </span>
          ) : null}
          {usage.tokenEconomySavingsTokens > 0 ? (
            <span className="rounded-full bg-blue-100/70 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
              {t('usageTokenEconomySavings', { tokens: formatCompactNumber(usage.tokenEconomySavingsTokens) })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SubagentSection({
  threadId
}: {
  threadId: string
}): ReactElement {
  const { t } = useTranslation('common')
  const [diagnostics, setDiagnostics] = useState<SubagentDiagnostics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (typeof window.dsGui?.runtimeRequest !== 'function') {
      setError(t('usageSubagentUnavailable'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    void window.dsGui
      .runtimeRequest(`/v1/threads/${encodeURIComponent(threadId)}/diagnostics`, 'GET')
      .then((r) => {
        if (cancelled) return
        if (r.ok && r.body.trim()) {
          try {
            const parsed = JSON.parse(r.body) as SubagentDiagnostics
            if (parsed.enabled !== undefined && parsed.childRuns) {
              setDiagnostics(parsed)
            } else {
              setDiagnostics(null)
            }
          } catch {
            // Thread diagnostics may not include subagent data; that's fine.
            setDiagnostics(null)
          }
        } else {
          setDiagnostics(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [threadId, t])

  const noSubagentData = !loading && !error && (!diagnostics || !diagnostics.childRuns || diagnostics.childRuns.length === 0)

  if (loading) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="flex items-center gap-2 text-[11px] text-ds-muted">
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.8} />
          {t('usageSubagentLoading')}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="text-[11px] text-ds-faint">{error}</div>
      </div>
    )
  }

  if (noSubagentData) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="text-[11px] text-ds-muted">{t('usageSubagentNone')}</div>
      </div>
    )
  }

  const d = diagnostics!

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          label={t('usageSubagentRuns')}
          value={String(d.childRuns.length)}
        />
        <MetricCard
          label={t('usageSubagentTokens')}
          value={formatCompactNumber(d.usage.totalTokens)}
          detail={d.usage.costUsd !== undefined ? formatCost(d.usage.costUsd, 'en', undefined) : undefined}
        />
        <MetricCard
          label={t('usageSubagentCacheRate')}
          value={d.usage.cacheHitRate != null ? formatPercent(d.usage.cacheHitRate) : t('usageCacheUnknown')}
        />
      </div>
      {d.childRuns.length > 0 ? (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-ds-border-muted bg-ds-card/30">
          <table className="w-full text-[11px] leading-5">
            <thead className="sticky top-0 border-b border-ds-border-muted bg-ds-subtle/90 text-start text-ds-faint">
              <tr>
                <th className="px-2 py-1.5 font-medium text-start">{t('usageSubagentLabel')}</th>
                <th className="px-2 py-1.5 font-medium text-start">{t('usageSubagentModel')}</th>
                <th className="px-2 py-1.5 font-medium text-start">{t('usageSubagentStatus')}</th>
                <th className="px-2 py-1.5 font-medium text-end">{t('usageSubagentTokensShort')}</th>
              </tr>
            </thead>
            <tbody>
              {d.childRuns.map((run) => (
                <tr key={run.id} className="border-b border-ds-border-muted/40 last:border-0">
                  <td className="max-w-[80px] truncate px-2 py-1.5 text-ds-ink" title={run.label || run.id}>
                    {run.label || run.id.slice(0, 8)}
                  </td>
                  <td className="max-w-[80px] truncate px-2 py-1.5 text-ds-muted">
                    {run.model || '-'}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        run.status === 'completed'
                          ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                          : run.status === 'running'
                            ? 'bg-blue-100/80 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                            : run.status === 'failed' || run.status === 'aborted'
                              ? 'bg-rose-100/80 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200'
                              : 'bg-ds-subtle text-ds-muted'
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-end tabular-nums text-ds-ink">
                    {formatCompactNumber(run.usage?.totalTokens ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function ModelBreakdownSection(): ReactElement {
  const { t, i18n } = useTranslation('common')
  const runtimeConnection = useChatStore((s) => s.runtimeConnection)
  const enabled = runtimeConnection === 'ready'

  const { usage, loading, loaded, error } = useModelUsageState(
    enabled,
    undefined,
    DEFAULT_USAGE_HEATMAP_DAYS
  )

  if (loading) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="flex items-center gap-2 text-[11px] text-ds-muted">
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.8} />
          {t('usageModelLoading')}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="text-[11px] text-ds-faint">{t('usageModelError', { message: error })}</div>
      </div>
    )
  }

  if (!usage || usage.buckets.length === 0) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="text-[11px] text-ds-muted">{t('usageModelEmpty')}</div>
      </div>
    )
  }

  const sorted = [...usage.buckets].sort((a, b) => b.totalTokens - a.totalTokens)

  return (
    <div className="space-y-2">
      {sorted.map((bucket) => (
        <div
          key={bucket.model}
          className="rounded-lg border border-ds-border-muted bg-ds-card/50 px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-ds-ink">{bucket.model}</span>
            <CacheState hitRate={bucket.cacheHitRate} />
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            <div>
              <div className="text-[10px] text-ds-faint">{t('usageModelTokens')}</div>
              <div className="text-[12px] font-semibold tabular-nums text-ds-ink">
                {formatCompactNumber(bucket.totalTokens)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-ds-faint">{t('usageModelCost')}</div>
              <div className="text-[12px] font-semibold tabular-nums text-ds-ink">
                {formatCost(bucket.costUsd, i18n.language, bucket.costCny)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-ds-faint">{t('usageModelTurns')}</div>
              <div className="text-[12px] font-semibold tabular-nums text-ds-ink">
                {metricNumber(bucket.turns)}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AggregateSection(): ReactElement {
  const { t, i18n } = useTranslation('common')
  const runtimeConnection = useChatStore((s) => s.runtimeConnection)
  const enabled = runtimeConnection === 'ready'

  const { usage, loading, loaded, error } = useDailyUsageState(
    enabled,
    undefined,
    Math.min(DEFAULT_USAGE_HEATMAP_DAYS, 30)
  )

  if (loading) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="flex items-center gap-2 text-[11px] text-ds-muted">
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.8} />
          {t('usageAggregateLoading')}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="text-[11px] text-ds-faint">{t('usageAggregateError', { message: error })}</div>
      </div>
    )
  }

  if (!usage) {
    return (
      <div className="rounded-lg border border-ds-border-muted bg-ds-card/50 p-3">
        <div className="text-[11px] text-ds-muted">{t('usageAggregateEmpty')}</div>
      </div>
    )
  }

  const totals = usage.totals

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          icon={<Hash className="h-3 w-3 text-ds-faint" strokeWidth={1.8} />}
          label={t('usageAggregateTokens')}
          value={formatCompactNumber(totals.totalTokens)}
          detail={t('usageAggregateDays', { active: totals.activeDays, total: totals.days })}
        />
        <MetricCard
          icon={<Coins className="h-3 w-3 text-ds-faint" strokeWidth={1.8} />}
          label={t('usageAggregateCost')}
          value={formatCost(totals.costUsd, i18n.language, totals.costCny)}
          detail={t('usageAggregateTurns', { turns: totals.turns, threads: totals.threadCount })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          icon={<BrainCircuit className="h-3 w-3 text-ds-faint" strokeWidth={1.8} />}
          label={t('usageAggregateCacheRate')}
          value={totals.cacheHitRate != null ? formatPercent(totals.cacheHitRate) : t('usageCacheUnknown')}
        />
        <MetricCard
          icon={<BarChart3 className="h-3 w-3 text-ds-faint" strokeWidth={1.8} />}
          label={t('usageAggregateSavings')}
          value={formatCost(totals.cacheSavingsUsd, i18n.language, totals.cacheSavingsCny)}
          detail={t('usageAggregateTokenEconomy', {
            tokens: formatCompactNumber(totals.tokenEconomySavingsTokens)
          })}
        />
      </div>
    </div>
  )
}

function UsagePanelContent({
  threadId,
  threadUsage,
  loading
}: {
  threadId: string
  threadUsage: ThreadUsageSummary | null
  loading: boolean
}): ReactElement {
  const { t, i18n } = useTranslation('common')

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-ds-muted">
        <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.8} />
        <span className="text-[12px]">{t('usagePanelLoading')}</span>
      </div>
    )
  }

  if (!threadUsage) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-ds-muted">
        <Gauge className="h-8 w-8 text-ds-faint" strokeWidth={1.5} />
        <span className="text-[13px] font-medium">{t('usagePanelEmptyTitle')}</span>
        <span className="text-[11px]">{t('usagePanelEmptySub')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Thread usage summary */}
      <section>
        <SectionHeader
          icon={<Hash className="h-3.5 w-3.5" strokeWidth={1.8} />}
          title={t('usagePanelThreadTitle')}
        />
        <ThreadSummaryCard usage={threadUsage} t={t} locale={i18n.language} />
      </section>

      {/* Subagent rollup */}
      <section>
        <SectionHeader
          icon={<Users className="h-3.5 w-3.5" strokeWidth={1.8} />}
          title={t('usagePanelSubagentsTitle')}
        />
        <SubagentSection threadId={threadId} />
      </section>

      {/* Model breakdown */}
      <section>
        <SectionHeader
          icon={<BrainCircuit className="h-3.5 w-3.5" strokeWidth={1.8} />}
          title={t('usagePanelModelTitle')}
        />
        <ModelBreakdownSection />
      </section>

      {/* Session/project aggregate */}
      <section>
        <SectionHeader
          icon={<BarChart3 className="h-3.5 w-3.5" strokeWidth={1.8} />}
          title={t('usagePanelAggregateTitle')}
        />
        <AggregateSection />
      </section>
    </div>
  )
}

export function UsagePanel({ className = '', onClose }: Props): ReactElement {
  const { t } = useTranslation('common')
  const { activeThreadId, runtimeConnection, busy, threads } = useChatStore(
    useShallow((s) => ({
      activeThreadId: s.activeThreadId,
      runtimeConnection: s.runtimeConnection,
      busy: s.busy,
      threads: s.threads
    }))
  )

  const active = useMemo(
    () => threads.find((th) => th.id === activeThreadId) ?? null,
    [activeThreadId, threads]
  )



  const usageRefreshKey = useChatStore((s) => s.usageRefreshKey)
  const threadUsage = useThreadUsage(
    activeThreadId,
    runtimeConnection === 'ready',
    `${active?.updatedAt ?? ''}:${usageRefreshKey}:${busy ? 'busy' : 'idle'}`
  )
  const usageState = useThreadUsageState(
    activeThreadId,
    runtimeConnection === 'ready',
    `${active?.updatedAt ?? ''}:${usageRefreshKey}:${busy ? 'busy' : 'idle'}`
  )

  return (
    <aside
      className={`ds-no-drag ds-usage-panel flex min-h-0 flex-col border-s border-ds-border-muted bg-white dark:bg-ds-canvas ${className}`}
    >
      <div className="shrink-0 border-b border-ds-border-muted bg-white/92 dark:bg-ds-card">
        <div className="flex h-12 min-w-0 items-center gap-2 px-4">
          <button
            type="button"
            onClick={onClose}
            className="ds-sidebar-toggle-button shrink-0"
            aria-label={t('rightPanelCollapse')}
            title={t('rightPanelCollapse')}
          >
            <PanelRightClose className="h-4 w-4" strokeWidth={1.85} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Gauge className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.85} />
            <span className="truncate text-[13px] font-semibold text-ds-ink">
              {t('usagePanelTitle')}
            </span>
          </div>
          <button
            type="button"
            className="ds-sidebar-toggle-button shrink-0"
            aria-label={t('usagePanelRefresh')}
            title={t('usagePanelRefresh')}
            onClick={() => {
              useChatStore.setState((s) => ({ usageRefreshKey: s.usageRefreshKey + 1 }))
            }}
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.85} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeThreadId && runtimeConnection === 'ready' ? (
          <UsagePanelContent
            threadId={activeThreadId}
            threadUsage={threadUsage}
            loading={usageState.loading}
          />
        ) : runtimeConnection !== 'ready' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-ds-muted">
            <Gauge className="h-8 w-8 text-ds-faint" strokeWidth={1.5} />
            <span className="text-[13px] font-medium">{t('usagePanelDisconnectedTitle')}</span>
            <span className="text-[11px]">{t('usagePanelDisconnectedSub')}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-ds-muted">
            <Gauge className="h-8 w-8 text-ds-faint" strokeWidth={1.5} />
            <span className="text-[13px] font-medium">{t('usagePanelNoThread')}</span>
            <span className="text-[11px]">{t('usagePanelNoThreadSub')}</span>
          </div>
        )}
      </div>
    </aside>
  )
}
