import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_MODEL_PROVIDER_ID,
  DEFAULT_OPENROUTER_BASE_URL,
  OPENROUTER_PROVIDER_ID,
  type AppSettingsV1,
  type KunRuntimeSettingsV1,
  type ModelProviderCatalogModelV1,
  type ModelProviderProfilePatchV1,
  type ModelProviderProfileV1,
  type ModelProviderSettingsPatchV1,
  type ModelProviderSettingsV1
} from './app-settings-types'
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
    providers: [defaultProvider, openRouterProvider]
  }
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
  return {
    apiKey,
    baseUrl,
    providers
  }
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
        : normalizeDeepseekBaseUrl(providerBaseUrl)
  }
}

function defaultModelProviderProfile(apiKey: string, baseUrl: string): ModelProviderProfileV1 {
  return {
    id: DEFAULT_MODEL_PROVIDER_ID,
    name: DEFAULT_MODEL_PROVIDER_NAME,
    apiKey: apiKey.trim(),
    baseUrl: normalizeDeepseekBaseUrl(baseUrl),
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
  return {
    id,
    name,
    apiKey: typeof input?.apiKey === 'string' ? input.apiKey.trim() : '',
    baseUrl,
    models,
    catalogUpdatedAt: normalizeOptionalString(input?.catalogUpdatedAt, 128),
    catalogError: normalizeOptionalString(input?.catalogError, 512),
    catalogModels: normalizeCatalogModels(input?.catalogModels, id)
  }
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
