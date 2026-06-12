/**
 * Remote Runners Settings Section — host list, handshake status,
 * trust management, connect/disconnect/reconnect controls,
 * audit/error states, and en/zh/ar RTL-safe strings.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppSettingsV1, KunRuntimeSettingsV1 } from '@shared/app-settings'
import {
  CheckCircle2,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Shield,
  ShieldOff,
  Trash2,
  Unlink,
  Wifi,
  WifiOff,
  XCircle
} from 'lucide-react'
import { InlineNoticeView, SettingsCard, SettingRow, Toggle } from './settings-controls'

/* ------------------------------------------------------------------ */
/*  Types (mirrored from IPC / shared)                                 */
/* ------------------------------------------------------------------ */

type RemoteRunnerHostSummary = {
  id: string
  label: string
  enabled: boolean
  connectionStatus: string
  lastHandshake: {
    issuedAt: string
    shell: { os: string; shell: string }
    gitAvailable: boolean
    toolPolicy: Record<string, string>
  } | null
  lastError: string | null
  trustedPaths: Array<{ path: string; label: string; trustedAt: string; auditId: string }>
}

type RemoteRunnerStatusResult = {
  hosts: RemoteRunnerHostSummary[]
  enabled: boolean
  auditLog: Array<{
    id: string
    timestamp: string
    runnerId: string
    action: string
    outcome: string
    reason?: string
  }>
}

type RemoteRunnerActionResult = { ok: true } | { ok: false; message: string }

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

export type RemoteRunnersSettingsContext = {
  t: (key: string, options?: Record<string, unknown>) => string
  tCommon: (key: string) => string
  form: AppSettingsV1
  kun: KunRuntimeSettingsV1
  updateKun: (patch: Partial<AppSettingsV1['agents']['kun']>) => void
  selectControlClass: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusColor(status: string): string {
  switch (status) {
    case 'connected': return 'text-green-600 dark:text-green-400'
    case 'executing': return 'text-blue-600 dark:text-blue-400'
    case 'connecting':
    case 'handshaking': return 'text-amber-600 dark:text-amber-400'
    case 'error': return 'text-red-600 dark:text-red-400'
    default: return 'text-ds-muted'
  }
}

function statusIcon(status: string): ReactElement {
  const cls = `h-4 w-4 ${statusColor(status)}`
  switch (status) {
    case 'connected': return <CheckCircle2 className={cls} strokeWidth={1.75} />
    case 'executing': return <Wifi className={cls} strokeWidth={1.75} />
    case 'connecting':
    case 'handshaking': return <Loader2 className={`${cls} animate-spin`} strokeWidth={1.75} />
    case 'error': return <XCircle className={cls} strokeWidth={1.75} />
    case 'paused': return <WifiOff className={cls} strokeWidth={1.75} />
    default: return <Network className={`h-4 w-4 text-ds-muted`} strokeWidth={1.75} />
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function RemoteRunnersSettingsSection({ ctx }: { ctx: RemoteRunnersSettingsContext }): ReactElement {
  const { t, tCommon, kun, updateKun } = ctx
  const rrSettings = kun.remoteRunners

  const [status, setStatus] = useState<RemoteRunnerStatusResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyHostId, setBusyHostId] = useState<string | null>(null)
  const [newPathInput, setNewPathInput] = useState('')
  const [newPathLabel, setNewPathLabel] = useState('')
  const [activeHostForTrust, setActiveHostForTrust] = useState<string | null>(null)

  const loadStatus = useCallback(async (): Promise<void> => {
    if (typeof window.dsGui?.remoteRunnerStatus !== 'function') return
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.dsGui.remoteRunnerStatus()
      setStatus(result)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  /* ---- Enabled toggle ---- */

  const toggleEnabled = (enabled: boolean): void => {
    updateKun({ remoteRunners: { ...rrSettings, enabled } })
  }

  /* ---- Host management ---- */

  const addHost = (): void => {
    const id = `host_${Date.now()}`
    const newHost = {
      id,
      label: `SSH Host ${rrSettings.hosts.length + 1}`,
      enabled: true,
      endpointRef: '',
      credentialStorage: {
        kind: 'ssh-agent' as const,
        exportsRawSecret: false as const
      },
      hostKeyPolicy: 'known-hosts' as const,
      connectionStatus: 'disconnected' as const,
      trustedPaths: []
    }
    updateKun({
      remoteRunners: {
        ...rrSettings,
        hosts: [...rrSettings.hosts.map((h) => ({ ...h })), { ...newHost }]
      }
    })
    setTimeout(() => void loadStatus(), 300)
  }

  const removeHost = (hostId: string): void => {
    updateKun({
      remoteRunners: {
        ...rrSettings,
        hosts: rrSettings.hosts.filter((h) => h.id !== hostId).map((h) => ({ ...h }))
      }
    })
    setTimeout(() => void loadStatus(), 300)
  }

  const updateHost = (hostId: string, patch: Record<string, unknown>): void => {
    updateKun({
      remoteRunners: {
        ...rrSettings,
        hosts: rrSettings.hosts.map((h) => {
          if (h.id !== hostId) return { ...h }
          const updated = { ...h, ...patch }
          // Deep merge credentialStorage
          if (patch.credentialStorage) {
            updated.credentialStorage = {
              ...h.credentialStorage,
              ...(patch.credentialStorage as Record<string, unknown>)
            }
          }
          return updated
        })
      }
    })
  }

  /* ---- Host actions (IPC) ---- */

  const hostAction = async (hostId: string, action: string): Promise<void> => {
    if (typeof window.dsGui === 'undefined') return
    setBusyHostId(hostId)
    setNotice(null)
    try {
      let result: RemoteRunnerActionResult = { ok: false, message: 'Unknown action' }
      switch (action) {
        case 'connect':
          result = await window.dsGui.remoteRunnerConnect(hostId)
          break
        case 'disconnect':
          result = await window.dsGui.remoteRunnerDisconnect(hostId)
          break
        case 'reconnect':
          result = await window.dsGui.remoteRunnerReconnect(hostId)
          break
        case 'handshake':
          result = await window.dsGui.remoteRunnerHandshake(hostId)
          break
      }
      if (!result.ok) {
        setNotice(result.message)
      }
      await loadStatus()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyHostId(null)
    }
  }

  /* ---- Trust path ---- */

  const trustPath = async (hostId: string): Promise<void> => {
    const path = newPathInput.trim()
    const label = newPathLabel.trim() || path
    if (!path) return
    if (typeof window.dsGui?.remoteRunnerTrustPath !== 'function') return
    setNotice(null)
    try {
      const result = await window.dsGui.remoteRunnerTrustPath(hostId, path, label)
      if (!result.ok) {
        setNotice(result.message)
      } else {
        setNewPathInput('')
        setNewPathLabel('')
        setActiveHostForTrust(null)
        await loadStatus()
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }

  const revokeTrust = async (hostId: string, path: string): Promise<void> => {
    if (typeof window.dsGui?.remoteRunnerRevokeTrust !== 'function') return
    setNotice(null)
    try {
      const result = await window.dsGui.remoteRunnerRevokeTrust(hostId, path)
      if (!result.ok) {
        setNotice(result.message)
      }
      await loadStatus()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }

  /* ---- Render ---- */

  const selectCls = ctx.selectControlClass

  return (
    <div className="flex flex-col gap-8">
      {/* Enabled toggle */}
      <SettingsCard title={t('remoteRunners')}>
        <SettingRow
          title={t('remoteRunners')}
          description={t('remoteRunnersDesc')}
          control={<Toggle checked={rrSettings.enabled} onChange={toggleEnabled} />}
        />
      </SettingsCard>

      {!rrSettings.enabled ? (
        <p className="text-[13px] text-ds-muted">{t('remoteRunnersDesc')}</p>
      ) : (
        <>
          {/* Host list */}
          <SettingsCard title={t('remoteRunnerHosts')}>
            {rrSettings.hosts.length === 0 ? (
              <div className="px-3 py-4">
                <p className="text-[13px] text-ds-faint italic">{t('clawTasksEmpty')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-3 py-4">
                {rrSettings.hosts.map((host) => {
                  const hostStatus = status?.hosts.find((h) => h.id === host.id)
                  const connStatus = hostStatus?.connectionStatus ?? host.connectionStatus ?? 'disconnected'
                  const isBusy = busyHostId === host.id

                  return (
                    <div
                      key={host.id}
                      className="rounded-xl border border-ds-border bg-ds-main/50 p-4"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {statusIcon(connStatus)}
                            <input
                              type="text"
                              className="min-w-0 bg-transparent text-[15px] font-semibold text-ds-ink focus:outline-none"
                              value={host.label}
                              onChange={(e) => updateHost(host.id, { label: e.target.value })}
                            />
                          </div>
                          {hostStatus?.lastError ? (
                            <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">
                              {hostStatus.lastError}
                            </p>
                          ) : null}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1">
                          {connStatus === 'disconnected' || connStatus === 'idle' ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void hostAction(host.id, 'connect')}
                              className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ds-ink bg-ds-subtle hover:bg-ds-hover transition disabled:opacity-50"
                              title={t('remoteRunnerConnect')}
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('remoteRunnerConnect')}
                            </button>
                          ) : null}
                          {connStatus === 'connected' || connStatus === 'error' ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void hostAction(host.id, 'disconnect')}
                              className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ds-ink bg-ds-subtle hover:bg-ds-hover transition disabled:opacity-50"
                              title={t('remoteRunnerDisconnect')}
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                          {connStatus === 'connected' ? (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void hostAction(host.id, 'handshake')}
                                className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ds-ink bg-ds-subtle hover:bg-ds-hover transition disabled:opacity-50"
                                title={t('remoteRunnerHandshake')}
                              >
                                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void hostAction(host.id, 'reconnect')}
                                className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-ds-ink bg-ds-subtle hover:bg-ds-hover transition disabled:opacity-50"
                                title={t('remoteRunnerReconnect')}
                              >
                                {t('remoteRunnerReconnect')}
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeHost(host.id)}
                            className="rounded-lg px-2 py-1.5 text-[12px] text-ds-faint hover:text-red-500 transition"
                            title={t('remoteRunnerRemoveHost')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Config */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-medium text-ds-faint">
                            {t('remoteRunnerHostEndpointRef')}
                          </label>
                          <input
                            type="text"
                            className={`mt-0.5 ${selectCls} text-[13px]`}
                            value={host.endpointRef}
                            onChange={(e) => updateHost(host.id, { endpointRef: e.target.value })}
                            placeholder={t('remoteRunnerHostEndpointRefPlaceholder')}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-ds-faint">
                            {t('remoteRunnerHostUsernameRef')}
                          </label>
                          <input
                            type="text"
                            className={`mt-0.5 ${selectCls} text-[13px]`}
                            value={host.usernameRef ?? ''}
                            onChange={(e) => updateHost(host.id, { usernameRef: e.target.value || undefined })}
                            placeholder={t('remoteRunnerHostUsernameRefPlaceholder')}
                          />
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-medium text-ds-faint">
                            {t('remoteRunnerCredentialKind')}
                          </label>
                          <select
                            className={`mt-0.5 ${selectCls} text-[13px]`}
                            value={host.credentialStorage.kind}
                            onChange={(e) =>
                              updateHost(host.id, {
                                credentialStorage: {
                                  kind: e.target.value,
                                  exportsRawSecret: false
                                }
                              })
                            }
                          >
                            <option value="ssh-agent">{t('remoteRunnerCredentialKindSshAgent')}</option>
                            <option value="os-keychain">{t('remoteRunnerCredentialKindOsKeychain')}</option>
                            <option value="secret-manager">{t('remoteRunnerCredentialKindSecretManager')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-ds-faint">
                            {t('remoteRunnerHostKeyPolicy')}
                          </label>
                          <select
                            className={`mt-0.5 ${selectCls} text-[13px]`}
                            value={host.hostKeyPolicy}
                            onChange={(e) => updateHost(host.id, { hostKeyPolicy: e.target.value })}
                          >
                            <option value="known-hosts">{t('remoteRunnerHostKeyPolicyKnownHosts')}</option>
                            <option value="pinned-fingerprint-ref">{t('remoteRunnerHostKeyPolicyPinnedFingerprint')}</option>
                            <option value="manual-confirm">{t('remoteRunnerHostKeyPolicyManualConfirm')}</option>
                          </select>
                        </div>
                      </div>

                      {/* Connection status badge */}
                      <div className="mt-3 flex items-center gap-2 text-[12px]">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${statusColor(connStatus)}`}>
                          {statusIcon(connStatus)}
                          <span>
                            {connStatus === 'connected' ? t('remoteRunnerStatusConnected')
                              : connStatus === 'executing' ? t('remoteRunnerStatusExecuting')
                              : connStatus === 'connecting' ? t('remoteRunnerStatusConnecting')
                              : connStatus === 'handshaking' ? t('remoteRunnerStatusHandshaking')
                              : connStatus === 'paused' ? t('remoteRunnerStatusPaused')
                              : connStatus === 'error' ? t('remoteRunnerStatusError')
                              : t('remoteRunnerStatusIdle')}
                          </span>
                        </span>
                        {hostStatus?.lastHandshake ? (
                          <span className="text-ds-faint">
                            {hostStatus.lastHandshake.shell.os} · {hostStatus.lastHandshake.shell.shell}
                            {hostStatus.lastHandshake.gitAvailable ? ' · git' : ''}
                          </span>
                        ) : null}
                      </div>

                      {/* Trusted paths */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-medium text-ds-muted">
                            {t('remoteRunnerTrustedPaths')}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveHostForTrust(activeHostForTrust === host.id ? null : host.id)}
                            className="rounded-lg px-2 py-1 text-[12px] text-ds-muted hover:text-ds-ink hover:bg-ds-hover transition"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Trust path form */}
                        {activeHostForTrust === host.id ? (
                          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-ds-border bg-ds-subtle/30 p-2">
                            <input
                              type="text"
                              className={`${selectCls} text-[13px]`}
                              placeholder={t('remoteRunnerTrustPathPlaceholder')}
                              value={newPathInput}
                              onChange={(e) => setNewPathInput(e.target.value)}
                            />
                            <input
                              type="text"
                              className={`${selectCls} text-[13px]`}
                              placeholder={t('remoteRunnerTrustPathLabelPlaceholder')}
                              value={newPathLabel}
                              onChange={(e) => setNewPathLabel(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={!newPathInput.trim()}
                                onClick={() => void trustPath(host.id)}
                                className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition"
                              >
                                <Shield className="mr-1 inline h-3.5 w-3.5" />
                                {t('remoteRunnerTrustPath')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setActiveHostForTrust(null); setNewPathInput(''); setNewPathLabel('') }}
                                className="rounded-lg px-3 py-1.5 text-[12px] text-ds-muted hover:text-ds-ink transition"
                              >
                                {tCommon('cancel')}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {/* Existing trusted paths */}
                        {(hostStatus?.trustedPaths ?? host.trustedPaths ?? []).length > 0 ? (
                          <div className="mt-2 flex flex-col gap-1">
                            {(hostStatus?.trustedPaths ?? host.trustedPaths ?? []).map((tp) => (
                              <div
                                key={tp.path}
                                className="flex items-center justify-between rounded-lg bg-ds-subtle/30 px-2.5 py-1.5 text-[12px]"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-ds-ink">{tp.label}</span>
                                  <span className="ml-2 text-ds-faint font-mono">{tp.path}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void revokeTrust(host.id, tp.path)}
                                  className="ml-2 rounded p-0.5 text-ds-faint hover:text-red-500 transition"
                                  title={t('remoteRunnerRevokeTrustPath')}
                                >
                                  <ShieldOff className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[12px] text-ds-faint italic">
                            {t('remoteRunnerTrustRequired')}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="px-3 pb-4">
              <button
                type="button"
                onClick={addHost}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ds-border bg-ds-card px-3 py-2 text-[13px] font-medium text-ds-muted hover:bg-ds-hover hover:text-ds-ink transition"
              >
                <Plus className="h-4 w-4" />
                {t('remoteRunnerAddHost')}
              </button>
            </div>
          </SettingsCard>

          {/* Audit log */}
          <SettingsCard title={t('remoteRunnerAuditLog')}>
            <div className="px-3 py-4">
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void loadStatus()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ds-border bg-ds-card px-2.5 py-1.5 text-[12px] font-medium text-ds-muted hover:bg-ds-hover hover:text-ds-ink transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                  {t('kunDiagnosticsRefresh')}
                </button>
              </div>

              {status?.auditLog && status.auditLog.length > 0 ? (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-ds-border">
                  <table className="w-full text-[12px]">
                    <thead className="bg-ds-subtle sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-ds-muted">{t('remoteRunnerHosts')}</th>
                        <th className="px-3 py-2 text-left font-medium text-ds-muted">{t('remoteRunnerAuditAction')}</th>
                        <th className="px-3 py-2 text-left font-medium text-ds-muted">{t('remoteRunnerAuditOutcome')}</th>
                        <th className="px-3 py-2 text-left font-medium text-ds-muted hidden sm:table-cell">{t('remoteRunnerAuditTime')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.auditLog.slice().reverse().map((entry) => (
                        <tr key={entry.id} className="border-t border-ds-border-muted">
                          <td className="px-3 py-2 font-mono text-ds-faint">{entry.runnerId.slice(0, 12)}</td>
                          <td className="px-3 py-2 font-medium text-ds-ink">{entry.action.replace('remote-runner.', '')}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              entry.outcome === 'completed' || entry.outcome === 'allowed'
                                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                : entry.outcome === 'failed' || entry.outcome === 'denied' || entry.outcome === 'blocked'
                                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                  : 'bg-ds-subtle text-ds-muted'
                            }`}>
                              {entry.outcome}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-ds-faint hidden sm:table-cell">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12px] text-ds-faint italic">
                  {t('clawTasksEmpty')}
                </p>
              )}
            </div>
          </SettingsCard>
        </>
      )}

      {/* Notice */}
      {notice ? (
        <InlineNoticeView notice={{ tone: 'error', message: notice }} />
      ) : null}
    </div>
  )
}
