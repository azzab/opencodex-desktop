import { useState, useCallback, useEffect, type ReactElement } from 'react'
import { Smartphone, QrCode, Trash2, AlertTriangle, Wifi } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { AppSettingsPatch, AppSettingsV1, MobileAccessDeviceV1 } from '@shared/app-settings'
import type { MobileAccessQrPayloadResult } from '@shared/ds-gui-api'
import { SettingsCard, SettingRow, Toggle } from './settings-controls'

type MobileAccessSettingsContext = {
  t: (key: string, values?: Record<string, unknown>) => string
  form: AppSettingsV1
  update: (partial: AppSettingsPatch) => void
}

interface QrPayload {
  pairingCode: string
  expiresAt: string
  certFingerprint: string | null
  hostCandidates: { host: string; port: number }[]
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function MobileAccessSettingsSection({ ctx }: { ctx: MobileAccessSettingsContext }): ReactElement {
  const { t, form, update } = ctx
  const mobileAccess = form.agents.kun.mobileAccess
  const enabled = Boolean(mobileAccess?.enabled)
  const devices: MobileAccessDeviceV1[] = Array.isArray(mobileAccess?.devices) ? mobileAccess.devices : []
  const auditLog = Array.isArray(mobileAccess?.auditLog) ? mobileAccess.auditLog : []
  const port = typeof mobileAccess?.port === 'number' ? mobileAccess.port : 19443

  const [showQrDialog, setShowQrDialog] = useState(false)
  const [qrPayload, setQrPayload] = useState<QrPayload | null>(null)
  const [qrExpired, setQrExpired] = useState(false)
  const [qrCountdown, setQrCountdown] = useState(0)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState('')

  const patchMobile = (p: Record<string, unknown>) => {
    update({ agents: { kun: { mobileAccess: p } } } as unknown as AppSettingsPatch)
  }

  const handleToggle = async () => {
    const newEnabled = !enabled
    // Call IPC to start/stop the listener
    if (typeof window !== 'undefined' && typeof window.dsGui?.setMobileAccessEnabled === 'function') {
      await window.dsGui.setMobileAccessEnabled(newEnabled)
    }
    patchMobile({ enabled: newEnabled })
  }

  const handleRevokeDevice = async (deviceId: string) => {
    // Call IPC to revoke via pairing service
    if (typeof window !== 'undefined' && typeof window.dsGui?.revokeMobileAccessDevice === 'function') {
      await window.dsGui.revokeMobileAccessDevice(deviceId)
    } else {
      // Fallback for test/dev environments without IPC
      patchMobile({ devices: devices.filter((d) => d.id !== deviceId) })
    }
  }

  const handleRevokeAll = async () => {
    // Call IPC to revoke all via pairing service
    if (typeof window !== 'undefined' && typeof window.dsGui?.revokeAllMobileAccessDevices === 'function') {
      await window.dsGui.revokeAllMobileAccessDevices()
    } else {
      // Fallback for test/dev environments without IPC
      patchMobile({ devices: [] })
    }
  }

  const generateQr = useCallback(async () => {
    setQrLoading(true)
    setQrError('')

    // Call IPC to generate real QR payload via pairing service + listener
    if (typeof window !== 'undefined' && typeof window.dsGui?.getMobileAccessQrPayload === 'function') {
      const result = (await window.dsGui.getMobileAccessQrPayload()) as MobileAccessQrPayloadResult
      if (!result.ok) {
        setQrError(result.message)
        setQrLoading(false)
        return
      }

      const expiresMs = new Date(result.expiresAt).getTime()
      setQrPayload({
        pairingCode: result.pairingCode,
        expiresAt: result.expiresAt,
        certFingerprint: result.certFingerprint,
        hostCandidates: result.hostCandidates
      })
      setQrExpired(false)

      const tick = () => {
        const remaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
        setQrCountdown(remaining)
        if (remaining <= 0) {
          setQrExpired(true)
        }
      }
      tick()
      const interval = setInterval(tick, 1000)
      const maxWait = expiresMs - Date.now() + 5000
      const timeout = setTimeout(() => clearInterval(interval), Math.max(0, maxWait))
      setQrLoading(false)
      return () => {
        clearInterval(interval)
        clearTimeout(timeout)
      }
    } else {
      // No IPC available — show error
      setQrError('Mobile access IPC bridge not available.')
      setQrLoading(false)
    }
  }, [])

  // Reset QR dialog state when it closes
  useEffect(() => {
    if (!showQrDialog) {
      setQrPayload(null)
      setQrExpired(false)
      setQrCountdown(0)
      setQrLoading(false)
      setQrError('')
    }
  }, [showQrDialog])

  const tStr = (key: string, values?: Record<string, unknown>): string => t(key, values) as string

  return (
    <div className="flex flex-col gap-6" dir="auto">
      {/* Master toggle */}
      <SettingsCard title={tStr('mobileAccessTitle')}>
        <SettingRow
          title={tStr('mobileAccessTitle')}
          description={tStr('mobileAccessDescription')}
          control={
            <Toggle
              checked={enabled}
              onChange={handleToggle}
            />
          }
        />
      </SettingsCard>

      {enabled && (
        <>
          <SettingsCard title={tStr('mobileAccessPairingTitle')}>
            <SettingRow
              title={tStr('mobileAccessPairingTitle')}
              description={tStr('mobileAccessPairingDescription')}
              control={
                <button
                  type="button"
                  onClick={() => {
                    setShowQrDialog(true)
                    void generateQr()
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{tStr('mobileAccessShowQr')}</span>
                </button>
              }
            />
          </SettingsCard>

          <SettingsCard title={tStr('mobileAccessDevicesTitle')}>
            <div className="px-3 py-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-ds-muted">
                  {devices.length === 0
                    ? tStr('mobileAccessDevicesEmpty')
                    : tStr('mobileAccessDevicesCount', { count: devices.length })}
                </p>
                {devices.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRevokeAll}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border transition-colors text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{tStr('mobileAccessRevokeAll')}</span>
                  </button>
                )}
              </div>

              {devices.length === 0 ? (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-ds-border-muted">
                  <Smartphone className="w-5 h-5 text-ds-muted" />
                  <p className="text-sm text-ds-muted">{tStr('mobileAccessDevicesEmptyHint')}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-ds-border-muted bg-ds-card"
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className="w-4 h-4 text-ds-muted shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-ds-ink">{device.name}</p>
                          <p className="text-xs text-ds-muted">
                            {tStr('mobileAccessDevicePaired', { date: formatDateTime(device.createdAt) })}
                            {' · '}
                            {tStr('mobileAccessDeviceLastSeen', { date: formatDateTime(device.lastSeenAt) })}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevokeDevice(device.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{tStr('mobileAccessRevoke')}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SettingsCard>

          {auditLog.length > 0 && (
            <SettingsCard title={tStr('mobileAccessAuditTitle')}>
              <div className="px-3 py-2">
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {auditLog.slice(0, 10).map((event) => (
                    <div key={event.id} className="flex items-center gap-2 text-xs py-1">
                      <span className="text-ds-muted font-mono shrink-0">{event.timestamp.slice(11, 19)}</span>
                      <span className="px-1.5 py-0.5 rounded bg-ds-card border border-ds-border-muted font-mono text-[10px] shrink-0">
                        {event.action}
                      </span>
                      {event.deviceName && (
                        <span className="text-ds-muted truncate">{event.deviceName}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </SettingsCard>
          )}
        </>
      )}

      {/* QR Pairing Dialog */}
      {showQrDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowQrDialog(false)}>
          <div
            className="bg-white dark:bg-ds-card rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
            dir="ltr"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ds-ink">{tStr('mobileAccessQrTitle')}</h2>
              <button
                type="button"
                onClick={() => setShowQrDialog(false)}
                className="text-ds-muted hover:text-ds-ink transition-colors"
                aria-label={tStr('close')}
              >
                ✕
              </button>
            </div>

            {qrLoading ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-ds-muted">Generating pairing code…</p>
              </div>
            ) : qrError ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <AlertTriangle className="w-10 h-10 text-red-500" />
                <p className="text-sm text-center text-red-600">{qrError}</p>
                <button
                  type="button"
                  onClick={() => setShowQrDialog(false)}
                  className="px-4 py-2 border border-ds-border-muted rounded-lg text-sm"
                >
                  {tStr('close')}
                </button>
              </div>
            ) : qrExpired ? (
              <div className="flex flex-col items-center gap-4 py-6">
                <AlertTriangle className="w-10 h-10 text-amber-500" />
                <p className="text-sm text-center text-ds-ink">{tStr('mobileAccessQrExpired')}</p>
                <button
                  type="button"
                  onClick={() => { void generateQr() }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  {tStr('mobileAccessQrRegenerate')}
                </button>
              </div>
            ) : qrPayload ? (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-white p-4 rounded-xl shadow-inner">
                  <QRCodeSVG
                    value={JSON.stringify({
                      v: 1,
                      host: qrPayload.hostCandidates[0]?.host ?? 'localhost',
                      port: qrPayload.hostCandidates[0]?.port ?? port,
                      certFingerprint: qrPayload.certFingerprint ?? '',
                      pairingCode: qrPayload.pairingCode,
                      expiresAt: qrPayload.expiresAt
                    })}
                    size={200}
                    level="M"
                  />
                </div>

                <div className="text-center">
                  <p className="text-xs text-ds-muted mb-1">{tStr('mobileAccessPairingCode')}</p>
                  <p className="text-2xl font-mono font-bold tracking-widest select-all text-ds-ink">
                    {qrPayload.pairingCode}
                  </p>
                </div>

                <p className={`text-xs ${qrCountdown <= 30 ? 'text-red-500 font-medium' : 'text-ds-muted'}`}>
                  {tStr('mobileAccessExpiresIn', {
                    minutes: Math.floor(qrCountdown / 60),
                    seconds: (qrCountdown % 60).toString().padStart(2, '0')
                  })}
                </p>

                <div className="w-full text-xs text-ds-muted space-y-1 border-t border-ds-border-muted pt-3">
                  {qrPayload.hostCandidates.map((c, i) => (
                    <p key={i} className="font-mono">
                      <Wifi className="w-3 h-3 inline me-1" />
                      {c.host}:{c.port}
                    </p>
                  ))}
                  {qrPayload.certFingerprint ? (
                    <p className="font-mono break-all text-[10px]">
                      {tStr('mobileAccessCertFingerprint')}: {qrPayload.certFingerprint}
                    </p>
                  ) : null}
                </div>

                <div className="text-xs text-ds-muted text-center space-y-1">
                  <p>1. {tStr('mobileAccessQrStep1')}</p>
                  <p>2. {tStr('mobileAccessQrStep2')}</p>
                  <p>3. {tStr('mobileAccessQrStep3')}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
