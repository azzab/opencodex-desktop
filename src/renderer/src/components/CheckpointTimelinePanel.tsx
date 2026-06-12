import { useState, useEffect, useCallback, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckpointTimeline } from './CheckpointTimeline'
import type { CheckpointSummary } from '../agent/checkpoint-types'
import {
  kunThreadCheckpointsPath,
  kunCheckpointRestorePath,
  kunCheckpointForkPath,
  kunCheckpointPath
} from '@shared/kun-endpoints'

type Props = {
  className?: string
  threadId: string
  workspaceRoot: string
  onCollapse: () => void
}

export function CheckpointTimelinePanel({
  className = '',
  threadId,
  workspaceRoot,
  onCollapse
}: Props): ReactElement {
  const { t } = useTranslation('common')
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCheckpoints = useCallback(async () => {
    if (!threadId) return
    setLoading(true)
    setError(null)
    try {
      const response = await window.dsGui.runtimeRequest(
        kunThreadCheckpointsPath(threadId),
        'GET'
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const parsed = JSON.parse(response.body) as { checkpoints: CheckpointSummary[] }
      setCheckpoints(parsed.checkpoints ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCheckpoints([])
    } finally {
      setLoading(false)
    }
  }, [threadId])

  useEffect(() => {
    void fetchCheckpoints()
  }, [fetchCheckpoints])

  const handleRestoreCode = useCallback(async (checkpointId: string, confirmDirtyOverwrite?: boolean) => {
    try {
      const response = await window.dsGui.runtimeRequest(
        kunCheckpointRestorePath(checkpointId),
        'POST',
        JSON.stringify({ checkpointId, target: 'code', confirmDirtyOverwrite })
      )
      if (response.ok) {
        setError(null)
        void fetchCheckpoints()
      } else if (response.status === 409) {
        // Gate 5: Dirty workspace blocked — surface the structured error
        const parsed = JSON.parse(response.body) as { code: string; message: string; details?: { stagedFiles: string[]; unstagedFiles: string[]; untrackedFiles: string[] } }
        const dirtyMsg = parsed.details
          ? [
              parsed.details.stagedFiles.length > 0 ? `Staged: ${parsed.details.stagedFiles.join(', ')}` : '',
              parsed.details.untrackedFiles.length > 0 ? `Untracked: ${parsed.details.untrackedFiles.join(', ')}` : ''
            ].filter(Boolean).join('; ')
          : parsed.message
        setError(dirtyMsg || parsed.message)
      } else {
        const parsed = JSON.parse(response.body) as { message?: string }
        setError(parsed.message || `HTTP ${response.status}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [fetchCheckpoints])

  const handleRestoreConversation = useCallback(async (checkpointId: string) => {
    try {
      const response = await window.dsGui.runtimeRequest(
        kunCheckpointRestorePath(checkpointId),
        'POST',
        JSON.stringify({ checkpointId, target: 'conversation' })
      )
      if (response.ok) {
        void fetchCheckpoints()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [fetchCheckpoints])

  const handleRestoreBoth = useCallback(async (checkpointId: string) => {
    try {
      const response = await window.dsGui.runtimeRequest(
        kunCheckpointRestorePath(checkpointId),
        'POST',
        JSON.stringify({ checkpointId, target: 'both' })
      )
      if (response.ok) {
        void fetchCheckpoints()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [fetchCheckpoints])

  const handleFork = useCallback(async (checkpointId: string, withWorktree: boolean) => {
    try {
      const response = await window.dsGui.runtimeRequest(
        kunCheckpointForkPath(checkpointId),
        'POST',
        JSON.stringify({ checkpointId, createWorktree: withWorktree })
      )
      if (response.ok) {
        void fetchCheckpoints()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [fetchCheckpoints])

  const handleDelete = useCallback(async (checkpointId: string) => {
    try {
      const response = await window.dsGui.runtimeRequest(
        kunCheckpointPath(checkpointId),
        'DELETE'
      )
      if (response.ok) {
        void fetchCheckpoints()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [fetchCheckpoints])

  return (
    <CheckpointTimeline
      className={className}
      checkpoints={checkpoints}
      loading={loading}
      onCollapse={onCollapse}
      error={error}
      onRestoreCode={handleRestoreCode}
      onRestoreConversation={handleRestoreConversation}
      onRestoreBoth={handleRestoreBoth}
      onFork={handleFork}
      onDelete={handleDelete}
    />
  )
}
