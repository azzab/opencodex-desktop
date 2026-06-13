import type { ReactElement } from 'react'
import { useState, useCallback } from 'react'
import {
  Shield, Key, Loader2, CheckCircle2, XCircle,
  Zap, Monitor, ArrowRight, SkipForward, ExternalLink
} from 'lucide-react'
import { BUILT_IN_PROVIDER_PROFILES } from '@shared/provider-profiles'
import type { ModelProviderProfileV1 } from '@shared/app-settings'

type Props = {
  t: (key: string) => string
  tCommon: (key: string) => string
  existingProviders: ModelProviderProfileV1[]
  onComplete: () => void
  onSkip: () => void
  show?: boolean
}

type DetectionResult = {
  ok: boolean
  providerId: string
  providerName?: string
  models?: string[]
  latencyMs?: number
  message?: string
}

export function FirstRunConnectFlow({
  t, tCommon, existingProviders, onComplete, onSkip, show = true
}: Props): ReactElement {
  const [step, setStep] = useState<'intro' | 'provider-select' | 'key-entry' | 'done'>('intro')
  const [selectedProviderId, setSelectedProviderId] = useState('deepseek')
  const [keyValue, setKeyValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localScanning, setLocalScanning] = useState(false)
  const [localResults, setLocalResults] = useState<DetectionResult[]>([])

  const existingIds = new Set(existingProviders.map((p) => p.id))

  const handleProviderSelect = useCallback((providerId: string) => {
    setSelectedProviderId(providerId)
    setError(null)
  }, [])

  const handleKeyEntry = useCallback(async () => {
    if (!keyValue.trim()) {
      setError('Please enter an API key.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const def = BUILT_IN_PROVIDER_PROFILES.find((p) => p.id === selectedProviderId)
      const result = await window.dsGui.providerValidateKey({
        providerId: selectedProviderId,
        key: keyValue.trim(),
        baseUrl: def?.baseUrl || 'https://api.deepseek.com/v1',
        endpointFormat: def?.endpointFormat
      })
      if (!result.ok) {
        setError(result.message)
        setBusy(false)
        return
      }
      await window.dsGui.providerSaveKey(selectedProviderId, keyValue.trim())
      setStep('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }, [keyValue, selectedProviderId])

  const handleDetectLocal = useCallback(async () => {
    setLocalScanning(true)
    try {
      const results = await window.dsGui.detectLocalProviders()
      setLocalResults(results)
    } catch (e) {
      setLocalResults([{ ok: false, providerId: 'error', message: e instanceof Error ? e.message : String(e) }])
    } finally {
      setLocalScanning(false)
    }
  }, [])

  if (!show) return <></>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-ds-border bg-ds-card p-6 shadow-2xl" dir="auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <Shield className="mx-auto mb-3 h-10 w-10 text-accent" strokeWidth={1.5} />
          <h2 className="text-[18px] font-bold text-ds-ink">{t('firstRunConnectTitle')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-ds-muted">{t('firstRunConnectSubtitle')}</p>
        </div>

        {/* Step: Intro / Provider Select */}
        {(step === 'intro' || step === 'provider-select') ? (
          <>
            {/* Pre-configured DeepSeek card */}
            <div className="mb-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-accent/10 p-1.5">
                  <Key className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-ds-ink">DeepSeek</h3>
                  <p className="mt-0.5 text-[12px] text-ds-muted">{t('firstRunConnectDefaultDesc')}</p>
                  <div className="mt-2 flex items-stretch gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      placeholder={t('providerKeyPlaceholder')}
                      className="min-w-0 flex-1 rounded-lg border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] text-ds-ink placeholder:text-ds-faint focus:border-accent/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => { setSelectedProviderId('deepseek'); void handleKeyEntry() }}
                      disabled={busy || !keyValue.trim()}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      {busy ? t('providerTestingConnection') : t('firstRunConnectAction')}
                    </button>
                  </div>
                  {error ? <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); void window.dsGui.openExternal('https://platform.deepseek.com/api_keys') }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-ds-muted hover:text-accent"
                  >
                    <ExternalLink className="h-3 w-3" />{t('providerSignUp')}
                  </a>
                </div>
              </div>
            </div>

            {/* Other cloud providers */}
            <p className="mb-2 text-[12px] font-semibold text-ds-muted">{t('providerAddBuiltIn')}</p>
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              {BUILT_IN_PROVIDER_PROFILES.filter((d) => d.id !== 'deepseek' && !existingIds.has(d.id)).map((def) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => { setSelectedProviderId(def.id); setStep('key-entry'); setKeyValue(''); setError(null) }}
                  className="flex items-center gap-2 rounded-lg border border-ds-border px-3 py-2 text-start text-[12px] transition hover:border-accent/40 hover:bg-ds-hover"
                >
                  <Shield className="h-3.5 w-3.5 shrink-0 text-ds-muted" />
                  <span className="font-semibold text-ds-ink">{def.name}</span>
                </button>
              ))}
            </div>

            {/* Local providers auto-detect */}
            <div className="rounded-xl border border-dashed border-ds-border bg-ds-card/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-ds-muted" />
                  <span className="text-[13px] font-semibold text-ds-ink">{t('providerAutoDetect')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDetectLocal()}
                  disabled={localScanning}
                  className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
                >
                  {localScanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  {localScanning ? t('providerAutoDetecting') : t('providerAutoDetect')}
                </button>
              </div>
              {localScanning ? (
                <p className="mt-1.5 text-[11px] text-ds-muted">{t('firstRunConnectLocalDetecting')}</p>
              ) : null}
              {localResults.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {localResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${r.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'bg-ds-subtle text-ds-muted'}`}>
                      {r.ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                      <span className="flex-1">{r.ok ? t('firstRunConnectLocalFound').replace('{{name}}', r.providerName || r.providerId).replace('{{count}}', String(r.models?.length ?? 0)) : r.message}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* Step: Key Entry (for non-DeepSeek providers) */}
        {step === 'key-entry' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-ds-border bg-ds-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-5 w-5 text-ds-muted" />
                <h3 className="text-[15px] font-semibold text-ds-ink">
                  {BUILT_IN_PROVIDER_PROFILES.find((d) => d.id === selectedProviderId)?.name || selectedProviderId}
                </h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[12px] font-medium text-ds-muted mb-1">{t('providerKeyPlaceholder')}</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    placeholder={t('providerKeyPlaceholder')}
                    className="w-full rounded-lg border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] text-ds-ink placeholder:text-ds-faint focus:border-accent/40 focus:outline-none"
                  />
                </div>
                {error ? <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
                <p className="text-[11px] text-ds-faint">{t('providerKeySecurityNote')}</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setStep('intro'); setError(null) }} className="rounded-lg border border-ds-border px-3 py-1.5 text-[12px] font-medium text-ds-muted transition hover:bg-ds-hover">
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleKeyEntry()}
                    disabled={busy || !keyValue.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-[12px] font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {busy ? t('providerTestingConnection') : t('firstRunConnectAction')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Step: Done */}
        {step === 'done' ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
            <h3 className="text-[16px] font-semibold text-ds-ink">{t('providerStatusConnected')}</h3>
            <p className="mt-1 text-[13px] text-ds-muted">{t('firstRunConnectLaterDesc')}</p>
            <button
              type="button"
              onClick={onComplete}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-6 py-2 text-[14px] font-medium text-white transition hover:bg-accent/90"
            >
              <ArrowRight className="h-4 w-4" />
              {t('firstRunConnectAction')}
            </button>
          </div>
        ) : null}

        {/* Footer: Skip */}
        {step !== 'done' ? (
          <div className="mt-5 flex items-center justify-between border-t border-ds-border-muted pt-3">
            <p className="text-[11px] text-ds-faint">{t('firstRunConnectLaterDesc')}</p>
            <button
              type="button"
              onClick={onSkip}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-ds-muted transition hover:text-ds-ink"
            >
              <SkipForward className="h-3.5 w-3.5" />
              {t('firstRunConnectSkip')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
