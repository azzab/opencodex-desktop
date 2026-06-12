import type { ReactElement } from 'react'
import { useState, useCallback } from 'react'
import {
  History,
  RotateCcw,
  MessageSquare,
  GitFork,
  Trash2,
  PanelRightClose,
  Clock,
  AlertTriangle
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CheckpointSummary } from '../agent/checkpoint-types'

type Props = {
  className?: string
  checkpoints: CheckpointSummary[]
  loading: boolean
  error?: string | null
  onCollapse: () => void
  onRestoreCode: (checkpointId: string, confirmDirtyOverwrite?: boolean) => void
  onRestoreConversation: (checkpointId: string) => void
  onRestoreBoth: (checkpointId: string) => void
  onFork: (checkpointId: string, withWorktree: boolean) => void
  onDelete: (checkpointId: string) => void
}

type ConfirmAction = {
  checkpointId: string
  action: 'restore-code' | 'restore-conversation' | 'restore-both' | 'fork' | 'fork-worktree' | 'delete'
  label: string
  message: string
  /** Gate 5: If true, the restore-code action will pass confirmDirtyOverwrite */
  confirmDirtyOverwrite?: boolean
} | null

type DirtyDetails = {
  stagedFiles: string[]
  unstagedFiles: string[]
  untrackedFiles: string[]
} | null

export function CheckpointTimeline({
  className = '',
  checkpoints,
  loading,
  error,
  onCollapse,
  onRestoreCode,
  onRestoreConversation,
  onRestoreBoth,
  onFork,
  onDelete
}: Props): ReactElement {
  const { t } = useTranslation('common')
  const [confirm, setConfirm] = useState<ConfirmAction>(null)

  const requestConfirm = useCallback((action: ConfirmAction) => {
    setConfirm(action)
  }, [])

  const dismissConfirm = useCallback(() => {
    setConfirm(null)
  }, [])

  const executeConfirmed = useCallback(() => {
    if (!confirm) return
    switch (confirm.action) {
      case 'restore-code':
        onRestoreCode(confirm.checkpointId, confirm.confirmDirtyOverwrite)
        break
      case 'restore-conversation':
        onRestoreConversation(confirm.checkpointId)
        break
      case 'restore-both':
        onRestoreBoth(confirm.checkpointId)
        break
      case 'fork':
        onFork(confirm.checkpointId, false)
        break
      case 'fork-worktree':
        onFork(confirm.checkpointId, true)
        break
      case 'delete':
        onDelete(confirm.checkpointId)
        break
    }
    setConfirm(null)
  }, [confirm, onRestoreCode, onRestoreConversation, onRestoreBoth, onFork, onDelete])

  return (
    <aside
      className={`ds-no-drag flex min-h-0 flex-col border-l border-ds-border-muted bg-white dark:bg-ds-canvas ${className}`}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-ds-border-muted bg-white/92 dark:bg-ds-card">
        <div className="flex h-12 min-w-0 items-center gap-2 px-4">
          <History className="h-4 w-4 shrink-0 text-ds-muted" strokeWidth={1.85} />
          <span className="truncate text-sm font-semibold text-ds-text">
            {t('checkpointTimelineTitle')}
          </span>
          <div className="grow" />
          <button
            type="button"
            onClick={onCollapse}
            className="ds-sidebar-toggle-button shrink-0"
            aria-label={t('rightPanelCollapse')}
            title={t('rightPanelCollapse')}
          >
            <PanelRightClose className="h-4 w-4" strokeWidth={1.85} />
          </button>
        </div>
      </div>

      {/* Error banner (Gate 5: dirty workspace blocking) */}
      {error && (
        <div className="shrink-0 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-red-700 dark:text-red-300">
                {t('checkpointDirtyBlocked')}
              </p>
              <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-1 break-words">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-ds-muted">
            {t('loading')}
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <History className="h-8 w-8 text-ds-muted" strokeWidth={1.5} />
            <p className="text-sm font-medium text-ds-text">{t('checkpointTimelineEmpty')}</p>
            <p className="text-xs text-ds-muted">{t('checkpointTimelineEmptyDesc')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-ds-border-muted">
            {checkpoints.map((cp) => (
              <li key={cp.id} className="px-4 py-3">
                {/* Checkpoint header */}
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ds-muted" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ds-text truncate">
                      {cp.trigger === 'manual'
                        ? t('checkpointManualLabel')
                        : t('checkpointAutoLabel')}
                    </p>
                    <p className="text-[11px] text-ds-muted mt-0.5">
                      {cp.createdAt.slice(0, 19).replace('T', ' ')}
                    </p>
                    <p className="text-[10px] text-ds-muted/70 mt-0.5">
                      Turn {cp.turnId.slice(0, 8)} · Seq {cp.eventSeq}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirm({
                        checkpointId: cp.id,
                        action: 'restore-code',
                        label: t('checkpointRestoreCode'),
                        message: t('checkpointConfirmRestoreCode'),
                        confirmDirtyOverwrite: true
                      })
                    }
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ds-text bg-ds-bg-muted hover:bg-ds-border-muted transition-colors"
                    title={t('checkpointRestoreCode')}
                  >
                    <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                    {t('checkpointRestoreCode')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirm({
                        checkpointId: cp.id,
                        action: 'restore-conversation',
                        label: t('checkpointRestoreConversation'),
                        message: t('checkpointConfirmRestoreConversation')
                      })
                    }
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ds-text bg-ds-bg-muted hover:bg-ds-border-muted transition-colors"
                    title={t('checkpointRestoreConversation')}
                  >
                    <MessageSquare className="h-3 w-3" strokeWidth={1.5} />
                    {t('checkpointRestoreConversation')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirm({
                        checkpointId: cp.id,
                        action: 'restore-both',
                        label: t('checkpointRestoreBoth'),
                        message: t('checkpointConfirmRestoreBoth')
                      })
                    }
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-950/30 dark:hover:bg-red-950/50 transition-colors"
                    title={t('checkpointRestoreBoth')}
                  >
                    <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                    {t('checkpointRestoreBoth')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onFork(cp.id, false)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ds-text bg-ds-bg-muted hover:bg-ds-border-muted transition-colors"
                    title={t('checkpointFork')}
                  >
                    <GitFork className="h-3 w-3" strokeWidth={1.5} />
                    {t('checkpointFork')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onFork(cp.id, true)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ds-text bg-ds-bg-muted hover:bg-ds-border-muted transition-colors"
                    title={t('checkpointForkWithWorktree')}
                  >
                    <GitFork className="h-3 w-3" strokeWidth={1.5} />
                    {t('checkpointForkWithWorktree')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirm({
                        checkpointId: cp.id,
                        action: 'delete',
                        label: t('checkpointDelete'),
                        message: t('checkpointConfirmDelete')
                      })
                    }
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-ds-text bg-ds-bg-muted hover:bg-ds-border-muted transition-colors"
                    title={t('checkpointDelete')}
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirm && (
        <div className="border-t border-ds-border-muted bg-ds-bg-muted p-4">
          <p className="text-sm font-semibold text-ds-text mb-1">
            {t('checkpointConfirmTitle')}
          </p>
          <p className="text-xs text-ds-muted mb-3">{confirm.message}</p>
          <div className="flex gap-2" dir="ltr">
            <button
              type="button"
              onClick={dismissConfirm}
              className="flex-1 rounded-md border border-ds-border-muted px-3 py-1.5 text-xs font-medium text-ds-text hover:bg-ds-bg-muted transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={executeConfirmed}
              className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
