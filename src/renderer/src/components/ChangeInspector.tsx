import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ClipboardList,
  Copy,
  ExternalLink,
  FileEdit,
  GitCommitHorizontal,
  GitPullRequest,
  Loader2,
  PanelRightClose,
  RefreshCw,
  ShieldAlert,
  Trash2
} from 'lucide-react'
import type {
  GitFileStatus,
  GitFileStatusCategory,
  GitDiffFile,
  GitAuditEvent,
  GitReviewPreparationResult,
  GitWorkingTreeStatus,
  GitWorktreeRow
} from '@shared/git-branches'
import type { ChatBlock, ToolBlock } from '../agent/types'
import {
  countDiffStats,
  extractDiffFilePath,
  extractUnifiedDiffText,
  formatFilePathForDisplay,
} from '../lib/diff-stats'
import { useChatStore } from '../store/chat-store'
import { GitBranchPicker } from './chat/GitBranchPicker'
import { DiffView } from './DiffView'

/**
 * Right-side change inspector — file_change items only.
 * Selecting a row reveals the unified patch in the bottom panel.
 */
export function ChangeInspector({
  blocks,
  className,
  workspaceRoot: workspaceRootProp,
  onCollapse
}: {
  blocks: ChatBlock[]
  className?: string
  workspaceRoot?: string
  onCollapse: () => void
}): ReactElement {
  const { t } = useTranslation('common')
  const selectedId = useChatStore((s) => s.inspectorSelectedId)
  const selectInspectorItem = useChatStore((s) => s.selectInspectorItem)
  const storedWorkspaceRoot = useChatStore((s) => s.workspaceRoot)
  const workspaceRoot = workspaceRootProp ?? storedWorkspaceRoot
  const [gitStatus, setGitStatus] = useState<GitWorkingTreeStatus | null>(null)
  const [gitDiffFiles, setGitDiffFiles] = useState<GitDiffFile[]>([])
  const [selectedGitDiffPath, setSelectedGitDiffPath] = useState<string | null>(null)
  const [gitWorktrees, setGitWorktrees] = useState<GitWorktreeRow[]>([])
  const [gitReviewPreparation, setGitReviewPreparation] = useState<GitReviewPreparationResult | null>(null)
  const [gitAuditEvents, setGitAuditEvents] = useState<GitAuditEvent[]>([])
  const [gitReviewLoading, setGitReviewLoading] = useState(false)
  const [gitReviewBusyPath, setGitReviewBusyPath] = useState<string | null>(null)
  const [gitWorktreeBusy, setGitWorktreeBusy] = useState<string | null>(null)
  const [gitReviewPrepBusy, setGitReviewPrepBusy] = useState(false)
  const [gitReviewError, setGitReviewError] = useState<string | null>(null)
  const [worktreeBranchDraft, setWorktreeBranchDraft] = useState('')
  const [worktreeBaseBranchDraft, setWorktreeBaseBranchDraft] = useState('')
  const [worktreeHandoffMarkdown, setWorktreeHandoffMarkdown] = useState('')
  const [reviewCommitMessageDraft, setReviewCommitMessageDraft] = useState('')
  const [reviewCommentDraft, setReviewCommentDraft] = useState('')
  const [reviewComments, setReviewComments] = useState<GitReviewComment[]>([])

  const fileChanges = useMemo<ToolBlock[]>(() => {
    return blocks.flatMap((block): ToolBlock[] => {
      if (!(block.kind === 'tool' && block.toolKind === 'file_change')) {
        return []
      }

      const detailText = extractUnifiedDiffText(block.detail)
      if (!detailText) return []

      return [
        {
          ...block,
          detail: detailText,
          filePath: extractDiffFilePath(detailText, block.filePath)
        }
      ]
    })
  }, [blocks])

  useEffect(() => {
    if (fileChanges.length === 0 && selectedId !== null) {
      selectInspectorItem(null)
      return
    }
    if (selectedId && !fileChanges.some((b) => b.id === selectedId)) {
      selectInspectorItem(fileChanges[fileChanges.length - 1]?.id ?? null)
    }
  }, [fileChanges, selectedId, selectInspectorItem])

  const active = fileChanges.find((b) => b.id === selectedId) ?? fileChanges[fileChanges.length - 1]

  const gitDiffFileKey = useCallback((file: GitDiffFile): string => (
    `${file.staged ? 'staged' : 'unstaged'}:${file.path}`
  ), [])

  const loadGitReview = useCallback(async (): Promise<void> => {
    const root = workspaceRoot?.trim()
    if (!root || typeof window.dsGui?.getGitBranches !== 'function') {
      setGitStatus(null)
      setGitDiffFiles([])
      setSelectedGitDiffPath(null)
      setGitWorktrees([])
      setGitReviewPreparation(null)
      setGitAuditEvents([])
      return
    }
    setGitReviewLoading(true)
    setGitReviewError(null)
    try {
      const [branches, audit, diff, worktrees, preparation] = await Promise.all([
        window.dsGui.getGitBranches(root),
        typeof window.dsGui.listGitAuditEvents === 'function'
          ? window.dsGui.listGitAuditEvents(root, { limit: 20 })
          : Promise.resolve(null),
        typeof window.dsGui.getGitDiff === 'function'
          ? window.dsGui.getGitDiff(root)
          : Promise.resolve(null),
        typeof window.dsGui.listGitWorktrees === 'function'
          ? window.dsGui.listGitWorktrees(root)
          : Promise.resolve(null),
        typeof window.dsGui.getGitReviewPreparation === 'function'
          ? window.dsGui.getGitReviewPreparation(root, {
              commitMessage: reviewCommitMessageDraft.trim() || undefined
            })
          : Promise.resolve(null)
      ])
      if (branches.ok) {
        setGitStatus(branches.status)
        setWorktreeBaseBranchDraft((draft) => draft || branches.currentBranch || 'main')
      } else {
        setGitStatus(null)
        setGitReviewError(branches.message)
      }
      if (diff?.ok) {
        setGitDiffFiles(diff.files)
        setSelectedGitDiffPath((current) =>
          current && diff.files.some((file) => gitDiffFileKey(file) === current || file.path === current)
            ? current
            : diff.files[0] ? gitDiffFileKey(diff.files[0]) : null
        )
      } else if (diff && !diff.ok) {
        setGitDiffFiles([])
        setSelectedGitDiffPath(null)
        setGitReviewError(diff.message)
      }
      if (worktrees?.ok) {
        setGitWorktrees(worktrees.worktrees)
      } else if (worktrees && !worktrees.ok) {
        setGitWorktrees([])
        setGitReviewError(worktrees.message)
      }
      setGitReviewPreparation(preparation)
      if (preparation && !preparation.ok) setGitReviewError(preparation.message)
      setGitAuditEvents(audit?.ok ? audit.events : [])
    } catch (error) {
      setGitStatus(null)
      setGitDiffFiles([])
      setSelectedGitDiffPath(null)
      setGitWorktrees([])
      setGitReviewPreparation(null)
      setGitAuditEvents([])
      setGitReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setGitReviewLoading(false)
    }
  }, [gitDiffFileKey, reviewCommitMessageDraft, workspaceRoot])

  useEffect(() => {
    void loadGitReview()
  }, [loadGitReview])

  const stageGitPath = async (path: string): Promise<void> => {
    const root = workspaceRoot?.trim()
    if (!root || typeof window.dsGui?.stageGitPaths !== 'function') return
    setGitReviewBusyPath(`stage:${path}`)
    setGitReviewError(null)
    try {
      const result = await window.dsGui.stageGitPaths(root, [path])
      if (result.ok) {
        setGitStatus(result.status)
        await loadGitReview()
      } else {
        setGitReviewError(result.message)
        if (result.status) setGitStatus(result.status)
      }
    } catch (error) {
      setGitReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setGitReviewBusyPath(null)
    }
  }

  const discardGitPath = async (path: string): Promise<void> => {
    const root = workspaceRoot?.trim()
    if (!root || typeof window.dsGui?.discardGitChanges !== 'function') return
    if (!window.confirm(t('gitReviewDiscardConfirm', { path }))) return
    setGitReviewBusyPath(`discard:${path}`)
    setGitReviewError(null)
    try {
      const result = await window.dsGui.discardGitChanges(root, [path], {
        confirmation: 'discard-local-changes'
      })
      if (result.ok) {
        setGitStatus(result.status)
        await loadGitReview()
      } else {
        setGitReviewError(result.message)
        if (result.status) setGitStatus(result.status)
      }
    } catch (error) {
      setGitReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setGitReviewBusyPath(null)
    }
  }

  const createWorktree = async (): Promise<void> => {
    const root = workspaceRoot?.trim()
    const branch = worktreeBranchDraft.trim()
    if (!root || !branch || typeof window.dsGui?.createManagedGitWorktree !== 'function') return
    setGitWorktreeBusy('create')
    setGitReviewError(null)
    try {
      const result = await window.dsGui.createManagedGitWorktree(root, {
        branch,
        baseBranch: worktreeBaseBranchDraft.trim() || undefined
      })
      if (result.ok) {
        setWorktreeBranchDraft('')
        await loadGitReview()
      } else {
        setGitReviewError(result.message)
      }
    } catch (error) {
      setGitReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setGitWorktreeBusy(null)
    }
  }

  const openWorktree = async (path: string): Promise<void> => {
    if (typeof window.dsGui?.openEditorPath !== 'function') return
    setGitWorktreeBusy(`open:${path}`)
    setGitReviewError(null)
    try {
      const result = await window.dsGui.openEditorPath({ path, workspaceRoot: path, editorId: 'system' })
      if (!result.ok) setGitReviewError(result.message)
    } catch (error) {
      setGitReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setGitWorktreeBusy(null)
    }
  }

  const createWorktreeHandoff = async (path: string): Promise<void> => {
    const root = workspaceRoot?.trim()
    if (!root || typeof window.dsGui?.createGitWorktreeHandoffSummary !== 'function') return
    setGitWorktreeBusy(`handoff:${path}`)
    setGitReviewError(null)
    try {
      const result = await window.dsGui.createGitWorktreeHandoffSummary(root, path)
      if (result.ok) {
        setWorktreeHandoffMarkdown(result.markdown)
      } else {
        setGitReviewError(result.message)
      }
    } catch (error) {
      setGitReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setGitWorktreeBusy(null)
    }
  }

  const removeWorktree = async (path: string): Promise<void> => {
    const root = workspaceRoot?.trim()
    if (!root || typeof window.dsGui?.removeManagedGitWorktree !== 'function') return
    if (!window.confirm(t('gitWorktreeRemoveConfirm', { path }))) return
    setGitWorktreeBusy(`remove:${path}`)
    setGitReviewError(null)
    try {
      const result = await window.dsGui.removeManagedGitWorktree(root, path, {
        confirmation: 'snapshot-and-remove-dirty-worktree'
      })
      if (result.ok) {
        await loadGitReview()
      } else {
        setGitReviewError(result.message)
      }
    } catch (error) {
      setGitReviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setGitWorktreeBusy(null)
    }
  }

  const addReviewComment = (path: string): void => {
    const body = reviewCommentDraft.trim()
    if (!path || !body) return
    setReviewComments((comments) => [
      ...comments,
      {
        id: `review_comment_${Date.now()}`,
        path,
        body
      }
    ])
    setReviewCommentDraft('')
  }

  return (
    <aside
      className={`ds-no-drag ds-panel-ghost flex flex-col border-l border-ds-border-muted backdrop-blur-xl ${className ?? ''}`}
    >
      <div className="flex min-h-[58px] shrink-0 items-center gap-3 border-b border-ds-border-muted px-3 py-3">
        <button
          type="button"
          onClick={onCollapse}
          className="ds-sidebar-toggle-button shrink-0"
          aria-label={t('rightPanelCollapse')}
          title={t('rightPanelCollapse')}
        >
          <PanelRightClose className="h-4 w-4" strokeWidth={1.85} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wide text-ds-muted">
            {t('inspectorTitle')}
          </div>
          <div className="mt-1 truncate text-[11px] text-ds-faint">
            {fileChanges.length > 0
              ? t('inspectorSummaryFiles', { count: fileChanges.length })
              : t('inspectorEmpty')}
          </div>
        </div>
        {workspaceRoot ? <GitBranchPicker workspaceRoot={workspaceRoot} /> : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {workspaceRoot ? (
          <>
            <GitReviewPanelView
              status={gitStatus}
              auditCount={gitAuditEvents.length}
              busyPath={gitReviewBusyPath}
              loading={gitReviewLoading}
              error={gitReviewError}
              onRefresh={() => void loadGitReview()}
              onStagePath={(path) => void stageGitPath(path)}
              onDiscardPath={(path) => void discardGitPath(path)}
            />
            <GitLiveDiffPanelView
              files={gitDiffFiles}
              selectedPath={selectedGitDiffPath}
              loading={gitReviewLoading}
              error={null}
              commentDraft={reviewCommentDraft}
              comments={reviewComments}
              onSelectPath={setSelectedGitDiffPath}
              onRefresh={() => void loadGitReview()}
              onCommentDraftChange={setReviewCommentDraft}
              onAddComment={addReviewComment}
            />
            <GitAuditTimelinePanelView
              events={gitAuditEvents}
              loading={gitReviewLoading}
              error={null}
              onRefresh={() => void loadGitReview()}
            />
            <GitWorktreePanelView
              worktrees={gitWorktrees}
              branchDraft={worktreeBranchDraft}
              baseBranchDraft={worktreeBaseBranchDraft}
              handoffMarkdown={worktreeHandoffMarkdown}
              busy={gitWorktreeBusy}
              loading={gitReviewLoading}
              error={null}
              onBranchDraftChange={setWorktreeBranchDraft}
              onBaseBranchDraftChange={setWorktreeBaseBranchDraft}
              onRefresh={() => void loadGitReview()}
              onCreate={() => void createWorktree()}
              onOpen={(path) => void openWorktree(path)}
              onHandoff={(path) => void createWorktreeHandoff(path)}
              onRemove={(path) => void removeWorktree(path)}
            />
            <GitReviewPreparationPanelView
              preparation={gitReviewPreparation}
              commitMessageDraft={reviewCommitMessageDraft}
              busy={gitReviewPrepBusy}
              error={null}
              onCommitMessageDraftChange={setReviewCommitMessageDraft}
              onRefresh={() => {
                setGitReviewPrepBusy(true)
                void loadGitReview().finally(() => setGitReviewPrepBusy(false))
              }}
            />
          </>
        ) : null}
        {fileChanges.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
            <div>
              <FileEdit className="mx-auto h-7 w-7 text-ds-faint" strokeWidth={1.25} />
              <div className="mt-3 text-[12px] font-medium text-ds-muted">
                {t('inspectorEmptyTitle')}
              </div>
              <div className="mt-1 text-[11px] leading-6 text-ds-faint">{t('inspectorEmpty')}</div>
            </div>
          </div>
        ) : (
          <>
            <div className="max-h-[42%] min-h-0 overflow-y-auto py-2">
              <ul className="divide-y divide-ds-border-muted/60">
                {fileChanges.map((b) => {
                  const stats = countDiffStats(b.detail)
                  const displayPath = formatFilePathForDisplay(b.filePath, workspaceRoot)
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => selectInspectorItem(b.id)}
                        className={`flex w-full items-start gap-2 px-4 py-2.5 text-left transition ${
                          active?.id === b.id
                            ? 'bg-ds-hover text-ds-ink'
                            : 'text-ds-ink hover:bg-ds-hover/70'
                        }`}
                      >
                        <FileEdit
                          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                            b.status === 'error' ? 'text-red-700' : 'text-ds-muted'
                          }`}
                          strokeWidth={1.75}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] text-ds-ink">
                            {displayPath ?? t('toolActionFile')}
                          </div>
                          {stats ? (
                            <div className="mt-0.5 flex gap-2 text-[10px] font-mono">
                              <span className="text-ds-diff-added">
                                +{stats.added}
                              </span>
                              <span className="text-ds-diff-removed">
                                -{stats.removed}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        {b.status === 'running' ? (
                          <span className="rounded-full bg-amber-200/40 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-700/30 dark:text-amber-100">
                            {t('inspectorStatusRunning')}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="ds-panel-strip flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-ds-border-muted">
              {active?.detail ? (
                <DiffView patch={active.detail} maxHeight={9999} className="h-full min-w-0 rounded-none border-0" />
              ) : (
                <div className="ds-surface-soft flex h-full items-center justify-center border border-dashed border-ds-border-muted px-4 py-6 text-center text-[11px] leading-6 text-ds-muted">
                  {t('inspectorSelectHint')}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

type GitReviewPanelViewProps = {
  status: GitWorkingTreeStatus | null
  auditCount: number | null
  busyPath: string | null
  loading?: boolean
  error: string | null
  onRefresh: () => void
  onStagePath: (path: string) => void
  onDiscardPath: (path: string) => void
}

const GIT_REVIEW_GROUPS: Array<{
  category: GitFileStatusCategory
  labelKey: string
}> = [
  { category: 'staged', labelKey: 'gitReviewGroupStaged' },
  { category: 'modified', labelKey: 'gitReviewGroupModified' },
  { category: 'deleted', labelKey: 'gitReviewGroupModified' },
  { category: 'renamed', labelKey: 'gitReviewGroupModified' },
  { category: 'untracked', labelKey: 'gitReviewGroupUntracked' },
  { category: 'conflicted', labelKey: 'gitReviewGroupConflicted' }
]

function visibleGitFiles(status: GitWorkingTreeStatus | null): GitFileStatus[] {
  return status?.files ?? []
}

function canStageFile(file: GitFileStatus): boolean {
  return file.category !== 'staged' && file.category !== 'conflicted'
}

function canDiscardFile(file: GitFileStatus): boolean {
  return file.category !== 'untracked' && file.category !== 'conflicted'
}

export function GitReviewPanelView({
  status,
  auditCount,
  busyPath,
  loading = false,
  error,
  onRefresh,
  onStagePath,
  onDiscardPath
}: GitReviewPanelViewProps): ReactElement {
  const { t } = useTranslation('common')
  const files = visibleGitFiles(status)
  const grouped = GIT_REVIEW_GROUPS
    .map((group) => ({
      ...group,
      files: files.filter((file) => file.category === group.category)
    }))
    .filter((group) => group.files.length > 0)

  return (
    <section className="border-b border-ds-border-muted bg-ds-card/45 px-3 py-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-ds-muted" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ds-ink">{t('gitReviewTitle')}</div>
          <div className="mt-0.5 truncate text-[10px] text-ds-faint">
            {status
              ? status.clean
                ? t('gitReviewClean')
                : t('gitReviewSummary', {
                    staged: status.stagedCount,
                    modified: status.modifiedCount,
                    untracked: status.untrackedCount
                  })
              : t('gitReviewUnavailable')}
            {auditCount != null ? ` · ${t('gitReviewAuditEvents', { count: auditCount })}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="ds-chip-muted shrink-0 rounded-md p-1 text-ds-faint transition hover:text-ds-ink"
          onClick={onRefresh}
          aria-label={t('gitReviewRefresh')}
          title={t('gitReviewRefresh')}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
        </button>
      </div>

      {error ? (
        <div className="mb-2 flex gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/35 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      {grouped.length > 0 ? (
        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {grouped.map((group) => (
            <div key={group.category}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0] text-ds-faint">
                {t(group.labelKey)}
              </div>
              <ul className="space-y-1">
                {group.files.map((file) => (
                  <li
                    key={`${file.category}:${file.path}`}
                    className="rounded-md border border-ds-border-muted bg-ds-subtle/70 px-2 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ds-ink" title={file.path}>
                        {file.path}
                      </span>
                      {canStageFile(file) ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink disabled:opacity-45"
                          disabled={busyPath != null}
                          onClick={() => onStagePath(file.path)}
                        >
                          {busyPath === `stage:${file.path}` ? t('gitReviewWorking') : t('gitReviewStage')}
                        </button>
                      ) : null}
                      {canDiscardFile(file) ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-45 dark:text-red-300 dark:hover:bg-red-950/35"
                          disabled={busyPath != null}
                          onClick={() => onDiscardPath(file.path)}
                        >
                          {busyPath === `discard:${file.path}` ? t('gitReviewWorking') : t('gitReviewDiscard')}
                        </button>
                      ) : null}
                    </div>
                    {canDiscardFile(file) ? (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-ds-faint">
                        <ShieldAlert className="h-3 w-3" strokeWidth={1.8} />
                        {t('gitReviewRequiresConfirmation')}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-ds-border-muted px-2.5 py-2 text-[11px] leading-5 text-ds-muted">
          {status?.clean ? t('gitReviewCleanDetail') : t('gitReviewEmpty')}
        </div>
      )}
    </section>
  )
}

type GitLiveDiffPanelViewProps = {
  files: GitDiffFile[]
  selectedPath: string | null
  loading?: boolean
  error: string | null
  commentDraft: string
  comments: GitReviewComment[]
  onSelectPath: (path: string) => void
  onRefresh: () => void
  onCommentDraftChange: (value: string) => void
  onAddComment: (path: string) => void
}

type GitReviewComment = {
  id: string
  path: string
  body: string
}

function gitLiveDiffFileKey(file: GitDiffFile): string {
  return `${file.staged ? 'staged' : 'unstaged'}:${file.path}`
}

export function GitLiveDiffPanelView({
  files,
  selectedPath,
  loading = false,
  error,
  commentDraft,
  comments,
  onSelectPath,
  onRefresh,
  onCommentDraftChange,
  onAddComment
}: GitLiveDiffPanelViewProps): ReactElement {
  const { t } = useTranslation('common')
  const active = files.find((file) => gitLiveDiffFileKey(file) === selectedPath) ??
    files.find((file) => file.path === selectedPath) ??
    files[0] ??
    null
  const activeComments = active ? comments.filter((comment) => comment.path === active.path) : []

  return (
    <section className="border-b border-ds-border-muted bg-ds-card/40 px-3 py-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <FileEdit className="h-3.5 w-3.5 shrink-0 text-ds-muted" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ds-ink">{t('gitDiffTitle')}</div>
          <div className="mt-0.5 truncate text-[10px] text-ds-faint">
            {files.length > 0 ? t('gitDiffSummary', { count: files.length }) : t('gitDiffEmpty')}
          </div>
        </div>
        <button
          type="button"
          className="ds-chip-muted shrink-0 rounded-md p-1 text-ds-faint transition hover:text-ds-ink"
          onClick={onRefresh}
          aria-label={t('gitDiffRefresh')}
          title={t('gitDiffRefresh')}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
        </button>
      </div>

      {error ? (
        <div className="mb-2 flex gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/35 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="space-y-2">
          <div className="flex max-h-24 gap-1 overflow-x-auto pb-1">
            {files.map((file) => (
              <button
                key={gitLiveDiffFileKey(file)}
                type="button"
                onClick={() => onSelectPath(gitLiveDiffFileKey(file))}
                className={`min-w-36 max-w-48 rounded-md border px-2 py-1.5 text-left transition ${
                  active === file
                    ? 'border-ds-border bg-ds-elevated text-ds-ink'
                    : 'border-ds-border-muted bg-ds-subtle/65 text-ds-muted hover:bg-ds-hover'
                }`}
              >
                <div className="truncate font-mono text-[10px]" title={file.path}>{file.path}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-ds-faint">
                  <span>{file.staged ? t('gitDiffStaged') : t('gitDiffUnstaged')}</span>
                  <span className="text-ds-diff-added">+{file.additions}</span>
                  <span className="text-ds-diff-removed">-{file.deletions}</span>
                </div>
              </button>
            ))}
          </div>
          {active ? (
            <DiffView
              patch={active.patch}
              filePath={active.path}
              maxHeight={220}
              className="rounded-md border border-ds-border-muted"
            />
          ) : null}
          {active ? (
            <div className="rounded-md border border-ds-border-muted bg-ds-subtle/65 px-2 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0] text-ds-faint">
                {t('gitReviewCommentsTitle')}
              </div>
              <textarea
                value={commentDraft}
                onChange={(event) => onCommentDraftChange(event.target.value)}
                placeholder={t('gitReviewCommentPlaceholder')}
                className="min-h-14 w-full resize-y rounded-md border border-ds-border-muted bg-ds-elevated px-2 py-1.5 text-[11px] leading-5 text-ds-ink outline-none placeholder:text-ds-faint"
              />
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  disabled={!commentDraft.trim()}
                  onClick={() => onAddComment(active.path)}
                  className="rounded-md bg-ds-ink px-2 py-1 text-[10px] font-medium text-ds-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {t('gitReviewAddComment')}
                </button>
              </div>
              {activeComments.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {activeComments.map((comment) => (
                    <li
                      key={comment.id}
                      className="rounded-md border border-ds-border-muted bg-ds-elevated px-2 py-1.5 text-[11px] leading-5 text-ds-muted"
                    >
                      {comment.body}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-[10px] text-ds-faint">{t('gitReviewCommentsEmpty')}</div>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-ds-border-muted px-2.5 py-2 text-[11px] leading-5 text-ds-muted">
          {t('gitDiffEmptyDetail')}
        </div>
      )}
    </section>
  )
}

type GitAuditTimelinePanelViewProps = {
  events: GitAuditEvent[]
  loading?: boolean
  error: string | null
  onRefresh: () => void
}

function gitAuditEventDetail(event: GitAuditEvent): string {
  if (event.paths?.length) return event.paths.join(', ')
  if (event.snapshotPath) return event.snapshotPath
  if (event.worktreePath) return event.worktreePath
  return event.branch ?? event.repositoryRoot
}

export function GitAuditTimelinePanelView({
  events,
  loading = false,
  error,
  onRefresh
}: GitAuditTimelinePanelViewProps): ReactElement {
  const { t } = useTranslation('common')

  return (
    <section className="border-b border-ds-border-muted bg-ds-card/35 px-3 py-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-ds-muted" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ds-ink">{t('gitAuditTimelineTitle')}</div>
          <div className="mt-0.5 truncate text-[10px] text-ds-faint">
            {events.length > 0 ? t('gitAuditTimelineSummary', { count: events.length }) : t('gitAuditTimelineEmpty')}
          </div>
        </div>
        <button
          type="button"
          className="ds-chip-muted shrink-0 rounded-md p-1 text-ds-faint transition hover:text-ds-ink"
          onClick={onRefresh}
          aria-label={t('gitAuditTimelineRefresh')}
          title={t('gitAuditTimelineRefresh')}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
        </button>
      </div>

      {error ? (
        <div className="mb-2 flex gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/35 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      {events.length > 0 ? (
        <ul className="max-h-36 space-y-1 overflow-y-auto pr-1">
          {events.map((event) => (
            <li
              key={event.id}
              className="rounded-md border border-ds-border-muted bg-ds-subtle/65 px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold text-ds-ink">
                  {event.action}
                </span>
                <span className="shrink-0 text-[10px] text-ds-faint">{event.outcome}</span>
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-ds-muted" title={gitAuditEventDetail(event)}>
                {gitAuditEventDetail(event)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-dashed border-ds-border-muted px-2.5 py-2 text-[11px] leading-5 text-ds-muted">
          {t('gitAuditTimelineEmptyDetail')}
        </div>
      )}
    </section>
  )
}

type GitWorktreePanelViewProps = {
  worktrees: GitWorktreeRow[]
  branchDraft: string
  baseBranchDraft: string
  handoffMarkdown: string
  busy: string | null
  loading?: boolean
  error: string | null
  onBranchDraftChange: (value: string) => void
  onBaseBranchDraftChange: (value: string) => void
  onRefresh: () => void
  onCreate: () => void
  onOpen: (path: string) => void
  onHandoff: (path: string) => void
  onRemove: (path: string) => void
}

function shortWorktreePath(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

export function GitWorktreePanelView({
  worktrees,
  branchDraft,
  baseBranchDraft,
  handoffMarkdown,
  busy,
  loading = false,
  error,
  onBranchDraftChange,
  onBaseBranchDraftChange,
  onRefresh,
  onCreate,
  onOpen,
  onHandoff,
  onRemove
}: GitWorktreePanelViewProps): ReactElement {
  const { t } = useTranslation('common')
  const managedCount = worktrees.filter((worktree) => worktree.managed).length

  return (
    <section className="border-b border-ds-border-muted bg-ds-card/35 px-3 py-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <ClipboardList className="h-3.5 w-3.5 shrink-0 text-ds-muted" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ds-ink">{t('gitWorktreeTitle')}</div>
          <div className="mt-0.5 truncate text-[10px] text-ds-faint">
            {t('gitWorktreeSummary', { total: worktrees.length, managed: managedCount })}
          </div>
        </div>
        <button
          type="button"
          className="ds-chip-muted shrink-0 rounded-md p-1 text-ds-faint transition hover:text-ds-ink"
          onClick={onRefresh}
          aria-label={t('gitWorktreeRefresh')}
          title={t('gitWorktreeRefresh')}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
        </button>
      </div>

      {error ? (
        <div className="mb-2 flex gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/35 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(78px,0.45fr)_auto] gap-1.5">
        <input
          value={branchDraft}
          onChange={(event) => onBranchDraftChange(event.target.value)}
          placeholder={t('gitWorktreeBranchPlaceholder')}
          className="min-w-0 rounded-md border border-ds-border-muted bg-ds-elevated px-2 py-1.5 text-[11px] text-ds-ink outline-none placeholder:text-ds-faint"
        />
        <input
          value={baseBranchDraft}
          onChange={(event) => onBaseBranchDraftChange(event.target.value)}
          placeholder={t('gitWorktreeBasePlaceholder')}
          className="min-w-0 rounded-md border border-ds-border-muted bg-ds-elevated px-2 py-1.5 text-[11px] text-ds-ink outline-none placeholder:text-ds-faint"
        />
        <button
          type="button"
          disabled={!branchDraft.trim() || busy != null}
          onClick={onCreate}
          className="rounded-md bg-ds-ink px-2 py-1.5 text-[10px] font-medium text-ds-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy === 'create' ? t('gitReviewWorking') : t('gitWorktreeCreate')}
        </button>
      </div>

      {worktrees.length > 0 ? (
        <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
          {worktrees.map((worktree) => (
            <div
              key={worktree.path}
              className="rounded-md border border-ds-border-muted bg-ds-subtle/65 px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] text-ds-ink" title={worktree.path}>
                    {worktree.branch ?? shortWorktreePath(worktree.path)}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-ds-faint">
                    {worktree.managed ? t('gitWorktreeManaged') : t('gitWorktreeExternal')} · {shortWorktreePath(worktree.path)}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink disabled:opacity-45"
                  disabled={busy != null}
                  onClick={() => onOpen(worktree.path)}
                >
                  {busy === `open:${worktree.path}` ? t('gitReviewWorking') : t('gitWorktreeOpen')}
                </button>
                {worktree.managed ? (
                  <>
                    <button
                      type="button"
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-ds-muted transition hover:bg-ds-hover hover:text-ds-ink disabled:opacity-45"
                      disabled={busy != null}
                      onClick={() => onHandoff(worktree.path)}
                    >
                      {busy === `handoff:${worktree.path}` ? t('gitReviewWorking') : t('gitWorktreeHandoff')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-45 dark:text-red-300 dark:hover:bg-red-950/35"
                      disabled={busy != null}
                      onClick={() => onRemove(worktree.path)}
                      title={t('gitWorktreeSnapshotRemoveHint')}
                    >
                      <Trash2 className="inline h-3 w-3 align-[-2px]" strokeWidth={1.8} />{' '}
                      {busy === `remove:${worktree.path}` ? t('gitReviewWorking') : t('gitWorktreeSnapshotRemove')}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-ds-border-muted px-2.5 py-2 text-[11px] leading-5 text-ds-muted">
          {t('gitWorktreeEmpty')}
        </div>
      )}

      {handoffMarkdown ? (
        <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-ds-border-muted bg-ds-elevated px-2 py-2 text-[10px] leading-5 text-ds-muted">
          {handoffMarkdown}
        </pre>
      ) : null}
    </section>
  )
}

type GitReviewPreparationPanelViewProps = {
  preparation: GitReviewPreparationResult | null
  commitMessageDraft: string
  busy: boolean
  error: string | null
  onCommitMessageDraftChange: (value: string) => void
  onRefresh: () => void
}

function readinessLabel(ready: boolean, readyKey: string, blockedKey: string): string {
  return ready ? readyKey : blockedKey
}

export function GitReviewPreparationPanelView({
  preparation,
  commitMessageDraft,
  busy,
  error,
  onCommitMessageDraftChange,
  onRefresh
}: GitReviewPreparationPanelViewProps): ReactElement {
  const { t } = useTranslation('common')
  const ok = preparation?.ok ? preparation : null
  const blockedReasons = ok?.blockedReasons ?? []

  const copyCommand = async (command: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="border-b border-ds-border-muted bg-ds-card/30 px-3 py-3">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-ds-muted" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-ds-ink">{t('gitPrepTitle')}</div>
          <div className="mt-0.5 truncate text-[10px] text-ds-faint">{t('gitPrepExplicitOnly')}</div>
        </div>
        <button
          type="button"
          className="ds-chip-muted shrink-0 rounded-md p-1 text-ds-faint transition hover:text-ds-ink"
          onClick={onRefresh}
          aria-label={t('gitPrepRefresh')}
          title={t('gitPrepRefresh')}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
        </button>
      </div>

      {error || (preparation && !preparation.ok) ? (
        <div className="mb-2 flex gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/35 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="min-w-0 break-words">{error ?? (preparation && !preparation.ok ? preparation.message : '')}</span>
        </div>
      ) : null}

      <input
        value={commitMessageDraft}
        onChange={(event) => onCommitMessageDraftChange(event.target.value)}
        placeholder={t('gitPrepCommitMessagePlaceholder')}
        className="w-full rounded-md border border-ds-border-muted bg-ds-elevated px-2 py-1.5 text-[11px] text-ds-ink outline-none placeholder:text-ds-faint"
      />

      {ok ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-ds-muted">
            <div className="min-w-0 rounded-md border border-ds-border-muted bg-ds-subtle/65 px-2 py-1">
              <span className="text-ds-faint">{t('gitPrepBranch')}: </span>
              <span className="font-mono text-ds-ink">{ok.currentBranch ?? t('gitDetached')}</span>
            </div>
            <div className="min-w-0 rounded-md border border-ds-border-muted bg-ds-subtle/65 px-2 py-1">
              <span className="text-ds-faint">{t('gitPrepUpstream')}: </span>
              <span className="font-mono text-ds-ink">{ok.upstream ?? t('gitPrepNoUpstream')}</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] font-medium">
            <span className={`rounded-md px-2 py-1 ${ok.commitReady ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200' : 'bg-ds-subtle text-ds-faint'}`}>
              {t(readinessLabel(ok.commitReady, 'gitPrepCommitReady', 'gitPrepCommitBlocked'))}
            </span>
            <span className={`rounded-md px-2 py-1 ${ok.pushReady ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200' : 'bg-ds-subtle text-ds-faint'}`}>
              {t(readinessLabel(ok.pushReady, 'gitPrepPushReady', 'gitPrepPushBlocked'))}
            </span>
            <span className={`rounded-md px-2 py-1 ${ok.prReady ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-200' : 'bg-ds-subtle text-ds-faint'}`}>
              {t(readinessLabel(ok.prReady, 'gitPrepPrReady', 'gitPrepPrBlocked'))}
            </span>
          </div>

          {blockedReasons.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[10px] leading-5 text-ds-muted">
              {blockedReasons.map((reason) => (
                <li key={reason} className="rounded-md bg-ds-subtle px-2 py-1">
                  {reason}
                </li>
              ))}
            </ul>
          ) : null}

          {ok.suggestedCommands.length > 0 ? (
            <div className="mt-2 space-y-1">
              {ok.suggestedCommands.map((command) => (
                <div
                  key={command}
                  className="flex min-w-0 items-start gap-2 rounded-md border border-ds-border-muted bg-ds-elevated px-2 py-1.5 text-[10px] leading-5 text-ds-muted"
                >
                  <code className="min-w-0 flex-1 overflow-x-auto">
                    <ExternalLink className="mr-1 inline h-3 w-3 align-[-2px]" strokeWidth={1.7} />
                    {command}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyCommand(command)}
                    className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-ds-faint transition hover:bg-ds-hover hover:text-ds-ink"
                  >
                    <Copy className="mr-1 inline h-3 w-3 align-[-2px]" strokeWidth={1.7} />
                    {t('gitPrepCopyCommand')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-dashed border-ds-border-muted px-2.5 py-2 text-[11px] leading-5 text-ds-muted">
              {t('gitPrepNoCommands')}
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 rounded-md border border-dashed border-ds-border-muted px-2.5 py-2 text-[11px] leading-5 text-ds-muted">
          {t('gitPrepEmpty')}
        </div>
      )}
    </section>
  )
}
