import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { HooksStateResult, HookTrustStateInfo } from '@shared/ds-gui-api'

type HooksBrowserProps = {
  workspaceRoot: string
}

export function HooksBrowser({ workspaceRoot }: HooksBrowserProps): React.ReactElement {
  const { t } = useTranslation()
  const [state, setState] = useState<HooksStateResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewHookId, setReviewHookId] = useState<string | null>(null)
  const [sourceContent, setSourceContent] = useState<string | null>(null)
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)

  const loadState = useCallback(async () => {
    if (typeof window === 'undefined' || !window.dsGui?.getHooksState) return
    try {
      setError(null)
      const result = await window.dsGui.getHooksState(workspaceRoot)
      setState(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [workspaceRoot])

  useEffect(() => {
    void loadState()
  }, [loadState])

  const handleApprove = useCallback(async (hookId: string) => {
    if (!window.dsGui?.approveHook) return
    try {
      await window.dsGui.approveHook(hookId, workspaceRoot)
      await loadState()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [workspaceRoot, loadState])

  const handleRevoke = useCallback(async (hookId: string) => {
    if (!window.dsGui?.revokeHook) return
    try {
      await window.dsGui.revokeHook(hookId)
      await loadState()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [loadState])

  const handleKillSwitch = useCallback(async (enabled: boolean) => {
    if (!window.dsGui?.setHooksKillSwitch) return
    try {
      await window.dsGui.setHooksKillSwitch(enabled)
      await loadState()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [loadState])

  const handleReview = useCallback(async (hookId: string) => {
    if (!window.dsGui?.readHookSource) return
    setReviewHookId(hookId)
    setSourceLoading(true)
    try {
      const result = await window.dsGui.readHookSource(hookId, workspaceRoot)
      if (result.ok) {
        setSourceContent(result.content)
        setSourcePath(result.scriptPath)
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSourceLoading(false)
    }
  }, [workspaceRoot])

  const closeReview = useCallback(() => {
    setReviewHookId(null)
    setSourceContent(null)
    setSourcePath(null)
  }, [])

  const trustBadge = (hook: HookTrustStateInfo): { label: string; className: string } => {
    if (!state?.killSwitchEnabled) return { label: t('hooksStatusDisabled'), className: 'hooks-badge-disabled' }
    if (hook.trusted && hook.hashMatches) return { label: t('hooksStatusTrusted'), className: 'hooks-badge-trusted' }
    if (!hook.trusted && hook.approvedAt) return { label: t('hooksStatusRevoked'), className: 'hooks-badge-revoked' }
    if (hook.trusted && !hook.hashMatches) return { label: t('hooksStatusChanged'), className: 'hooks-badge-changed' }
    return { label: t('hooksStatusUntrusted'), className: 'hooks-badge-untrusted' }
  }

  if (loading) {
    return <div className="hooks-loading" dir="auto">{t('loading')}</div>
  }

  return (
    <div className="hooks-browser" dir="auto">
      {/* Master Kill Switch */}
      <div className="hooks-kill-switch">
        <label className="hooks-kill-switch-label">
          <input
            type="checkbox"
            checked={state?.killSwitchEnabled ?? false}
            onChange={(e) => handleKillSwitch(e.target.checked)}
          />
          <span>{t('hooksKillSwitch')}</span>
        </label>
        <p className="hooks-kill-switch-hint">{t('hooksKillSwitchHint')}</p>
      </div>

      {error && <div className="hooks-error">{error}</div>}

      {/* Audit Log Summary */}
      {state && state.auditLog.length > 0 && (
        <div className="hooks-audit-summary">
          <h4>{t('hooksAuditLog')} ({state.auditLog.length})</h4>
          <div className="hooks-audit-list">
            {state.auditLog.slice(-10).reverse().map((event, i) => (
              <div key={i} className="hooks-audit-entry">
                <span className="hooks-audit-hook-id">{event.hookId}</span>
                <span className="hooks-audit-phase">{event.phase}</span>
                <span className="hooks-audit-duration">{event.durationMs}ms</span>
                <span className={`hooks-audit-exit ${event.exitCode === 0 ? 'hooks-exit-ok' : 'hooks-exit-err'}`}>
                  {event.exitCode === null ? 'killed' : event.exitCode}
                </span>
                {event.decision === 'deny' && <span className="hooks-audit-deny">{t('hooksDecisionDeny')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hook List */}
      <div className="hooks-list">
        {state && state.hooks.length === 0 && (
          <p className="hooks-empty">{t('hooksNoneFound')}</p>
        )}
        {state?.hooks.map((hook) => {
          const badge = trustBadge(hook)
          return (
            <div key={hook.id} className="hooks-item" dir="auto">
              <div className="hooks-item-header">
                <span className="hooks-item-id">{hook.id}</span>
                <span className={`hooks-badge ${badge.className}`}>{badge.label}</span>
                <span className="hooks-item-phase">{hook.phase}</span>
                <span className="hooks-item-scope">{hook.scope}</span>
              </div>
              <div className="hooks-item-path" dir="ltr">{hook.scriptPath}</div>
              <div className="hooks-item-actions">
                <button
                  className="hooks-btn hooks-btn-review"
                  onClick={() => handleReview(hook.id)}
                >
                  {t('hooksReviewSource')}
                </button>
                {hook.trusted && hook.hashMatches ? (
                  <button
                    className="hooks-btn hooks-btn-revoke"
                    onClick={() => handleRevoke(hook.id)}
                  >
                    {t('hooksRevoke')}
                  </button>
                ) : (
                  <button
                    className="hooks-btn hooks-btn-approve"
                    onClick={() => handleApprove(hook.id)}
                    disabled={!state?.killSwitchEnabled}
                  >
                    {t('hooksApprove')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Review Dialog (inline modal) */}
      {reviewHookId && (
        <div className="hooks-review-overlay" onClick={closeReview}>
          <div className="hooks-review-dialog" onClick={(e) => e.stopPropagation()} dir="auto">
            <div className="hooks-review-header">
              <h3>{t('hooksReviewTitle')}: {reviewHookId}</h3>
              <button className="hooks-btn hooks-btn-close" onClick={closeReview}>✕</button>
            </div>
            {sourcePath && (
              <p className="hooks-review-path" dir="ltr">{sourcePath}</p>
            )}
            {sourceLoading ? (
              <p>{t('loading')}</p>
            ) : sourceContent !== null ? (
              <pre className="hooks-review-source" dir="ltr">{sourceContent}</pre>
            ) : (
              <p>{t('hooksSourceNotFound')}</p>
            )}
            <div className="hooks-review-actions">
              <button
                className="hooks-btn hooks-btn-approve"
                onClick={() => { handleApprove(reviewHookId); closeReview() }}
                disabled={!state?.killSwitchEnabled}
              >
                {t('hooksApproveAndClose')}
              </button>
              <button className="hooks-btn hooks-btn-close" onClick={closeReview}>
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
