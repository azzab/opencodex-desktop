import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_OPENROUTER_BASE_URL,
  getModelProviderProfile,
  getModelProviderSettings,
  listModelProviderModelIds,
  OPENROUTER_PROVIDER_ID,
  resolveKunRuntimeSettings,
  type AppSettingsV1,
  type ModelProviderCatalogModelV1,
  type ModelProviderProfileV1
} from '../shared/app-settings'
import { DEFAULT_COMPOSER_MODEL_IDS } from '../shared/default-composer-models'
import type { ModelProviderModelGroup } from '../shared/ds-gui-api'
import { upstreamOpenAiModelsUrl } from '../shared/openai-compat-url'
import { REDACTED_SECRET, redactSecretText } from '../shared/secret-redaction'

export type FetchUpstreamModelsResult =
  | { ok: true; modelIds: string[]; modelGroups?: ModelProviderModelGroup[]; catalogModels?: ModelProviderCatalogModelV1[] }
  | { ok: false; message: string }
export type FetchModelProviderCatalogResult =
  | {
      ok: true
      providerId: string
      modelIds: string[]
      catalogModels: ModelProviderCatalogModelV1[]
      catalogUpdatedAt: string
    }
  | { ok: false; providerId: string; message: string }

const UPSTREAM_MODELS_TIMEOUT_MS = 8_000
const OPENROUTER_MODELS_URL = `${DEFAULT_OPENROUTER_BASE_URL}/models`
const TOKENS_PER_MILLION = 1_000_000

export function fallbackModelIds(): string[] {
  return sortComposerModelIds(DEFAULT_COMPOSER_MODEL_IDS)
}

export async function fetchUpstreamModelIds(
  settings: AppSettingsV1,
  apiKey: string
): Promise<FetchUpstreamModelsResult> {
  const configuredModelIds = await readConfiguredKunModelIds(settings)
  const configuredGroups = await readConfiguredModelGroups(settings)
  const runtime = resolveKunRuntimeSettings(settings)
  const activeProvider = getModelProviderProfile(settings, runtime.providerId)
  const key = apiKey.trim()
  const catalog = await fetchModelProviderCatalog({
    provider: {
      ...activeProvider,
      apiKey: key || activeProvider.apiKey
    }
  })
  if (catalog.ok && catalog.catalogModels.length > 0) {
    const catalogIds = catalog.catalogModels.map((model) => model.id)
    return {
      ok: true,
      modelIds: mergeModelIds([...catalogIds, ...configuredModelIds]),
      modelGroups: mergeModelGroups([
        ...configuredGroups,
        {
          providerId: activeProvider.id,
          label: activeProvider.name,
          modelIds: catalogIds
        }
      ]),
      catalogModels: catalog.catalogModels
    }
  }
  if (!key) {
    return modelListOrError(configuredModelIds, configuredGroups, 'Missing API key; cannot query upstream /v1/models.')
  }
  const url = upstreamOpenAiModelsUrl(runtime.baseUrl)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`
      },
      signal: AbortSignal.timeout(UPSTREAM_MODELS_TIMEOUT_MS)
    })
    const text = await res.text()
    if (!res.ok) {
      return modelListOrError(
        configuredModelIds,
        configuredGroups,
        `Upstream models request failed (${res.status}): ${text.slice(0, 400)}`
      )
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      return modelListOrError(configuredModelIds, configuredGroups, 'Upstream /v1/models returned non-JSON body.')
    }
    const data = (parsed as { data?: unknown }).data
    if (!Array.isArray(data)) {
      return modelListOrError(configuredModelIds, configuredGroups, 'Upstream /v1/models JSON missing data[] array.')
    }
    const ids = new Set<string>()
    for (const row of data) {
      if (row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string') {
        const id = (row as { id: string }).id.trim()
        if (id) ids.add(id)
      }
    }
    const sorted = mergeModelIds([...ids, ...configuredModelIds])
    if (sorted.length === 0) {
      return { ok: false, message: 'Upstream returned an empty model list.' }
    }
    return {
      ok: true,
      modelIds: sorted,
      modelGroups: mergeModelGroups([
        ...configuredGroups,
        {
          providerId: activeProvider.id,
          label: activeProvider.name,
          modelIds: [...ids]
        }
      ])
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return modelListOrError(configuredModelIds, configuredGroups, msg)
  }
}

export async function fetchModelProviderCatalog(input: {
  provider: ModelProviderProfileV1 | Omit<ModelProviderProfileV1, 'catalogModels'>
  fetchImpl?: typeof fetch
  nowIso?: () => string
}): Promise<FetchModelProviderCatalogResult> {
  const providerId = input.provider.id.trim()
  const fetchImpl = input.fetchImpl ?? fetch
  const nowIso = input.nowIso ?? (() => new Date().toISOString())
  const url = providerId === OPENROUTER_PROVIDER_ID || isOpenRouterBaseUrl(input.provider.baseUrl)
    ? OPENROUTER_MODELS_URL
    : upstreamOpenAiModelsUrl(input.provider.baseUrl)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    }
    const apiKey = input.provider.apiKey.trim()
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    const res = await fetchImpl(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(UPSTREAM_MODELS_TIMEOUT_MS)
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        providerId,
        message: redactProviderError(
          `Provider models request failed (${res.status}): ${text.slice(0, 400)}`,
          apiKey
        )
      }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      return { ok: false, providerId, message: 'Provider models endpoint returned non-JSON body.' }
    }
    const catalogModels = providerId === OPENROUTER_PROVIDER_ID || isOpenRouterBaseUrl(input.provider.baseUrl)
      ? parseOpenRouterModelCatalog(parsed)
      : parseOpenAiModelCatalog(parsed, providerId)
    return {
      ok: true,
      providerId,
      modelIds: catalogModels.map((model) => model.id),
      catalogModels,
      catalogUpdatedAt: nowIso()
    }
  } catch (error) {
    return {
      ok: false,
      providerId,
      message: redactProviderError(error instanceof Error ? error.message : String(error), input.provider.apiKey)
    }
  }
}

function redactProviderError(message: string, apiKey: string): string {
  const redacted = redactSecretText(message)
  const key = apiKey.trim()
  return key ? redacted.replaceAll(key, REDACTED_SECRET) : redacted
}

export function parseOpenRouterModelCatalog(payload: unknown): ModelProviderCatalogModelV1[] {
  const data = objectValue(payload).data
  if (!Array.isArray(data)) return []
  const models: ModelProviderCatalogModelV1[] = []
  for (const row of data) {
    const raw = objectValue(row)
    const id = stringValue(raw.id)
    if (!id) continue
    const architecture = objectValue(raw.architecture)
    const pricing = objectValue(raw.pricing)
    const normalizedPricing = pricingForOpenRouter(pricing)
    const supportedParameters = stringArrayValue(raw.supported_parameters)
    const inputModalities = stringArrayValue(architecture.input_modalities)
    const outputModalities = stringArrayValue(architecture.output_modalities)
    const contextLength = positiveIntegerValue(raw.context_length)
      ?? positiveIntegerValue(objectValue(raw.top_provider).context_length)
    const supportsReasoning = supportedParameters.includes('reasoning') ||
      supportedParameters.includes('include_reasoning') ||
      pricing.internal_reasoning !== undefined
    const supportsTools = supportedParameters.includes('tools') || supportedParameters.includes('tool_choice')
    models.push({
      id,
      name: stringValue(raw.name) || id,
      providerId: OPENROUTER_PROVIDER_ID,
      ...(contextLength ? { contextLength } : {}),
      ...(stringValue(architecture.tokenizer) ? { tokenizer: stringValue(architecture.tokenizer) } : {}),
      ...(normalizedPricing ? { pricingUsdPerMillion: normalizedPricing } : {}),
      capabilities: {
        inputModalities: inputModalities.length ? inputModalities : ['text'],
        outputModalities: outputModalities.length ? outputModalities : ['text'],
        reasoning: supportsReasoning,
        tools: supportsTools,
        recommendedUse: recommendedUseForModel({
          contextLength,
          supportsReasoning,
          supportsTools,
          pricing: normalizedPricing
        })
      }
    })
  }
  return models.sort((a, b) => a.id.localeCompare(b.id))
}

function parseOpenAiModelCatalog(payload: unknown, providerId: string): ModelProviderCatalogModelV1[] {
  const data = objectValue(payload).data
  if (!Array.isArray(data)) return []
  const models: ModelProviderCatalogModelV1[] = []
  for (const row of data) {
    const raw = objectValue(row)
    const id = stringValue(raw.id)
    if (!id) continue
    models.push({
      id,
      name: stringValue(raw.name) || id,
      providerId,
      capabilities: {
        inputModalities: ['text'],
        outputModalities: ['text'],
        reasoning: false,
        tools: true,
        recommendedUse: []
      }
    })
  }
  return models.sort((a, b) => a.id.localeCompare(b.id))
}

export async function readConfiguredKunModelIds(settings: AppSettingsV1): Promise<string[]> {
  const runtime = resolveKunRuntimeSettings(settings)
  const configPath = join(expandHome(runtime.dataDir), 'config.json')
  const ids = [runtime.model, ...listModelProviderModelIds(settings)]
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(configPath, 'utf8')) as unknown
  } catch {
    return mergeModelIds(ids)
  }
  const root = objectValue(parsed)
  const models = objectValue(root.models)
  const contextCompaction = objectValue(root.contextCompaction)
  return mergeModelIds([
    ...ids,
    ...modelIdsFromProfiles(objectValue(contextCompaction.modelProfiles)),
    ...modelIdsFromProfiles(objectValue(models.profiles))
  ])
}

function modelListOrError(
  ids: readonly string[],
  groups: readonly ModelProviderModelGroup[],
  message: string
): FetchUpstreamModelsResult {
  return hasCustomModelId(ids)
    ? { ok: true, modelIds: mergeModelIds(ids), modelGroups: mergeModelGroups(groups) }
    : { ok: false, message }
}

async function readConfiguredModelGroups(settings: AppSettingsV1): Promise<ModelProviderModelGroup[]> {
  const groups: ModelProviderModelGroup[] = []
  for (const provider of getModelProviderSettings(settings).providers) {
    if (provider.models.length === 0) continue
    groups.push({
      providerId: provider.id,
      label: provider.name,
      modelIds: provider.models
    })
  }
  return mergeModelGroups([
    ...groups,
    ...(await readConfiguredProfileAliasGroups(settings, groups))
  ])
}

function mergeModelGroups(groups: readonly ModelProviderModelGroup[]): ModelProviderModelGroup[] {
  const byProvider = new Map<string, ModelProviderModelGroup>()
  for (const group of groups) {
    const providerId = group.providerId.trim()
    if (!providerId) continue
    const existing = byProvider.get(providerId)
    const modelIds = sortComposerModelIds([
      ...(existing?.modelIds ?? []),
      ...group.modelIds
    ]).filter((id) => id !== 'auto')
    byProvider.set(providerId, {
      providerId,
      label: group.label.trim() || providerId,
      modelIds
    })
  }
  return [...byProvider.values()].filter((group) => group.modelIds.length > 0)
}

function modelIdsFromProfiles(profiles: Record<string, unknown>): string[] {
  const ids: string[] = []
  for (const [modelId, rawProfile] of Object.entries(profiles)) {
    const trimmed = modelId.trim()
    if (trimmed) ids.push(trimmed)
    const aliases = objectValue(rawProfile).aliases
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (typeof alias !== 'string') continue
        const trimmedAlias = alias.trim()
        if (trimmedAlias) ids.push(trimmedAlias)
      }
    }
  }
  return ids
}

async function readConfiguredProfileAliasGroups(
  settings: AppSettingsV1,
  providerGroups: readonly ModelProviderModelGroup[]
): Promise<ModelProviderModelGroup[]> {
  const runtime = resolveKunRuntimeSettings(settings)
  const configPath = join(expandHome(runtime.dataDir), 'config.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(configPath, 'utf8')) as unknown
  } catch {
    return []
  }
  const root = objectValue(parsed)
  const models = objectValue(root.models)
  const contextCompaction = objectValue(root.contextCompaction)
  const aliasesByModel = new Map<string, string[]>()
  collectModelProfileAliases(aliasesByModel, objectValue(contextCompaction.modelProfiles))
  collectModelProfileAliases(aliasesByModel, objectValue(models.profiles))

  const aliasGroups: ModelProviderModelGroup[] = []
  for (const group of providerGroups) {
    const aliases: string[] = []
    for (const modelId of group.modelIds) {
      aliases.push(...(aliasesByModel.get(modelId.trim()) ?? []))
    }
    if (aliases.length === 0) continue
    aliasGroups.push({
      providerId: group.providerId,
      label: group.label,
      modelIds: aliases
    })
  }
  return aliasGroups
}

function collectModelProfileAliases(
  target: Map<string, string[]>,
  profiles: Record<string, unknown>
): void {
  for (const [modelId, rawProfile] of Object.entries(profiles)) {
    const trimmed = modelId.trim()
    if (!trimmed) continue
    const aliases = objectValue(rawProfile).aliases
    if (!Array.isArray(aliases)) continue
    const ids = target.get(trimmed) ?? []
    for (const alias of aliases) {
      if (typeof alias !== 'string') continue
      const trimmedAlias = alias.trim()
      if (trimmedAlias) ids.push(trimmedAlias)
    }
    target.set(trimmed, ids)
  }
}

function mergeModelIds(ids: readonly string[]): string[] {
  return sortComposerModelIds([...DEFAULT_COMPOSER_MODEL_IDS, ...ids])
}

function hasCustomModelId(ids: readonly string[]): boolean {
  const defaults = new Set<string>(DEFAULT_COMPOSER_MODEL_IDS)
  return ids.some((id) => {
    const trimmed = id.trim()
    return trimmed !== '' && !defaults.has(trimmed as typeof DEFAULT_COMPOSER_MODEL_IDS[number])
  })
}

function sortComposerModelIds(ids: readonly string[]): string[] {
  const ordered = new Set<string>()
  for (const id of ids) {
    const trimmed = id.trim()
    if (trimmed) ordered.add(trimmed)
  }
  const tail = [...ordered].filter((id) => id !== 'auto').sort((a, b) => a.localeCompare(b))
  return ordered.has('auto') ? ['auto', ...tail] : tail
}

function pricingForOpenRouter(
  pricing: Record<string, unknown>
): ModelProviderCatalogModelV1['pricingUsdPerMillion'] | undefined {
  const input = pricePerMillion(pricing.prompt)
  const output = pricePerMillion(pricing.completion)
  if (input === undefined || output === undefined) return undefined
  const cacheRead = pricePerMillion(pricing.input_cache_read)
  const cacheWrite = pricePerMillion(pricing.input_cache_write)
  return {
    input,
    output,
    ...(cacheRead !== undefined ? { cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite } : {})
  }
}

function pricePerMillion(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return roundCurrency(parsed * TOKENS_PER_MILLION)
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000
}

function recommendedUseForModel(input: {
  contextLength: number | undefined
  supportsReasoning: boolean
  supportsTools: boolean
  pricing: ModelProviderCatalogModelV1['pricingUsdPerMillion'] | undefined
}): string[] {
  const use = new Set<string>()
  const cheapInput = (input.pricing?.input ?? Number.POSITIVE_INFINITY) <= 0.5
  const cheapOutput = (input.pricing?.output ?? Number.POSITIVE_INFINITY) <= 1.5
  if (cheapInput && cheapOutput) {
    use.add('chat')
    use.add('status')
  }
  if (input.supportsTools) {
    use.add('coding')
    use.add('review')
  }
  if (input.supportsReasoning) {
    use.add('coding')
    use.add('review')
  }
  if ((input.contextLength ?? 0) >= 200_000) {
    use.add('research')
  }
  return [...use]
}

function isOpenRouterBaseUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return /(^|\/\/)openrouter\.ai\b/i.test(value)
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (trimmed) out.push(trimmed)
  }
  return out
}

function positiveIntegerValue(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function expandHome(path: string): string {
  return path.startsWith('~') ? path.replace(/^~(?=$|[\\/])/, homedir()) : path
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
