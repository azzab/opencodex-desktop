import { useState, useCallback, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  Pause,
  Power,
  RotateCcw,
  Trash2,
  Plus,
  Clock,
  CalendarClock,
  Timer,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react'
import type { LoopRecord, LoopStatus, LoopScheduleKind } from '../../../../kun/src/contracts/automations.js'

export type LoopsManagerProps = {
  loops: LoopRecord[]
  onCreate?: () => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onCancel?: (id: string) => void
  onDelete?: (id: string) => void
}

export function LoopsManager({
  loops,
  onCreate,
  onPause,
  onResume,
  onCancel,
  onDelete
}: LoopsManagerProps): ReactElement {
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  return (
    <div className="flex flex-col gap-2 p-3" dir="auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ds-text">
          {t('loopsManagerTitle', 'Scheduled Loops')}
        </h3>
        {onCreate && (
          <button
            onClick={onCreate}
            className="p-1 rounded-md hover:bg-ds-card-hover text-ds-text-secondary"
            aria-label={t('loopsCreateNew', 'Create loop')}
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {loops.length === 0 ? (
        <div className="text-xs text-ds-faint text-center py-4">
          {t('loopsEmpty', 'No scheduled loops yet.')}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {loops.map((loop) => (
            <LoopCard
              key={loop.id}
              loop={loop}
              expanded={expandedId === loop.id}
              onToggleExpand={() => toggleExpand(loop.id)}
              onPause={onPause}
              onResume={onResume}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type LoopCardProps = {
  loop: LoopRecord
  expanded: boolean
  onToggleExpand: () => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onCancel?: (id: string) => void
  onDelete?: (id: string) => void
}

function LoopCard({
  loop,
  expanded,
  onToggleExpand,
  onPause,
  onResume,
  onCancel,
  onDelete
}: LoopCardProps): ReactElement {
  const { t } = useTranslation()

  const statusBadge = (status: LoopStatus): ReactElement => {
    const config: Record<LoopStatus, { label: string; color: string }> = {
      active: { label: t('loopStatusActive', 'Active'), color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/25' },
      paused: { label: t('loopStatusPaused', 'Paused'), color: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/25' },
      cancelled: { label: t('loopStatusCancelled', 'Cancelled'), color: 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/25' },
      expired: { label: t('loopStatusExpired', 'Expired'), color: 'bg-ds-card text-ds-faint border-ds-border-muted' },
      completed: { label: t('loopStatusCompleted', 'Completed'), color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-500/30' }
    }
    const c = config[status]
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border ${c.color}`}>
        {c.label}
      </span>
    )
  }

  const scheduleLabel = (schedule: LoopRecord['schedule']): string => {
    switch (schedule.kind) {
      case 'interval':
        return t('loopScheduleInterval', 'Every {{minutes}} min', { minutes: schedule.everyMinutes ?? '?' })
      case 'cron':
        return schedule.cronExpression ?? t('loopScheduleCron', 'Cron schedule')
      case 'at':
        return schedule.atTime
          ? t('loopScheduleAt', 'At {{time}}', { time: new Date(schedule.atTime).toLocaleString() })
          : t('loopScheduleOneTime', 'One-time')
    }
  }

  const runStatusIcon = (status: string): ReactElement => {
    switch (status) {
      case 'running': return <Loader2 size={10} className="animate-spin" />
      case 'success': return <span className="w-2 h-2 rounded-full bg-emerald-500" />
      case 'error': return <span className="w-2 h-2 rounded-full bg-red-500" />
      case 'skipped': return <span className="w-2 h-2 rounded-full bg-amber-500" />
      default: return <span className="w-2 h-2 rounded-full bg-ds-border-muted" />
    }
  }

  return (
    <div className="bg-ds-card border border-ds-border-muted rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-ds-card-hover transition-colors"
      >
        <span className="flex-1 min-w-0">
          <span className="text-xs font-medium text-ds-text truncate block">
            {loop.prompt.slice(0, 60)}{loop.prompt.length > 60 ? '…' : ''}
          </span>
          <span className="flex items-center gap-2 mt-0.5 text-[10px] text-ds-faint">
            {statusBadge(loop.status)}
            <span className="flex items-center gap-1">
              <Timer size={10} />
              {scheduleLabel(loop.schedule)}
            </span>
          </span>
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-ds-border-muted">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <DetailRow
              label={t('loopsNextRun', 'Next run')}
              value={loop.nextRunAt ? new Date(loop.nextRunAt).toLocaleString() : t('loopsNotScheduled', 'Not scheduled')}
            />
            <DetailRow
              label={t('loopsLastRun', 'Last run')}
              value={loop.lastRunAt ? new Date(loop.lastRunAt).toLocaleString() : t('loopsNeverRun', 'Never')}
            />
            <DetailRow
              label={t('loopsRunCount', 'Runs')}
              value={`${loop.runCount}${loop.maxRuns ? ` / ${loop.maxRuns}` : ''}`}
            />
            <DetailRow
              label={t('loopsTotalTokens', 'Tokens')}
              value={loop.usage.totalTokens >= 1000
                ? `${(loop.usage.totalTokens / 1000).toFixed(1)}k`
                : String(loop.usage.totalTokens)}
            />
            <DetailRow
              label={t('loopsTotalCost', 'Cost')}
              value={`$${loop.usage.totalCostUsd.toFixed(4)}`}
            />
            <DetailRow
              label={t('loopsLastStatus', 'Last status')}
              value={(
                <span className="flex items-center gap-1">
                  {runStatusIcon(loop.lastRunStatus)}
                  {loop.lastRunStatus}
                </span>
              )}
            />
          </div>

          {/* Last error */}
          {loop.lastRunError && (
            <div className="mt-2 p-2 rounded bg-red-500/5 border border-red-500/10 text-[10px] text-red-600 dark:text-red-300">
              {loop.lastRunError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-ds-border-muted">
            {loop.status === 'active' && onPause && (
              <ActionButton
                icon={<Pause size={12} />}
                label={t('loopsPause', 'Pause')}
                onClick={() => onPause(loop.id)}
              />
            )}
            {loop.status === 'paused' && onResume && (
              <ActionButton
                icon={<Play size={12} />}
                label={t('loopsResume', 'Resume')}
                onClick={() => onResume(loop.id)}
              />
            )}
            {(loop.status === 'active' || loop.status === 'paused') && onCancel && (
              <ActionButton
                icon={<Power size={12} />}
                label={t('loopsCancel', 'Cancel')}
                onClick={() => onCancel(loop.id)}
                danger
              />
            )}
            {loop.status === 'cancelled' && onResume && (
              <ActionButton
                icon={<RotateCcw size={12} />}
                label={t('loopsReactivate', 'Reactivate')}
                onClick={() => onResume(loop.id)}
              />
            )}
            <div className="flex-1" />
            {onDelete && (
              <ActionButton
                icon={<Trash2 size={12} />}
                label={t('loopsDelete', 'Delete')}
                onClick={() => onDelete(loop.id)}
                danger
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-ds-faint">{label}</span>
      <span className="text-xs text-ds-text-secondary truncate">{value}</span>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  danger
}: {
  icon: ReactElement
  label: string
  onClick: () => void
  danger?: boolean
}): ReactElement {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
        danger
          ? 'text-red-600 dark:text-red-300 hover:bg-red-500/10'
          : 'text-ds-text-secondary hover:bg-ds-card-hover'
      }`}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Loader2({ size, className }: { size: number; className?: string }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animate-spin ${className ?? ''}`}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
