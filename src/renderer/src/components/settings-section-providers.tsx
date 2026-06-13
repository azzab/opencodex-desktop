import type { ReactElement } from 'react'
import { useState, useCallback, useMemo } from 'react'
import {
  Key, Link, Loader2, RefreshCw, Trash2, CheckCircle2, XCircle,
  AlertTriangle, Shield, Plus, Pencil, Search, Zap, Wifi, Monitor,
  ExternalLink, Clock, Star
} from 'lucide-react'
import type {
  AppSettingsV1,
  ModelProviderProfileV1,
  ModelProviderCatalogModelV1,
  ProviderCredentialStatus,
  PerTaskModelAssignment,
  FavoritedModel
} from '@shared/app-settings'
import { OPENROUTER_PROVIDER_ID, DEFAULT_MODEL_PROVIDER_ID } from '@shared/app-settings'
import {
  InlineNoticeView,
  SecretInput,
  SettingsCard,
  SettingRow,
  Toggle
} from './settings-controls'
import { BUILT_IN_PROVIDER_PROFILES, type BuiltInProviderProfileDef } from '@shared/provider-profiles'

type ProviderSettingsContext = {
  t: (key: string) => string
  tCommon: (key: string) => string
  form: AppSettingsV1
  provider: any
  update: (partial: any) => void
  selectControlClass: string
  modelCatalogBusy: boolean
  modelCatalogNotice: { tone: 'success' | 'error' | 'info'; message: string } | null
  refreshModelProviderCatalog: (providerId: string) => Promise<void>
}

type ProviderCardState = {
  validating: boolean
  saving: boolean
  discovering: boolean
  testing: boolean
  testResult: { ok: boolean; latencyMs: number; message: string } | null
  error: string | null
  notice: { tone: 'success' | 'error' | 'info'; message: string } | null
  showKeyInput: boolean
  keyInputValue: string
}

type LocalDetectResult = {
  ok: boolean
  providerId: string
  providerName?: string
  models?: string[]
  latencyMs?: number
  version?: string
  message?: string
}

type CustomProviderFormState = {
  id: string
  name: string
  baseUrl: string
  endpointFormat: 'chat_completions' | 'responses' | 'messages'
  keyInputValue: string
  validating: boolean
  saving: boolean
  validationError: string | null
  validationNotice: { tone: 'success' | 'error' | 'info'; message: string } | null
  discoveredModels: number
  validationOk: boolean
}

type CustomProviderFormMode = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; providerId: string; initial: ModelProviderProfileV1 }

export function ProvidersSettingsSection({ ctx }: { ctx: Record<string, any> }): ReactElement {
  const {
    t,
    tCommon,
    form,
    update,
    refreshModelProviderCatalog
  } = ctx as ProviderSettingsContext

  const providers = useMemo(() => form?.provider?.providers ?? [], [form?.provider?.providers])
  const [searchQuery, setSearchQuery] = useState('')
  const [cardStates, setCardStates] = useState<Record<string, ProviderCardState>>({})
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [showAddProviderPanel, setShowAddProviderPanel] = useState(false)

  // Local provider detection
  const [localDetectBusy, setLocalDetectBusy] = useState(false)
  const [localDetectResults, setLocalDetectResults] = useState<LocalDetectResult[]>([])

  // Custom provider form
  const [customFormMode, setCustomFormMode] = useState<CustomProviderFormMode>({ mode: 'closed' })
  const [customForm, setCustomForm] = useState<CustomProviderFormState>({
    id: '', name: '', baseUrl: '', endpointFormat: 'chat_completions',
    keyInputValue: '', validating: false, saving: false,
    validationError: null, validationNotice: null,
    discoveredModels: 0, validationOk: false
  })

  const getCardState = useCallback((providerId: string): ProviderCardState => {
    return cardStates[providerId] ?? {
      validating: false, saving: false, discovering: false, testing: false,
      testResult: null, error: null, notice: null,
      showKeyInput: false, keyInputValue: ''
    }
  }, [cardStates])

  const updateCardState = useCallback((providerId: string, patch: Partial<ProviderCardState>) => {
    setCardStates((prev) => ({
      ...prev,
      [providerId]: { ...getCardState(providerId), ...patch }
    }))
  }, [getCardState])

  const resolveCredentialStatus = (p: ModelProviderProfileV1): ProviderCredentialStatus => {
    return p.credentialStatus ?? (p.credentialMaskedPreview ? 'unvalidated' : 'unvalidated')
  }

  const isBuiltInProvider = (p: ModelProviderProfileV1): boolean => {
    return p.id === DEFAULT_MODEL_PROVIDER_ID || p.id === OPENROUTER_PROVIDER_ID
  }

  const isLocalProvider = (p: ModelProviderProfileV1): boolean => {
    return p.id === 'ollama' || p.id === 'lm-studio'
  }

  // ── Filtering ──

  const providerIdsAlreadyInSettings = useMemo(() => new Set(providers.map((p: ModelProviderProfileV1) => p.id)), [providers])

  const unaddedBuiltInProfiles = useMemo(() => {
    return BUILT_IN_PROVIDER_PROFILES.filter(
      (def) => !providerIdsAlreadyInSettings.has(def.id)
    )
  }, [providerIdsAlreadyInSettings])

  const filteredProviders = useMemo(() => {
    if (!searchQuery.trim()) return providers
    const q = searchQuery.toLowerCase().trim()
    return providers.filter((p: ModelProviderProfileV1) =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    )
  }, [providers, searchQuery])

  // ── Status badge ──

  const statusBadge = (status: ProviderCredentialStatus): ReactElement => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            {t('providerStatusConnected')}
          </span>
        )
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">
            <XCircle className="h-3 w-3" />
            {t('providerStatusInvalid')}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-ds-subtle px-2 py-0.5 text-[11px] font-medium text-ds-muted">
            <AlertTriangle className="h-3 w-3" />
            {t('providerStatusUnvalidated')}
          </span>
        )
    }
  }

  // ── OAuth ──

  const handleOAuth = async (): Promise<void> => {
    setOauthBusy(true)
    setOauthError(null)
    updateCardState(OPENROUTER_PROVIDER_ID, { error: null, notice: null })
    try {
      const result = await window.dsGui.providerOAuthStart()
      if (!result.ok) {
        const msg = result.message || t('providerOAuthErrorGeneric')
        const isCancel = /cancel|denied|refused/i.test(msg)
        setOauthError(msg)
        updateCardState(OPENROUTER_PROVIDER_ID, {
          error: msg,
          notice: { tone: isCancel ? 'info' : 'error', message: isCancel ? (/denied/i.test(msg) ? t('providerOAuthDenied') : t('providerOAuthCancelled')) : msg }
        })
        return
      }

      const currentProviders = (form?.provider?.providers ?? []).map((p: ModelProviderProfileV1) =>
        p.id === OPENROUTER_PROVIDER_ID
          ? { ...p, credentialStatus: 'connected' as ProviderCredentialStatus, credentialLabel: result.keyLabel, credentialLimit: result.keyLimit, credentialUsage: result.keyUsage, credentialMaskedPreview: result.maskedPreview }
          : p
      )
      update({ provider: { providers: currentProviders } })
      setOauthError(null)
      setTimeout(() => { void handleDiscoverModels(OPENROUTER_PROVIDER_ID) }, 500)
      updateCardState(OPENROUTER_PROVIDER_ID, {
        notice: { tone: 'success', message: t('providerOAuthSuccess').replace('{{label}}', result.keyLabel) },
        showKeyInput: false, error: null
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setOauthError(msg)
      updateCardState(OPENROUTER_PROVIDER_ID, { error: msg, notice: { tone: 'error', message: t('providerOAuthError').replace('{{message}}', msg) } })
    } finally { setOauthBusy(false) }
  }

  // ── Key validation ──

  const handleValidateKey = async (providerId: string, key: string, baseUrl: string, endpointFormat?: string): Promise<void> => {
    updateCardState(providerId, { validating: true, error: null, notice: null })
    try {
      const result = await window.dsGui.providerValidateKey({ providerId, key, baseUrl, endpointFormat } as any)
      if (!result.ok) {
        updateCardState(providerId, { validating: false, error: result.message, notice: { tone: 'error', message: result.message } })
        const currentProviders = (form?.provider?.providers ?? []).map((p: ModelProviderProfileV1) =>
          p.id === providerId ? { ...p, credentialStatus: 'invalid' as ProviderCredentialStatus } : p
        )
        update({ provider: { providers: currentProviders } })
        return
      }
      const saveResult = await window.dsGui.providerSaveKey(providerId, key)
      if (saveResult.ok && !saveResult.persisted) {
        updateCardState(providerId, { notice: { tone: 'info', message: t('providerKeyEphemeralNotice') } })
      }
      const currentProviders = (form?.provider?.providers ?? []).map((p: ModelProviderProfileV1) =>
        p.id === providerId
          ? { ...p, credentialStatus: 'connected' as ProviderCredentialStatus, credentialLabel: result.keyLabel, credentialLimit: result.keyLimit, credentialUsage: result.keyUsage, credentialMaskedPreview: saveResult.ok ? saveResult.maskedPreview : (key.slice(0, 5) + '…' + key.slice(-4)) }
          : p
      )
      update({ provider: { providers: currentProviders } })
      setTimeout(() => { void handleDiscoverModels(providerId) }, 300)
      updateCardState(providerId, { validating: false, showKeyInput: false, keyInputValue: '', notice: { tone: 'success', message: t('providerKeyValidated') } })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(providerId, { validating: false, error: msg, notice: { tone: 'error', message: msg } })
    }
  }

  // ── Model discovery ──

  const handleDiscoverModels = async (providerId: string): Promise<void> => {
    updateCardState(providerId, { discovering: true, error: null, notice: null })
    try {
      await refreshModelProviderCatalog(providerId)
      updateCardState(providerId, { discovering: false, notice: { tone: 'success', message: t('providerModelsDiscovered') } })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(providerId, { discovering: false, error: msg, notice: { tone: 'error', message: msg } })
    }
  }

  // ── Test connection ──

  const handleTestConnection = async (p: ModelProviderProfileV1): Promise<void> => {
    updateCardState(p.id, { testing: true, testResult: null, error: null })
    try {
      const result = await window.dsGui.testProviderConnection({
        providerId: p.id,
        baseUrl: p.baseUrl,
        endpointFormat: p.endpointFormat
      })
      updateCardState(p.id, {
        testing: false,
        testResult: {
          ok: result.ok,
          latencyMs: result.latencyMs,
          message: result.message
        }
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(p.id, { testing: false, testResult: { ok: false, latencyMs: 0, message: msg } })
    }
  }

  // ── Disconnect ──

  const handleDisconnect = async (providerId: string): Promise<void> => {
    try {
      await window.dsGui.providerDeleteKey(providerId)
      const currentProviders = (form?.provider?.providers ?? []).map((p: ModelProviderProfileV1) =>
        p.id === providerId
          ? { ...p, credentialStatus: 'unvalidated' as ProviderCredentialStatus, credentialLabel: undefined, credentialMaskedPreview: undefined, credentialLimit: null, credentialUsage: 0, models: [], catalogModels: [] }
          : p
      )
      update({ provider: { providers: currentProviders } })
      updateCardState(providerId, { error: null, notice: { tone: 'info', message: t('providerDisconnected') }, showKeyInput: false, keyInputValue: '', testResult: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(providerId, { error: msg, notice: { tone: 'error', message: msg } })
    }
  }

  // ── Re-validate ──

  const handleRevalidate = async (providerId: string): Promise<void> => {
    if (typeof window.dsGui?.providerGetMaskedKey !== 'function') return
    try {
      const maskedResult = await window.dsGui.providerGetMaskedKey(providerId)
      if (!maskedResult.ok || !maskedResult.hasKey) {
        updateCardState(providerId, { notice: { tone: 'error', message: t('providerNoStoredKey') } })
        return
      }
      await handleDiscoverModels(providerId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(providerId, { error: msg, notice: { tone: 'error', message: msg } })
    }
  }

  // ── Add built-in provider ──

  const handleAddBuiltInProvider = useCallback(async (def: BuiltInProviderProfileDef) => {
    const newProfile: ModelProviderProfileV1 = {
      id: def.id,
      name: def.name,
      apiKey: '',
      baseUrl: def.baseUrl,
      endpointFormat: def.endpointFormat,
      models: [],
      catalogModels: [],
      credentialStatus: 'unvalidated' as ProviderCredentialStatus
    }
    const currentProviders = [...(form?.provider?.providers ?? []), newProfile]
    update({ provider: { providers: currentProviders } })
    setShowAddProviderPanel(false)
  }, [form, update])

  // ── Add local provider ──

  const handleAddLocalProvider = useCallback(async (providerId: string, providerName: string, baseUrl: string) => {
    const newProfile: ModelProviderProfileV1 = {
      id: providerId,
      name: providerName,
      apiKey: '',
      baseUrl,
      endpointFormat: 'chat_completions',
      models: [],
      catalogModels: [],
      credentialStatus: 'connected' as ProviderCredentialStatus
    }
    const currentProviders = [...(form?.provider?.providers ?? []), newProfile]
    update({ provider: { providers: currentProviders } })
  }, [form, update])

  // ── Local provider detection ──

  const handleDetectLocalProviders = async (): Promise<void> => {
    setLocalDetectBusy(true)
    setLocalDetectResults([])
    try {
      const results = await window.dsGui.detectLocalProviders()
      setLocalDetectResults(results)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setLocalDetectResults([{ ok: false, providerId: 'error', message: msg }])
    } finally {
      setLocalDetectBusy(false)
    }
  }

  // ── Custom provider handlers (kept from original) ──

  const openAddForm = useCallback(() => {
    setCustomFormMode({ mode: 'add' })
    setCustomForm({ id: '', name: '', baseUrl: '', endpointFormat: 'chat_completions', keyInputValue: '', validating: false, saving: false, validationError: null, validationNotice: null, discoveredModels: 0, validationOk: false })
  }, [])

  const openEditForm = useCallback((p: ModelProviderProfileV1) => {
    setCustomFormMode({ mode: 'edit', providerId: p.id, initial: p })
    setCustomForm({ id: p.id, name: p.name, baseUrl: p.baseUrl, endpointFormat: p.endpointFormat ?? 'chat_completions', keyInputValue: '', validating: false, saving: false, validationError: null, validationNotice: null, discoveredModels: p.catalogModels?.length ?? 0, validationOk: p.credentialStatus === 'connected' })
  }, [])

  const closeCustomForm = useCallback(() => { setCustomFormMode({ mode: 'closed' }) }, [])

  const handleCustomValidate = async (): Promise<void> => {
    if (!customForm.id || !customForm.keyInputValue.trim()) {
      setCustomForm((prev) => ({ ...prev, validationError: t('customProviderKeyValidationRequired') }))
      return
    }
    setCustomForm((prev) => ({ ...prev, validating: true, validationError: null, validationNotice: null }))
    try {
      const result = await window.dsGui.providerValidateKey({ providerId: customForm.id, key: customForm.keyInputValue.trim(), baseUrl: customForm.baseUrl, endpointFormat: customForm.endpointFormat } as any)
      if (!result.ok) {
        setCustomForm((prev) => ({ ...prev, validating: false, validationError: result.message, validationNotice: { tone: 'error', message: result.message } }))
        return
      }
      setCustomForm((prev) => ({ ...prev, validating: false, validationOk: true, validationNotice: { tone: 'success', message: t('customProviderValidationSuccess') } }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCustomForm((prev) => ({ ...prev, validating: false, validationError: msg, validationNotice: { tone: 'error', message: msg } }))
    }
  }

  const handleCustomSave = async (): Promise<void> => {
    setCustomForm((prev) => ({ ...prev, saving: true }))
    const isEdit = customFormMode.mode === 'edit'
    const hasNewKey = customForm.keyInputValue.trim().length > 0
    try {
      let valid = customForm.validationOk
      if (hasNewKey && !valid) {
        const valResult = await window.dsGui.providerValidateKey({ providerId: customForm.id, key: customForm.keyInputValue.trim(), baseUrl: customForm.baseUrl, endpointFormat: customForm.endpointFormat } as any)
        if (!valResult.ok) {
          setCustomForm((prev) => ({ ...prev, saving: false, validationError: valResult.message, validationNotice: { tone: 'error', message: valResult.message } }))
          return
        }
        valid = true
      }
      let maskedPreview: string | undefined
      let isPersisted = true
      if (hasNewKey) {
        const saveResult = await window.dsGui.providerSaveKey(customForm.id, customForm.keyInputValue.trim())
        if (!saveResult.ok) {
          setCustomForm((prev) => ({ ...prev, saving: false, validationError: saveResult.message }))
          return
        }
        maskedPreview = saveResult.maskedPreview
        isPersisted = saveResult.persisted
      } else if (isEdit) {
        try {
          const keyInfo = await window.dsGui.providerGetMaskedKey(customForm.id)
          if (keyInfo.ok && keyInfo.hasKey) maskedPreview = keyInfo.maskedPreview
        } catch { /* best-effort key info lookup */ }
      }
      const currentProviders = [...(form?.provider?.providers ?? [])]
      const existingIndex = currentProviders.findIndex((p: ModelProviderProfileV1) => p.id === customForm.id)
      const existingProfile = existingIndex >= 0 ? currentProviders[existingIndex] : undefined
      const newProfile: ModelProviderProfileV1 = {
        id: customForm.id, name: customForm.name, apiKey: '',
        baseUrl: customForm.baseUrl, endpointFormat: customForm.endpointFormat,
        models: existingProfile?.models ?? [], catalogModels: existingProfile?.catalogModels ?? [],
        credentialStatus: valid ? 'connected' as ProviderCredentialStatus : (existingProfile?.credentialStatus ?? 'unvalidated' as ProviderCredentialStatus),
        credentialMaskedPreview: (isPersisted || !hasNewKey) ? (maskedPreview ?? existingProfile?.credentialMaskedPreview) : undefined
      }
      if (existingIndex >= 0) currentProviders[existingIndex] = newProfile
      else currentProviders.push(newProfile)
      update({ provider: { providers: currentProviders } })
      setTimeout(() => { void refreshModelProviderCatalog(customForm.id).catch(() => {}) }, 300)
      setCustomForm((prev) => ({ ...prev, saving: false, validationOk: valid }))
      closeCustomForm()
      if (!isPersisted && hasNewKey) {
        updateCardState(customForm.id, { notice: { tone: 'info', message: t('providerKeyEphemeralNotice') } })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCustomForm((prev) => ({ ...prev, saving: false, validationError: msg }))
    }
  }

  const handleRemoveCustomProvider = async (providerId: string): Promise<void> => {
    try {
      await window.dsGui.providerDeleteKey(providerId)
      const currentProviders = (form?.provider?.providers ?? []).filter((p: ModelProviderProfileV1) => p.id !== providerId)
      update({ provider: { providers: currentProviders } })
      setCustomFormMode({ mode: 'closed' })
    } catch { /* best-effort removal */ }
  }

  // ── Provider Card ──

  const providerCard = (p: ModelProviderProfileV1): ReactElement => {
    const state = getCardState(p.id)
    const status = resolveCredentialStatus(p)
    const hasKey = !!p.credentialMaskedPreview
    const isOpenRouter = p.id === OPENROUTER_PROVIDER_ID
    const isDefaultProvider = p.id === DEFAULT_MODEL_PROVIDER_ID
    const isCustom = !isBuiltInProvider(p) && !isLocalProvider(p)
    const isLocal = isLocalProvider(p)
    const modelCount = p.catalogModels?.length ?? p.models?.length ?? 0
    const keyLabel = p.credentialLabel ?? ''

    return (
      <div key={p.id} className="rounded-2xl border border-ds-border bg-ds-card p-4 shadow-sm transition hover:border-ds-border/80" dir="auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isLocal ? <Monitor className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={1.75} /> : <Shield className="h-4 w-4 shrink-0 text-ds-muted" strokeWidth={1.75} />}
              <h3 className="text-[14px] font-semibold text-ds-ink truncate">{p.name}</h3>
              {statusBadge(status)}
              {isDefaultProvider ? <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">{t('providerDefault')}</span> : null}
              {isCustom ? <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">{t('customProviderBadge')}</span> : null}
              {isLocal ? <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">{t('providerLocalBadge')}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ds-muted">
              {keyLabel ? <span className="inline-flex items-center gap-1" title={keyLabel}><Key className="h-3 w-3" />{keyLabel}</span> : null}
              {hasKey ? <span className="inline-flex items-center gap-1 font-mono text-[11px]" title={t('providerMaskedKey')}>{p.credentialMaskedPreview || '••••••••'}</span> : null}
              {modelCount > 0 ? <span>{t('providerModelCount').replace('{{count}}', String(modelCount))}</span> : null}
              {p.credentialLimit != null ? <span>${p.credentialLimit}/mo</span> : null}
              {isCustom && p.baseUrl ? <span className="truncate max-w-[200px]" title={p.baseUrl}>{p.baseUrl}</span> : null}
              {isLocal && p.baseUrl ? <span className="truncate max-w-[200px] font-mono text-[11px]" title={p.baseUrl}>{p.baseUrl}</span> : null}
            </div>
            {state.notice ? <div className="mt-2"><InlineNoticeView notice={state.notice} /></div> : null}
          </div>
        </div>

        {/* Connection test result */}
        {state.testResult ? (
          <div className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium ${state.testResult.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:text-red-300'}`}>
            {state.testResult.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {state.testResult.ok ? t('providerTestResultOk').replace('{{latency}}', String(state.testResult.latencyMs)) : state.testResult.message.slice(0, 120)}
          </div>
        ) : null}

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {/* OAuth for OpenRouter */}
          {isOpenRouter ? (
            <ActionButton
              busy={oauthBusy}
              icon={Link}
              label={hasKey ? t('providerOAuthReconnect') : t('providerOAuthSignIn')}
              busyLabel={hasKey ? t('providerOAuthReconnecting') : t('providerOAuthSigningIn')}
              primary={!hasKey}
              onClick={() => void handleOAuth()}
            />
          ) : null}

          {/* Key paste for non-local providers */}
          {!isCustom && !isLocal && !state.showKeyInput && !hasKey ? (
            <ActionButton icon={Key} label={t('providerPasteKey')} onClick={() => updateCardState(p.id, { showKeyInput: true, keyInputValue: '', error: null, notice: null })} />
          ) : null}

          {/* Edit for custom */}
          {isCustom ? (
            <ActionButton icon={Pencil} label={tCommon('edit')} onClick={() => openEditForm(p)} />
          ) : null}

          {/* Test connection */}
          {hasKey || isLocal ? (
            <ActionButton
              busy={state.testing}
              icon={Wifi}
              label={t('providerTestConnection')}
              busyLabel={t('providerTestingConnection')}
              onClick={() => void handleTestConnection(p)}
            />
          ) : null}

          {/* Re-validate */}
          {hasKey ? (
            <ActionButton busy={state.discovering} icon={RefreshCw} label={t('providerRevalidate')} onClick={() => void handleRevalidate(p.id)} />
          ) : null}

          {/* Disconnect */}
          {hasKey ? (
            <button type="button" onClick={() => void handleDisconnect(p.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-300/60 bg-red-50/60 px-2.5 py-1 text-[12px] font-medium text-red-700 transition hover:bg-red-100/80 dark:border-red-700/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50">
              <Trash2 className="h-3.5 w-3.5" />{t('providerDisconnect')}
            </button>
          ) : null}

          {/* Remove custom without key */}
          {isCustom && !hasKey ? (
            <button type="button" onClick={() => void handleRemoveCustomProvider(p.id)} className="inline-flex items-center gap-1 rounded-lg border border-red-300/50 bg-red-50/50 px-2.5 py-1 text-[12px] font-medium text-red-700 transition hover:bg-red-100/70 dark:border-red-700/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50">
              <Trash2 className="h-3.5 w-3.5" />{t('customProviderRemove')}
            </button>
          ) : null}

          {/* Sign-up link for cloud providers */}
          {!isCustom && !isLocal && !hasKey ? (
            <a href={void 0} onClick={(e) => { e.preventDefault(); const def = BUILT_IN_PROVIDER_PROFILES.find(d => d.id === p.id); if (def?.signupUrl) window.dsGui.openExternal(def.signupUrl) }} className="ms-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium text-ds-muted transition hover:text-accent">
              <ExternalLink className="h-3 w-3" />{t('providerSignUp')}
            </a>
          ) : null}
        </div>

        {/* Key paste input */}
        {!isCustom && !isLocal && state.showKeyInput ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-stretch gap-2">
              <div className="min-w-0 flex-1">
                <SecretInput value={state.keyInputValue} onChange={(v) => updateCardState(p.id, { keyInputValue: v })} visible={false} onToggleVisibility={() => {}} placeholder={t('providerKeyPlaceholder')} autoComplete="off" showLabel={t('showSecret')} hideLabel={t('hideSecret')} />
              </div>
              <button type="button" onClick={() => { if (state.keyInputValue.trim()) handleValidateKey(p.id, state.keyInputValue.trim(), p.baseUrl, p.endpointFormat) }} disabled={state.validating || !state.keyInputValue.trim()} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-accent/90 disabled:opacity-60">
                {state.validating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('providerValidateKey')}
              </button>
              <button type="button" onClick={() => updateCardState(p.id, { showKeyInput: false, keyInputValue: '', error: null })} className="shrink-0 rounded-lg border border-ds-border bg-ds-card px-3 py-1.5 text-[12px] font-medium text-ds-muted transition hover:bg-ds-hover">{tCommon('cancel')}</button>
            </div>
            {state.error ? <p className="text-[11px] text-red-600 dark:text-red-400">{state.error}</p> : null}
            <p className="text-[11px] text-ds-faint">{t('providerKeySecurityNote')}</p>
          </div>
        ) : null}

        {/* Model chips */}
        {modelCount > 0 ? (
          <div className="mt-2 text-[11px] text-ds-muted">
            {p.catalogModels?.slice(0, 5).map((m: any) => (
              <span key={m.id} className="me-1 inline-block rounded-md bg-ds-subtle px-1.5 py-0.5 font-mono text-[10px]">{m.id}</span>
            ))}
            {modelCount > 5 ? <span className="text-ds-faint">{t('providerMoreModels').replace('{{count}}', String(modelCount - 5))}</span> : null}
          </div>
        ) : null}
      </div>
    )
  }

  // ── Add Provider Panel ──

  const addProviderPanel = (): ReactElement | null => {
    if (!showAddProviderPanel) return null
    return (
      <div className="rounded-2xl border-2 border-accent/30 bg-ds-card p-4 shadow-md" dir="auto">
        <h3 className="mb-3 text-[15px] font-semibold text-ds-ink">{t('providerAddBuiltIn')}</h3>
        <p className="mb-3 text-[12px] text-ds-muted">{t('providersDesc')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {unaddedBuiltInProfiles.map((def) => (
            <button
              key={def.id}
              type="button"
              onClick={() => void handleAddBuiltInProvider(def)}
              className="flex items-center gap-2 rounded-xl border border-ds-border bg-ds-card px-3 py-2.5 text-start text-[13px] transition hover:border-accent/40 hover:bg-ds-hover"
            >
              <Shield className="h-4 w-4 shrink-0 text-ds-muted" strokeWidth={1.75} />
              <div className="min-w-0">
                <div className="font-semibold text-ds-ink">{def.name}</div>
                <div className="text-[11px] text-ds-muted truncate">{def.description}</div>
              </div>
              <Plus className="ms-auto h-4 w-4 shrink-0 text-ds-faint" />
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => setShowAddProviderPanel(false)} className="rounded-lg border border-ds-border px-3 py-1.5 text-[12px] font-medium text-ds-muted transition hover:bg-ds-hover">{tCommon('cancel')}</button>
        </div>
      </div>
    )
  }

  // ── Custom provider form (abbreviated, same as original logic) ──

  const customProviderForm = (): ReactElement | null => {
    if (customFormMode.mode === 'closed') return null
    const isEdit = customFormMode.mode === 'edit'
    const formTitle = isEdit ? t('customProviderEditTitle') : t('customProviderAddTitle')
    return (
      <div className="rounded-2xl border-2 border-accent/30 bg-ds-card p-4 shadow-md" dir="auto">
        <h3 className="mb-3 text-[15px] font-semibold text-ds-ink">{formTitle}</h3>
        <div className="space-y-3">
          <SettingRow title={t('customProviderIdLabel')} description={t('customProviderIdDesc')}
            control={<input type="text" value={customForm.id} onChange={(e) => setCustomForm((prev) => ({ ...prev, id: e.target.value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') }))} disabled={isEdit} placeholder={t('customProviderIdPlaceholder')} className={`w-full rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] text-ds-ink focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 ${isEdit ? 'cursor-not-allowed opacity-60' : ''}`} autoComplete="off" maxLength={64} />}
          />
          <SettingRow title={t('customProviderNameLabel')}
            control={<input type="text" value={customForm.name} onChange={(e) => setCustomForm((prev) => ({ ...prev, name: e.target.value }))} placeholder={t('customProviderNamePlaceholder')} className="w-full rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] text-ds-ink focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30" autoComplete="off" maxLength={80} />}
          />
          <SettingRow title={t('customProviderBaseUrlLabel')} description={t('customProviderBaseUrlDesc')}
            control={<input type="url" value={customForm.baseUrl} onChange={(e) => setCustomForm((prev) => ({ ...prev, baseUrl: e.target.value }))} placeholder={t('customProviderBaseUrlPlaceholder')} className="w-full rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] text-ds-ink focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30" autoComplete="off" maxLength={256} />}
          />
          <SettingRow title={t('customProviderEndpointFormatLabel')}
            control={<select value={customForm.endpointFormat} onChange={(e) => setCustomForm((prev) => ({ ...prev, endpointFormat: e.target.value as 'chat_completions' | 'responses' | 'messages' }))} className="w-full rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] text-ds-ink focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30">
              <option value="chat_completions">{t('modelEndpointChatCompletions')}</option>
              <option value="responses">{t('modelEndpointResponses')}</option>
              <option value="messages">{t('modelEndpointMessages')}</option>
            </select>}
          />
          <SettingRow title={t('customProviderKeyLabel')}
            control={<SecretInput value={customForm.keyInputValue} onChange={(v) => setCustomForm((prev) => ({ ...prev, keyInputValue: v }))} visible={false} onToggleVisibility={() => {}} placeholder={t('customProviderKeyPlaceholder')} autoComplete="off" showLabel={t('showSecret')} hideLabel={t('hideSecret')} invalid={!!customForm.validationError && !customForm.validationOk} />}
          />

          <div className="flex flex-wrap items-center gap-2 px-3">
            <button type="button" onClick={() => void handleCustomValidate()} disabled={customForm.validating || !customForm.id || !customForm.keyInputValue.trim()} className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50">
              {customForm.validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {customForm.validating ? t('customProviderValidating') : t('customProviderValidate')}
            </button>
            {customForm.validationOk ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />{t('providerStatusConnected')}</span> : null}
            {customForm.discoveredModels > 0 ? <span className="text-[12px] text-ds-muted">{t('customProviderModelCount').replace('{{count}}', String(customForm.discoveredModels))}</span> : null}
          </div>
          {customForm.validationError ? <div className="px-3"><p className="text-[11px] text-red-600 dark:text-red-400">{customForm.validationError}</p></div> : null}
          {customForm.validationNotice ? <div className="px-3"><InlineNoticeView notice={customForm.validationNotice} /></div> : null}
          <div className="px-3"><p className="text-[11px] text-ds-faint">{t('providerKeySecurityNote')}</p></div>
          <div className="flex flex-wrap items-center gap-2 border-t border-ds-border-muted px-3 pt-3">
            <button type="button" onClick={() => void handleCustomSave()} disabled={customForm.saving || !customForm.name} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-accent/90 disabled:opacity-60">
              {customForm.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t('customProviderSave')}
            </button>
            <button type="button" onClick={closeCustomForm} disabled={customForm.saving} className="inline-flex items-center gap-1 rounded-lg border border-ds-border bg-ds-card px-3 py-1.5 text-[12px] font-medium text-ds-muted transition hover:bg-ds-hover disabled:opacity-60">{t('customProviderCancel')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <SettingsCard title={t('sectionProviders')}>
      <p className="mb-4 text-[13px] text-ds-muted">{t('providersDesc')}</p>

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('providerSearchPlaceholder')}
            className="w-full rounded-xl border border-ds-border bg-ds-card py-2 pe-3 ps-9 text-[13px] text-ds-ink placeholder:text-ds-faint transition focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        {filteredProviders.length > 0 ? filteredProviders.map(providerCard) : (
          <div className="py-6 text-center text-[13px] text-ds-muted">
            {searchQuery.trim() ? t('providerSearchNoResults') : t('loading')}
          </div>
        )}
      </div>

      {/* Add provider buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowAddProviderPanel(!showAddProviderPanel)} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-ds-border px-3 py-1.5 text-[12px] font-medium text-ds-muted transition hover:border-accent/50 hover:text-accent">
          <Plus className="h-3.5 w-3.5" />
          {t('providerAddBuiltIn')}
        </button>
        {customFormMode.mode === 'closed' ? (
          <button type="button" onClick={openAddForm} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-ds-border px-3 py-1.5 text-[12px] font-medium text-ds-muted transition hover:border-accent/50 hover:text-accent">
            <Plus className="h-3.5 w-3.5" />
            {t('providerAddCustom')}
          </button>
        ) : null}
      </div>

      {/* Add provider panel */}
      {addProviderPanel()}

      {/* Custom provider form */}
      {customProviderForm()}

      {/* Local provider detection */}
      <div className="mt-6 rounded-2xl border border-ds-border bg-ds-card/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-ds-ink">{t('providerAutoDetect')}</h3>
            <p className="mt-0.5 text-[12px] text-ds-muted">{t('firstRunConnectLocalHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleDetectLocalProviders()}
            disabled={localDetectBusy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {localDetectBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {localDetectBusy ? t('providerAutoDetecting') : t('providerAutoDetect')}
          </button>
        </div>

        {localDetectResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {localDetectResults.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] ${r.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'bg-red-500/5 text-red-700 dark:text-red-300'}`}>
                {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                <span className="flex-1">{r.ok ? t('providerAutoDetectSuccess').replace('{{name}}', r.providerName || r.providerId).replace('{{count}}', String(r.models?.length ?? 0)).replace('{{latency}}', String(r.latencyMs ?? 0)) : t('providerAutoDetectFail').replace('{{name}}', r.providerId).replace('{{message}}', r.message || '')}</span>
                {r.ok && !providerIdsAlreadyInSettings.has(r.providerId) ? (
                  <button type="button" onClick={() => void handleAddLocalProvider(r.providerId, r.providerName || r.providerId, r.providerId === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1')} className="shrink-0 rounded-md bg-emerald-600/20 px-2 py-0.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-600/30 dark:text-emerald-300">
                    <Plus className="me-0.5 inline h-3 w-3" />{t('providerAddBuiltIn')}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-ds-faint">
        <Shield className="me-1 inline h-3 w-3 align-[-1px]" />
        {t('providerSecurityFooter')}
      </p>
    </SettingsCard>
  )
}

// ── Helper: ActionButton ──

function ActionButton({
  busy, icon: Icon, label, busyLabel = label, primary = false, onClick
}: {
  busy?: boolean
  icon: React.ElementType
  label: string
  busyLabel?: string
  primary?: boolean
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition disabled:opacity-60 ${
        primary
          ? 'bg-accent text-white hover:bg-accent/90'
          : 'border border-ds-border bg-ds-card text-ds-ink hover:bg-ds-hover'
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {busy ? busyLabel : label}
    </button>
  )
}
