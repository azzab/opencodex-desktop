import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_MODEL_ENDPOINT_FORMAT,
  DEFAULT_MODEL_PROVIDER_ID,
  DEFAULT_OPENROUTER_BASE_URL,
  OPENROUTER_PROVIDER_ID,
  STORED_ENCRYPTED_MARKER,
  type AppSettingsV1,
  type FavoritedModel,
  type KunRuntimeSettingsV1,
  type ModelPickerSettings,
  type ModelProviderCatalogModelV1,
  type ModelProviderProfilePatchV1,
  type ModelProviderProfileV1,
  type ModelProviderSettingsPatchV1,
  type ModelProviderSettingsV1,
  type ModelTaskRole,
  type PerTaskModelAssignment,
  type PerTaskModelSettings,
  type ProviderCredentialStatus
} from './app-settings-types'

export type ResolvedSendModel = {
  providerId?: string
  modelId?: string
}
import { normalizeModelEndpointFormat } from './app-settings-types'
import { getKunRuntimeSettings } from './app-settings-kun'
import { normalizeDeepseekBaseUrl } from './app-settings-normalizers'
import { DEFAULT_COMPOSER_MODEL_IDS } from './default-composer-models'

const DEFAULT_MODEL_PROVIDER_NAME = 'DeepSeek'
const OPENROUTER_MODEL_PROVIDER_NAME = 'OpenRouter'
const MAX_PROVIDER_CATALOG_MODELS = 500

export function defaultModelProviderSettings(): ModelProviderSettingsV1 {
  const defaultProvider = defaultModelProviderProfile('', DEFAULT_DEEPSEEK_BASE_URL)
  const openRouterProvider = openRouterModelProviderProfile()
  return {
    apiKey: defaultProvider.apiKey,
    baseUrl: defaultProvider.baseUrl,
    providers: [defaultProvider, openRouterProvider],
    perTaskModel: { enabled: false, assignments: [] },
    modelPicker: { freeOnly: false, favorites: [] }
  }
}

export function defaultPerTaskModelSettings(): PerTaskModelSettings {
  return { enabled: false, assignments: [] }
}

export function defaultModelPickerSettings(): ModelPickerSettings {
  return { freeOnly: false, favorites: [] }
}

export function normalizeModelProviderSettings(
  input: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsV1 {
  const defaults = defaultModelProviderSettings()
  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : defaults.apiKey
  const baseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim()
      ? normalizeDeepseekBaseUrl(input.baseUrl)
      : defaults.baseUrl
  const rawProviders = Array.isArray(input?.providers) ? input.providers : []
  const providersById = new Map<string, ModelProviderProfileV1>()
  const defaultProvider = defaultModelProviderProfile(apiKey, baseUrl)
  providersById.set(defaultProvider.id, defaultProvider)
  for (const rawProvider of rawProviders) {
    const provider = normalizeModelProviderProfile(rawProvider)
    if (!provider) continue
    providersById.set(provider.id, provider.id === DEFAULT_MODEL_PROVIDER_ID
      ? {
          ...defaultProvider,
          ...provider,
          apiKey,
          baseUrl
        }
      : provider)
  }
  const providers = [...providersById.values()]
  const perTaskModel = normalizePerTaskModelSettings(input?.perTaskModel)
  const modelPicker = normalizeModelPickerSettings(input?.modelPicker)
  return {
    apiKey,
    baseUrl,
    providers,
    perTaskModel,
    modelPicker
  }
}

function normalizePerTaskModelSettings(
  input: Partial<PerTaskModelSettings> | undefined
): PerTaskModelSettings {
  const defaults = defaultPerTaskModelSettings()
  const enabled = typeof input?.enabled === 'boolean' ? input.enabled : defaults.enabled
  const assignments: PerTaskModelAssignment[] = Array.isArray(input?.assignments)
    ? input.assignments.filter((a) => a && typeof a.role === 'string').map((a) => ({
        role: a.role as ModelTaskRole,
        providerId: typeof a.providerId === 'string' ? normalizeProviderId(a.providerId) : '',
        modelId: typeof a.modelId === 'string' ? a.modelId.trim() : '',
        enabled: typeof a.enabled === 'boolean' ? a.enabled : true
      }))
    : defaults.assignments
  return { enabled, assignments }
}

function normalizeModelPickerSettings(
  input: Partial<ModelPickerSettings> | undefined
): ModelPickerSettings {
  const defaults = defaultModelPickerSettings()
  const freeOnly = typeof input?.freeOnly === 'boolean' ? input.freeOnly : defaults.freeOnly
  const favorites: FavoritedModel[] = Array.isArray(input?.favorites)
    ? input.favorites.filter((f) => f && typeof f.providerId === 'string' && typeof f.modelId === 'string').map((f) => ({
        providerId: normalizeProviderId(f.providerId),
        modelId: f.modelId.trim(),
        addedAt: typeof f.addedAt === 'string' ? f.addedAt : new Date().toISOString()
      }))
    : defaults.favorites
  return { freeOnly, favorites }
}

export function mergeModelProviderSettings(
  current: ModelProviderSettingsV1,
  patch: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsV1 {
  return normalizeModelProviderSettings({
    ...current,
    ...(patch ?? {})
  })
}

export function getModelProviderSettings(settings: AppSettingsV1): ModelProviderSettingsV1 {
  return normalizeModelProviderSettings((settings as { provider?: ModelProviderSettingsPatchV1 }).provider)
}

export function modelProviderSettingsPatch(
  provider: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsPatchV1 {
  return provider ? { ...provider } : {}
}

export function resolveModelProviderApiKey(settings: AppSettingsV1): string {
  return getDefaultModelProviderProfile(settings).apiKey.trim()
}

export function resolveModelProviderBaseUrl(settings: AppSettingsV1): string {
  return normalizeDeepseekBaseUrl(getDefaultModelProviderProfile(settings).baseUrl)
}

export function getDefaultModelProviderProfile(settings: AppSettingsV1): ModelProviderProfileV1 {
  return getModelProviderProfile(settings, DEFAULT_MODEL_PROVIDER_ID)
}

export function getModelProviderProfile(
  settings: AppSettingsV1,
  providerId: string | undefined
): ModelProviderProfileV1 {
  const provider = getModelProviderSettings(settings)
  const id = normalizeProviderId(providerId || DEFAULT_MODEL_PROVIDER_ID)
  return provider.providers.find((profile) => profile.id === id) ?? provider.providers[0] ?? defaultModelProviderProfile(provider.apiKey, provider.baseUrl)
}

export function listModelProviderModelIds(settings: AppSettingsV1): string[] {
  const ids = new Set<string>()
  for (const provider of getModelProviderSettings(settings).providers) {
    for (const model of provider.models) {
      const trimmed = model.trim()
      if (trimmed) ids.add(trimmed)
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

export function resolveKunRuntimeSettings(settings: AppSettingsV1): KunRuntimeSettingsV1 {
  const runtime = getKunRuntimeSettings(settings)
  const provider = getModelProviderProfile(settings, runtime.providerId)
  const runtimeApiKey = runtime.apiKey?.trim() ?? ''
  const runtimeBaseUrl = runtime.baseUrl?.trim() ?? ''
  const providerBaseUrl = provider.baseUrl.trim() || DEFAULT_DEEPSEEK_BASE_URL

  return {
    ...runtime,
    apiKey: runtimeApiKey || provider.apiKey.trim(),
    baseUrl:
      runtimeBaseUrl && runtimeBaseUrl !== DEFAULT_DEEPSEEK_BASE_URL
        ? normalizeDeepseekBaseUrl(runtimeBaseUrl)
        : normalizeDeepseekBaseUrl(providerBaseUrl),
    endpointFormat: provider.endpointFormat
  }
}

function defaultModelProviderProfile(apiKey: string, baseUrl: string): ModelProviderProfileV1 {
  return {
    id: DEFAULT_MODEL_PROVIDER_ID,
    name: DEFAULT_MODEL_PROVIDER_NAME,
    apiKey: apiKey.trim(),
    baseUrl: normalizeDeepseekBaseUrl(baseUrl),
    endpointFormat: DEFAULT_MODEL_ENDPOINT_FORMAT,
    models: DEFAULT_COMPOSER_MODEL_IDS.filter((id) => id !== 'auto'),
    catalogModels: []
  }
}

function openRouterModelProviderProfile(): ModelProviderProfileV1 {
  return {
    id: OPENROUTER_PROVIDER_ID,
    name: OPENROUTER_MODEL_PROVIDER_NAME,
    apiKey: '',
    baseUrl: DEFAULT_OPENROUTER_BASE_URL,
    endpointFormat: DEFAULT_MODEL_ENDPOINT_FORMAT,
    models: [],
    catalogModels: []
  }
}

function normalizeModelProviderProfile(
  input: ModelProviderProfilePatchV1 | undefined
): ModelProviderProfileV1 | null {
  const id = normalizeProviderId(input?.id)
  if (!id) return null
  const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : id
  const baseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim()
      ? normalizeDeepseekBaseUrl(input.baseUrl)
      : DEFAULT_DEEPSEEK_BASE_URL
  const models = normalizeProviderModels(input?.models)
  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
  return {
    id,
    name,
    apiKey: isStoredEncryptedMarker(apiKey) ? '' : apiKey,
    baseUrl,
    endpointFormat: normalizeModelEndpointFormat(input?.endpointFormat),
    models,
    catalogUpdatedAt: normalizeOptionalString(input?.catalogUpdatedAt, 128),
    catalogError: normalizeOptionalString(input?.catalogError, 512),
    catalogModels: normalizeCatalogModels(input?.catalogModels, id),
    credentialStatus: normalizeCredentialStatus(input?.credentialStatus),
    credentialLabel: normalizeOptionalString(input?.credentialLabel, 128),
    credentialMaskedPreview: normalizeOptionalString(input?.credentialMaskedPreview, 64),
    credentialLimit: typeof input?.credentialLimit === 'number' ? input.credentialLimit : null,
    credentialUsage: typeof input?.credentialUsage === 'number' ? input.credentialUsage : 0
  }
}

export function isStoredEncryptedMarker(value: string): boolean {
  return value === STORED_ENCRYPTED_MARKER
}

function normalizeCredentialStatus(value: unknown): ProviderCredentialStatus | undefined {
  if (value === 'connected' || value === 'invalid' || value === 'unvalidated') return value
  return undefined
}

export function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 12) return '••••••••'
  const prefix = key.slice(0, 5)
  const suffix = key.slice(-4)
  return `${prefix}…${suffix}`
}

export function providerProfilesForSettings(
  profiles: ReadonlyArray<ModelProviderProfileV1>,
  credentialMaskedPreviews?: Map<string, string>
): ModelProviderProfileV1[] {
  return profiles.map((p) => ({
    ...p,
    apiKey: p.apiKey && !isStoredEncryptedMarker(p.apiKey)
      ? STORED_ENCRYPTED_MARKER
      : p.apiKey,
    credentialMaskedPreview: credentialMaskedPreviews?.get(p.id) ?? p.credentialMaskedPreview
  }))
}

function normalizeProviderModels(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const ids = new Set<string>()
  for (const model of models) {
    if (typeof model !== 'string') continue
    const trimmed = model.trim()
    if (trimmed) ids.add(trimmed)
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function normalizeCatalogModels(models: unknown, providerId: string): ModelProviderCatalogModelV1[] {
  if (!Array.isArray(models)) return []
  const byId = new Map<string, ModelProviderCatalogModelV1>()
  for (const model of models) {
    const normalized = normalizeCatalogModel(model, providerId)
    if (!normalized) continue
    byId.set(normalized.id, normalized)
    if (byId.size >= MAX_PROVIDER_CATALOG_MODELS) break
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function normalizeCatalogModel(input: unknown, fallbackProviderId: string): ModelProviderCatalogModelV1 | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const raw = input as Partial<ModelProviderCatalogModelV1>
  const id = normalizeOptionalString(raw.id, 256)
  if (!id) return null
  const name = normalizeOptionalString(raw.name, 160) ?? id
  const providerId = normalizeProviderId(raw.providerId) || fallbackProviderId
  const contextLength = normalizePositiveNumber(raw.contextLength)
  const tokenizer = normalizeOptionalString(raw.tokenizer, 80)
  const pricingUsdPerMillion = normalizePricing(raw.pricingUsdPerMillion)
  return {
    id,
    name,
    providerId,
    ...(contextLength !== undefined ? { contextLength } : {}),
    ...(tokenizer ? { tokenizer } : {}),
    ...(pricingUsdPerMillion ? { pricingUsdPerMillion } : {}),
    capabilities: normalizeCatalogCapabilities(raw.capabilities)
  }
}

function normalizePricing(
  pricing: unknown
): ModelProviderCatalogModelV1['pricingUsdPerMillion'] | undefined {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) return undefined
  const raw = pricing as Record<string, unknown>
  const input = normalizeNonNegativeNumber(raw.input)
  const output = normalizeNonNegativeNumber(raw.output)
  if (input === undefined || output === undefined) return undefined
  const cacheRead = normalizeNonNegativeNumber(raw.cacheRead)
  const cacheWrite = normalizeNonNegativeNumber(raw.cacheWrite)
  return {
    input,
    output,
    ...(cacheRead !== undefined ? { cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite } : {})
  }
}

function normalizeCatalogCapabilities(
  capabilities: unknown
): ModelProviderCatalogModelV1['capabilities'] {
  const raw = capabilities && typeof capabilities === 'object' && !Array.isArray(capabilities)
    ? capabilities as Record<string, unknown>
    : {}
  return {
    inputModalities: normalizeStringList(raw.inputModalities),
    outputModalities: normalizeStringList(raw.outputModalities),
    reasoning: raw.reasoning === true,
    tools: raw.tools === true,
    recommendedUse: normalizeStringList(raw.recommendedUse)
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim().toLowerCase()
    if (trimmed) out.add(trimmed)
  }
  return [...out]
}

function normalizeOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function normalizePositiveNumber(value: unknown): number | undefined {
  const normalized = normalizeNonNegativeNumber(value)
  return normalized !== undefined && normalized > 0 ? Math.floor(normalized) : undefined
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function normalizeProviderId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    : ''
}

/**
 * Map a thread mode (or similar context hint) to a task role for
 * per-task model assignment lookups (M2.5).
 */
export function threadModeToTaskRole(mode?: string): ModelTaskRole {
  switch (mode) {
    case 'plan':
      return 'plan'
    case 'review':
      return 'review'
    case 'agent':
    default:
      return 'code'
  }
}

/**
 * Resolve a per-task model assignment for the given settings and role.
 * Returns empty when per-task routing is disabled or no assignment matches.
 */
export function resolvePerTaskAssignment(
  settings: AppSettingsV1,
  role: ModelTaskRole
): ResolvedSendModel {
  const perTask = getModelProviderSettings(settings).perTaskModel
  if (!perTask.enabled) return {}
  const assignment = perTask.assignments.find(
    (a) => a.enabled && a.role === role
  )
  if (!assignment) return {}
  const providerId = assignment.providerId.trim()
  const modelId = assignment.modelId.trim()
  if (!providerId && !modelId) return {}
  return {
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {})
  }
}

/**
 * Resolve the effective send model for a turn by merging:
 * 1. Explicit overrides (composer quick-switch / direct override)
 * 2. Per-task assignment (if enabled and role matches)
 * Returns the resolved { providerId, modelId } to use.
 */
export function resolveSendModel(
  settings: AppSettingsV1,
  options?: {
    mode?: string
    explicitProviderId?: string
    explicitModelId?: string
    role?: ModelTaskRole
  }
): ResolvedSendModel {
  // Explicit overrides take highest priority
  if (options?.explicitProviderId?.trim() || options?.explicitModelId?.trim()) {
    return {
      ...(options.explicitProviderId?.trim() ? { providerId: options.explicitProviderId.trim() } : {}),
      ...(options.explicitModelId?.trim() ? { modelId: options.explicitModelId.trim() } : {})
    }
  }
  // Per-task assignment
  if (options?.role) {
    return resolvePerTaskAssignment(settings, options.role)
  }
  if (options?.mode) {
    return resolvePerTaskAssignment(settings, threadModeToTaskRole(options.mode))
  }
  return {}
}
