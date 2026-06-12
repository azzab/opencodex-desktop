import type { ReactElement } from 'react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Key, Link, Loader2, RefreshCw, Trash2, CheckCircle2, XCircle, AlertTriangle, Shield, Plus, Pencil } from 'lucide-react'
import type {
  AppSettingsV1,
  ModelProviderProfileV1,
  ModelProviderCatalogModelV1,
  ProviderCredentialStatus
} from '@shared/app-settings'
import { OPENROUTER_PROVIDER_ID, DEFAULT_MODEL_PROVIDER_ID } from '@shared/app-settings'
import {
  InlineNoticeView,
  SecretInput,
  SettingsCard,
  SettingRow,
  Toggle
} from './settings-controls'

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
  error: string | null
  notice: { tone: 'success' | 'error' | 'info'; message: string } | null
  showKeyInput: boolean
  keyInputValue: string
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
    selectControlClass,
    modelCatalogBusy,
    refreshModelProviderCatalog
  } = ctx as ProviderSettingsContext

  const providers = form?.provider?.providers ?? []
  const [cardStates, setCardStates] = useState<Record<string, ProviderCardState>>({})
  const [oauthBusy, setOauthBusy] = useState(false)

  const [customFormMode, setCustomFormMode] = useState<CustomProviderFormMode>({ mode: 'closed' })
  const [customForm, setCustomForm] = useState<CustomProviderFormState>({
    id: '',
    name: '',
    baseUrl: '',
    endpointFormat: 'chat_completions',
    keyInputValue: '',
    validating: false,
    saving: false,
    validationError: null,
    validationNotice: null,
    discoveredModels: 0,
    validationOk: false
  })

  const getCardState = useCallback((providerId: string): ProviderCardState => {
    return cardStates[providerId] ?? {
      validating: false,
      saving: false,
      discovering: false,
      error: null,
      notice: null,
      showKeyInput: false,
      keyInputValue: ''
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

  const statusBadge = (status: ProviderCredentialStatus): ReactElement => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            {t('providerStatusConnected')}
          </span>
        )
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-0.5 text-[12px] font-medium text-red-700 dark:text-red-300">
            <XCircle className="h-3 w-3" />
            {t('providerStatusInvalid')}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-ds-subtle px-2.5 py-0.5 text-[12px] font-medium text-ds-muted">
            <AlertTriangle className="h-3 w-3" />
            {t('providerStatusUnvalidated')}
          </span>
        )
    }
  }

  const handleOAuth = async (): Promise<void> => {
    setOauthBusy(true)
    try {
      const result = await window.dsGui.providerOAuthStart()
      if (!result.ok) {
        updateCardState(OPENROUTER_PROVIDER_ID, {
          error: result.message,
          notice: { tone: 'error', message: result.message }
        })
        return
      }

      const currentProviders = (form?.provider?.providers ?? []).map((p: ModelProviderProfileV1) =>
        p.id === OPENROUTER_PROVIDER_ID
          ? {
              ...p,
              credentialStatus: 'connected' as ProviderCredentialStatus,
              credentialLabel: result.keyLabel,
              credentialLimit: result.keyLimit,
              credentialUsage: result.keyUsage,
              credentialMaskedPreview: result.maskedPreview
            }
          : p
      )

      update({
        provider: {
          providers: currentProviders
        }
      })

      setTimeout(() => {
        void handleDiscoverModels(OPENROUTER_PROVIDER_ID)
      }, 500)

      updateCardState(OPENROUTER_PROVIDER_ID, {
        notice: { tone: 'success', message: t('providerOAuthSuccess').replace('{{label}}', result.keyLabel) },
        showKeyInput: false
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(OPENROUTER_PROVIDER_ID, {
        error: msg,
        notice: { tone: 'error', message: msg }
      })
    } finally {
      setOauthBusy(false)
    }
  }

  const handleValidateKey = async (providerId: string, key: string, baseUrl: string, endpointFormat?: string): Promise<void> => {
    updateCardState(providerId, { validating: true, error: null, notice: null })
    try {
      const result = await window.dsGui.providerValidateKey({
        providerId,
        key,
        baseUrl,
        endpointFormat
      } as any)

      if (!result.ok) {
        updateCardState(providerId, {
          validating: false,
          error: result.message,
          notice: { tone: 'error', message: result.message }
        })

        const currentProviders = (form?.provider?.providers ?? []).map((p: ModelProviderProfileV1) =>
          p.id === providerId ? { ...p, credentialStatus: 'invalid' as ProviderCredentialStatus } : p
        )
        update({ provider: { providers: currentProviders } })
        return
      }

      // Save encrypted key
      const saveResult = await window.dsGui.providerSaveKey(providerId, key)

      // If key was saved but not persisted (safeStorage unavailable), warn about ephemeral storage
      if (saveResult.ok && !saveResult.persisted) {
        updateCardState(providerId, {
          notice: { tone: 'info', message: t('providerKeyEphemeralNotice') }
        })
      }

      // Update provider profile with metadata only — never the raw key
      const currentProviders = (form?.provider?.providers ?? []).map((p: ModelProviderProfileV1) =>
        p.id === providerId
          ? {
              ...p,
              credentialStatus: 'connected' as ProviderCredentialStatus,
              credentialLabel: result.keyLabel,
              credentialLimit: result.keyLimit,
              credentialUsage: result.keyUsage,
              credentialMaskedPreview: saveResult.ok ? saveResult.maskedPreview : (key.slice(0, 5) + '…' + key.slice(-4))
            }
          : p
      )

      update({
        provider: {
          providers: currentProviders
        }
      })

      setTimeout(() => {
        void handleDiscoverModels(providerId)
      }, 300)

      updateCardState(providerId, {
        validating: false,
        showKeyInput: false,
        keyInputValue: '',
        notice: { tone: 'success', message: t('providerKeyValidated') }
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(providerId, {
        validating: false,
        error: msg,
        notice: { tone: 'error', message: msg }
      })
    }
  }

  const handleDiscoverModels = async (providerId: string): Promise<void> => {
    updateCardState(providerId, { discovering: true, error: null, notice: null })
    try {
      await refreshModelProviderCatalog(providerId)
      updateCardState(providerId, {
        discovering: false,
        notice: { tone: 'success', message: t('providerModelsDiscovered') }
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(providerId, {
        discovering: false,
        error: msg,
        notice: { tone: 'error', message: msg }
      })
    }
  }

  const handleDisconnect = async (providerId: string): Promise<void> => {
    try {
      await window.dsGui.providerDeleteKey(providerId)
      const currentProviders = (form?.provider?.providers ?? []).map((p: ModelProviderProfileV1) =>
        p.id === providerId
          ? {
              ...p,
              credentialStatus: 'unvalidated' as ProviderCredentialStatus,
              credentialLabel: undefined,
              credentialMaskedPreview: undefined,
              credentialLimit: null,
              credentialUsage: 0,
              models: [],
              catalogModels: []
            }
          : p
      )
      update({ provider: { providers: currentProviders } })
      updateCardState(providerId, {
        error: null,
        notice: { tone: 'info', message: t('providerDisconnected') },
        showKeyInput: false,
        keyInputValue: ''
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(providerId, { error: msg, notice: { tone: 'error', message: msg } })
    }
  }

  const handleRevalidate = async (providerId: string): Promise<void> => {
    if (typeof window.dsGui?.providerGetMaskedKey !== 'function') return
    try {
      const maskedResult = await window.dsGui.providerGetMaskedKey(providerId)
      if (!maskedResult.ok || !maskedResult.hasKey) {
        updateCardState(providerId, {
          notice: { tone: 'error', message: t('providerNoStoredKey') }
        })
        return
      }
      await handleDiscoverModels(providerId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      updateCardState(providerId, { error: msg, notice: { tone: 'error', message: msg } })
    }
  }

  // Custom Provider Form Handlers

  const openAddForm = useCallback(() => {
    setCustomFormMode({ mode: 'add' })
    setCustomForm({
      id: '',
      name: '',
      baseUrl: '',
      endpointFormat: 'chat_completions',
      keyInputValue: '',
      validating: false,
      saving: false,
      validationError: null,
      validationNotice: null,
      discoveredModels: 0,
      validationOk: false
    })
  }, [])

  const openEditForm = useCallback((p: ModelProviderProfileV1) => {
    setCustomFormMode({ mode: 'edit', providerId: p.id, initial: p })
    setCustomForm({
      id: p.id,
      name: p.name,
      baseUrl: p.baseUrl,
      endpointFormat: p.endpointFormat ?? 'chat_completions',
      keyInputValue: '',
      validating: false,
      saving: false,
      validationError: null,
      validationNotice: null,
      discoveredModels: p.catalogModels?.length ?? 0,
      validationOk: p.credentialStatus === 'connected'
    })
  }, [])

  const closeCustomForm = useCallback(() => {
    setCustomFormMode({ mode: 'closed' })
  }, [])

  /**
   * Validate-key only (no model discovery). Key is not persisted until save.
   * Model discovery happens after save+persist in handleCustomSave.
   */
  const handleCustomValidate = async (): Promise<void> => {
    if (!customForm.id || !customForm.keyInputValue.trim()) {
      setCustomForm((prev) => ({
        ...prev,
        validationError: t('customProviderKeyValidationRequired')
      }))
      return
    }

    setCustomForm((prev) => ({
      ...prev,
      validating: true,
      validationError: null,
      validationNotice: null
    }))

    try {
      const result = await window.dsGui.providerValidateKey({
        providerId: customForm.id,
        key: customForm.keyInputValue.trim(),
        baseUrl: customForm.baseUrl,
        endpointFormat: customForm.endpointFormat
      } as any)

      if (!result.ok) {
        setCustomForm((prev) => ({
          ...prev,
          validating: false,
          validationError: result.message,
          validationNotice: { tone: 'error', message: result.message }
        }))
        return
      }

      // Validation succeeded. Model discovery happens at save time (after
      // the provider profile and key are persisted).
      setCustomForm((prev) => ({
        ...prev,
        validating: false,
        validationOk: true,
        validationNotice: {
          tone: 'success',
          message: t('customProviderValidationSuccess')
        }
      }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCustomForm((prev) => ({
        ...prev,
        validating: false,
        validationError: msg,
        validationNotice: { tone: 'error', message: msg }
      }))
    }
  }

  /**
   * Save flow for custom providers (M2 contract):
   * 1. If a new key is entered, validate it first (when not already validated).
   * 2. Save the key via credential store.
   * 3. Persist provider profile metadata only (never the raw key).
   * 4. Refresh the model catalog immediately after persistence so the
   *    provider card shows discovered models and counts.
   * 5. In edit mode without a new key, preserve the existing key and
   *    still refresh the catalog to pick up any base-url / format changes.
   */
  const handleCustomSave = async (): Promise<void> => {
    setCustomForm((prev) => ({ ...prev, saving: true }))
    const isEdit = customFormMode.mode === 'edit'
    const hasNewKey = customForm.keyInputValue.trim().length > 0

    try {
      let valid = customForm.validationOk

      // 1. Validate new key if provided and not already validated
      if (hasNewKey && !valid) {
        const valResult = await window.dsGui.providerValidateKey({
          providerId: customForm.id,
          key: customForm.keyInputValue.trim(),
          baseUrl: customForm.baseUrl,
          endpointFormat: customForm.endpointFormat
        } as any)

        if (!valResult.ok) {
          setCustomForm((prev) => ({
            ...prev,
            saving: false,
            validationError: valResult.message,
            validationNotice: { tone: 'error', message: valResult.message }
          }))
          return
        }
        valid = true
      }

      // 2. Save key via credential store (new key only)
      let maskedPreview: string | undefined
      let isPersisted = true

      if (hasNewKey) {
        const saveResult = await window.dsGui.providerSaveKey(customForm.id, customForm.keyInputValue.trim())
        if (!saveResult.ok) {
          setCustomForm((prev) => ({
            ...prev,
            saving: false,
            validationError: saveResult.message
          }))
          return
        }
        maskedPreview = saveResult.maskedPreview
        isPersisted = saveResult.persisted
      } else if (isEdit) {
        // Edit without new key: look up existing masked preview
        try {
          const keyInfo = await window.dsGui.providerGetMaskedKey(customForm.id)
          if (keyInfo.ok && keyInfo.hasKey) {
            maskedPreview = keyInfo.maskedPreview
          }
        } catch {
          // Best-effort; the UI will show whatever is already in the profile
        }
      }

      // 3. Persist provider profile metadata (never the raw key)
      const currentProviders = [...(form?.provider?.providers ?? [])]
      const existingIndex = currentProviders.findIndex((p: ModelProviderProfileV1) => p.id === customForm.id)
      const existingProfile = existingIndex >= 0 ? currentProviders[existingIndex] : undefined

      const newProfile: ModelProviderProfileV1 = {
        id: customForm.id,
        name: customForm.name,
        apiKey: '', // Never store raw key in settings
        baseUrl: customForm.baseUrl,
        endpointFormat: customForm.endpointFormat,
        models: existingProfile?.models ?? [],
        catalogModels: existingProfile?.catalogModels ?? [],
        credentialStatus: valid ? 'connected' as ProviderCredentialStatus : (existingProfile?.credentialStatus ?? 'unvalidated' as ProviderCredentialStatus),
        credentialMaskedPreview: (isPersisted || !hasNewKey) ? (maskedPreview ?? existingProfile?.credentialMaskedPreview) : undefined
      }

      if (existingIndex >= 0) {
        currentProviders[existingIndex] = newProfile
      } else {
        currentProviders.push(newProfile)
      }

      update({ provider: { providers: currentProviders } })

      // 4. Schedule catalog refresh after persistence
      // Uses the same pattern as handleValidateKey: setTimeout allows
      // React to commit the settings update before flushPendingSave
      // persists it to disk inside refreshModelProviderCatalog.
      setTimeout(() => {
        void refreshModelProviderCatalog(customForm.id).catch(() => {
          // Catalog refresh is best-effort
        })
      }, 300)

      setCustomForm((prev) => ({
        ...prev,
        saving: false,
        validationOk: valid
      }))

      // 5. Close form
      closeCustomForm()

      // If not persisted, warn the user
      if (!isPersisted && hasNewKey) {
        updateCardState(customForm.id, {
          notice: {
            tone: 'info',
            message: t('providerKeyEphemeralNotice')
          }
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setCustomForm((prev) => ({
        ...prev,
        saving: false,
        validationError: msg
      }))
    }
  }

  const handleRemoveCustomProvider = async (providerId: string): Promise<void> => {
    try {
      await window.dsGui.providerDeleteKey(providerId)
      const currentProviders = (form?.provider?.providers ?? []).filter(
        (p: ModelProviderProfileV1) => p.id !== providerId
      )
      update({ provider: { providers: currentProviders } })
      setCustomFormMode({ mode: 'closed' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Best-effort; UI reflects the removal attempt
    }
  }

  // Individual Provider Card

  const providerCard = (p: ModelProviderProfileV1): ReactElement => {
    const state = getCardState(p.id)
    const status = resolveCredentialStatus(p)
    const hasKey = !!p.credentialMaskedPreview
    const isOpenRouter = p.id === OPENROUTER_PROVIDER_ID
    const isDefaultProvider = p.id === DEFAULT_MODEL_PROVIDER_ID
    const isCustom = !isBuiltInProvider(p)
    const modelCount = p.catalogModels?.length ?? p.models?.length ?? 0
    const keyLabel = p.credentialLabel ?? ''

    return (
      <div
        key={p.id}
        className="rounded-2xl border border-ds-border bg-ds-card p-5 shadow-sm transition"
        dir="auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5 shrink-0 text-ds-muted" strokeWidth={1.75} />
              <h3 className="text-[15px] font-semibold text-ds-ink truncate">{p.name}</h3>
              {statusBadge(status)}
              {isDefaultProvider ? (
                <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                  {t('providerDefault')}
                </span>
              ) : null}
              {isCustom ? (
                <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                  {t('customProviderBadge')}
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ds-muted">
              {keyLabel ? (
                <span className="inline-flex items-center gap-1" title={keyLabel}>
                  <Key className="h-3 w-3" />
                  {keyLabel}
                </span>
              ) : null}
              {hasKey ? (
                <span className="inline-flex items-center gap-1 font-mono text-[12px]" title={t('providerMaskedKey')}>
                  {p.credentialMaskedPreview || '••••••••'}
                </span>
              ) : null}
              {modelCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  {t('providerModelCount').replace('{{count}}', String(modelCount))}
                </span>
              ) : null}
              {p.credentialLimit != null ? (
                <span className="inline-flex items-center gap-1">
                  ${p.credentialLimit}/mo
                </span>
              ) : null}
              {isCustom && p.baseUrl ? (
                <span className="inline-flex items-center gap-1 text-[12px] truncate max-w-[240px]" title={p.baseUrl}>
                  {p.baseUrl}
                </span>
              ) : null}
            </div>

            {state.notice ? (
              <div className="mt-2">
                <InlineNoticeView notice={state.notice} />
              </div>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* OAuth button for OpenRouter */}
          {isOpenRouter && !hasKey ? (
            <button
              type="button"
              onClick={() => void handleOAuth()}
              disabled={oauthBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-60"
            >
              {oauthBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link className="h-4 w-4" />
              )}
              {oauthBusy ? t('providerOAuthSigningIn') : t('providerOAuthSignIn')}
            </button>
          ) : null}

          {/* Key input toggle for built-in providers */}
          {!isCustom && !state.showKeyInput && !hasKey ? (
            <button
              type="button"
              onClick={() => updateCardState(p.id, { showKeyInput: true, keyInputValue: '', error: null, notice: null })}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] font-medium text-ds-ink shadow-sm transition hover:bg-ds-hover"
            >
              <Key className="h-4 w-4" />
              {t('providerPasteKey')}
            </button>
          ) : null}

          {/* Edit button for custom providers */}
          {isCustom ? (
            <button
              type="button"
              onClick={() => openEditForm(p)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] font-medium text-ds-ink shadow-sm transition hover:bg-ds-hover"
            >
              <Pencil className="h-4 w-4" />
              {tCommon('edit')}
            </button>
          ) : null}

          {/* Re-validate */}
          {hasKey ? (
            <>
              <button
                type="button"
                onClick={() => void handleRevalidate(p.id)}
                disabled={state.discovering || modelCatalogBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ds-border bg-ds-card px-3 py-1.5 text-[13px] font-medium text-ds-ink shadow-sm transition hover:bg-ds-hover disabled:opacity-60"
              >
                {state.discovering ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t('providerRevalidate')}
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect(p.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-300/60 bg-red-50/60 px-3 py-1.5 text-[13px] font-medium text-red-700 shadow-sm transition hover:bg-red-100/80 dark:border-red-700/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
              >
                <Trash2 className="h-4 w-4" />
                {t('providerDisconnect')}
              </button>
            </>
          ) : null}

          {/* Remove button for custom providers without keys */}
          {isCustom && !hasKey ? (
            <button
              type="button"
              onClick={() => void handleRemoveCustomProvider(p.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-300/60 bg-red-50/60 px-3 py-1.5 text-[13px] font-medium text-red-700 shadow-sm transition hover:bg-red-100/80 dark:border-red-700/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
            >
              <Trash2 className="h-4 w-4" />
              {t('customProviderRemove')}
            </button>
          ) : null}
        </div>

        {/* Key paste input for built-in providers */}
        {!isCustom && state.showKeyInput ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-stretch gap-2">
              <div className="min-w-0 flex-1">
                <SecretInput
                  value={state.keyInputValue}
                  onChange={(value) => updateCardState(p.id, { keyInputValue: value })}
                  visible={false}
                  onToggleVisibility={() => {}}
                  placeholder={t('providerKeyPlaceholder')}
                  autoComplete="off"
                  showLabel={t('showSecret')}
                  hideLabel={t('hideSecret')}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (state.keyInputValue.trim()) {
                    void handleValidateKey(p.id, state.keyInputValue.trim(), p.baseUrl, p.endpointFormat)
                  }
                }}
                disabled={state.validating || !state.keyInputValue.trim()}
                className="shrink-0 rounded-xl bg-accent px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-60"
              >
                {state.validating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('providerValidateKey')
                )}
              </button>
              <button
                type="button"
                onClick={() => updateCardState(p.id, { showKeyInput: false, keyInputValue: '', error: null })}
                className="shrink-0 rounded-xl border border-ds-border bg-ds-card px-3 py-2 text-[13px] font-medium text-ds-muted shadow-sm transition hover:bg-ds-hover"
              >
                {tCommon('cancel')}
              </button>
            </div>
            {state.error ? (
              <p className="text-[12px] text-red-600 dark:text-red-400">{state.error}</p>
            ) : null}
            <p className="text-[12px] text-ds-faint">{t('providerKeySecurityNote')}</p>
          </div>
        ) : null}

        {/* Discovered model count & details */}
        {modelCount > 0 ? (
          <div className="mt-2 text-[12px] text-ds-muted">
            {p.catalogModels?.slice(0, 5).map((m: any) => (
              <span key={m.id} className="me-2 inline-block rounded-lg bg-ds-subtle px-2 py-0.5 font-mono text-[11px]">
                {m.id}
              </span>
            ))}
            {modelCount > 5 ? (
              <span className="text-ds-faint">{t('providerMoreModels').replace('{{count}}', String(modelCount - 5))}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  // Custom Provider Add/Edit Form

  const customProviderForm = (): ReactElement | null => {
    if (customFormMode.mode === 'closed') return null
    const isEdit = customFormMode.mode === 'edit'
    const formTitle = isEdit
      ? t('customProviderEditTitle')
      : t('customProviderAddTitle')

    return (
      <div className="rounded-2xl border-2 border-accent/30 bg-ds-card p-5 shadow-md" dir="auto">
        <h3 className="mb-4 text-[16px] font-semibold text-ds-ink">{formTitle}</h3>

        <div className="space-y-4">
          {/* Provider ID */}
          <SettingRow
            title={t('customProviderIdLabel')}
            description={t('customProviderIdDesc')}
            control={
              <input
                type="text"
                value={customForm.id}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, id: e.target.value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') }))}
                disabled={isEdit}
                placeholder={t('customProviderIdPlaceholder')}
                className={`w-full rounded-xl border border-ds-border bg-ds-card px-3 py-2 text-[14px] text-ds-ink shadow-sm transition focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30 ${isEdit ? 'cursor-not-allowed opacity-60' : ''}`}
                autoComplete="off"
                maxLength={64}
              />
            }
          />

          {/* Display Name */}
          <SettingRow
            title={t('customProviderNameLabel')}
            control={
              <input
                type="text"
                value={customForm.name}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('customProviderNamePlaceholder')}
                className="w-full rounded-xl border border-ds-border bg-ds-card px-3 py-2 text-[14px] text-ds-ink shadow-sm transition focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                autoComplete="off"
                maxLength={80}
              />
            }
          />

          {/* Base URL */}
          <SettingRow
            title={t('customProviderBaseUrlLabel')}
            description={t('customProviderBaseUrlDesc')}
            control={
              <input
                type="url"
                value={customForm.baseUrl}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder={t('customProviderBaseUrlPlaceholder')}
                className="w-full rounded-xl border border-ds-border bg-ds-card px-3 py-2 text-[14px] text-ds-ink shadow-sm transition focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
                autoComplete="off"
                maxLength={256}
              />
            }
          />

          {/* Endpoint Format */}
          <SettingRow
            title={t('customProviderEndpointFormatLabel')}
            control={
              <select
                value={customForm.endpointFormat}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, endpointFormat: e.target.value as 'chat_completions' | 'responses' | 'messages' }))}
                className="w-full rounded-xl border border-ds-border bg-ds-card px-3 py-2 text-[14px] text-ds-ink shadow-sm transition focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/30"
              >
                <option value="chat_completions">{t('modelEndpointChatCompletions')}</option>
                <option value="responses">{t('modelEndpointResponses')}</option>
                <option value="messages">{t('modelEndpointMessages')}</option>
              </select>
            }
          />

          {/* API Key */}
          <SettingRow
            title={t('customProviderKeyLabel')}
            control={
              <SecretInput
                value={customForm.keyInputValue}
                onChange={(value) => setCustomForm((prev) => ({ ...prev, keyInputValue: value }))}
                visible={false}
                onToggleVisibility={() => {}}
                placeholder={t('customProviderKeyPlaceholder')}
                autoComplete="off"
                showLabel={t('showSecret')}
                hideLabel={t('hideSecret')}
                invalid={!!customForm.validationError && !customForm.validationOk}
              />
            }
          />

          {/* Validation & Discover */}
          <div className="flex flex-wrap items-center gap-2 px-3">
            <button
              type="button"
              onClick={() => void handleCustomValidate()}
              disabled={customForm.validating || !customForm.id || !customForm.keyInputValue.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent/10 px-4 py-2 text-[13px] font-medium text-accent shadow-sm transition hover:bg-accent/20 disabled:opacity-50"
            >
              {customForm.validating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {customForm.validating ? t('customProviderValidating') : t('customProviderValidate')}
            </button>

            {customForm.validationOk ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                {t('providerStatusConnected')}
              </span>
            ) : null}

            {customForm.discoveredModels > 0 ? (
              <span className="text-[13px] text-ds-muted">
                {t('customProviderModelCount').replace('{{count}}', String(customForm.discoveredModels))}
              </span>
            ) : null}
          </div>

          {/* Validation error */}
          {customForm.validationError ? (
            <div className="px-3">
              <p className="text-[12px] text-red-600 dark:text-red-400">{customForm.validationError}</p>
            </div>
          ) : null}

          {/* Validation notice */}
          {customForm.validationNotice ? (
            <div className="px-3">
              <InlineNoticeView notice={customForm.validationNotice} />
            </div>
          ) : null}

          {/* Key security note */}
          <div className="px-3">
            <p className="text-[12px] text-ds-faint">{t('providerKeySecurityNote')}</p>
          </div>

          {/* Save / Cancel */}
          <div className="flex flex-wrap items-center gap-2 border-t border-ds-border-muted px-3 pt-4">
            <button
              type="button"
              onClick={() => void handleCustomSave()}
              disabled={customForm.saving || !customForm.name}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-60"
            >
              {customForm.saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t('customProviderSave')}
            </button>
            <button
              type="button"
              onClick={closeCustomForm}
              disabled={customForm.saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ds-border bg-ds-card px-4 py-2 text-[13px] font-medium text-ds-muted shadow-sm transition hover:bg-ds-hover disabled:opacity-60"
            >
              {t('customProviderCancel')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <SettingsCard title={t('sectionProviders')}>
      <p className="mb-4 text-[13px] text-ds-muted">{t('providersDesc')}</p>

      <div className="space-y-4">
        {providers.map(providerCard)}
      </div>

      {/* Custom provider form */}
      {customProviderForm()}

      {/* Add custom provider button */}
      {customFormMode.mode === 'closed' ? (
        <div className="mt-4">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-ds-border px-4 py-2 text-[13px] font-medium text-ds-muted transition hover:border-accent/50 hover:text-accent"
            onClick={openAddForm}
          >
            <Plus className="h-4 w-4" />
            {t('providerAddCustom')}
          </button>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] text-ds-faint">
        <Shield className="me-1 inline h-3 w-3 align-[-1px]" />
        {t('providerSecurityFooter')}
      </p>
    </SettingsCard>
  )
}
