import {
  DEFAULT_DEEPSEEK_BASE_URL,
  OPENROUTER_PROVIDER_ID,
  type ModelProviderCatalogModelV1,
  type ModelProviderProfileV1
} from '../../shared/app-settings'
import { normalizeModelEndpointFormat, modelEndpointPath, type ModelEndpointFormat } from '../../../kun/src/contracts/model-endpoint-format'
import { REDACTED_SECRET } from '../../shared/secret-redaction'
import { fetchModelProviderCatalog } from '../upstream-models'
import { upstreamOpenAiModelsUrl } from '../../shared/openai-compat-url'

export type KeyValidationResult = {
  ok: true
  providerId: string
  keyLabel?: string
  keyLimit?: number | null
  keyUsage?: number
} | {
  ok: false
  message: string
}

export type ModelDiscoveryResult = {
  ok: true
  catalogModels: ModelProviderCatalogModelV1[]
} | {
  ok: false
  message: string
}

const VALIDATION_TIMEOUT_MS = 10_000

/**
 * Validate that an API key works for a given provider.
 *
 * - OpenRouter: GET /api/v1/auth/key (returns key metadata)
 * - DeepSeek / Custom: GET /v1/models first, then format-specific endpoint fallback
 * - endpointFormat controls the fallback validation path:
 *     chat_completions → POST /v1/chat/completions
 *     responses       → POST /v1/responses
 *     messages        → POST /v1/messages
 */
export async function validateProviderKey(
  providerId: string,
  key: string,
  baseUrl: string,
  endpointFormat?: ModelEndpointFormat,
  fetchImpl: typeof fetch = fetch
): Promise<KeyValidationResult> {
  const trimmed = key.trim()
  const base = baseUrl?.trim() || DEFAULT_DEEPSEEK_BASE_URL
  const normalizedKey = trimmed
  const format = normalizeModelEndpointFormat(endpointFormat)

  if (!normalizedKey) {
    return { ok: false, message: 'API key is required.' }
  }

  try {
    if (isOpenRouterProvider(providerId, base)) {
      return await validateOpenRouterKey(normalizedKey, fetchImpl)
    }
    return await validateOpenAiCompatibleKey(normalizedKey, base, format, fetchImpl)
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

async function validateOpenRouterKey(
  key: string,
  fetchImpl: typeof fetch
): Promise<KeyValidationResult> {
  const res = await fetchImpl('https://openrouter.ai/api/v1/auth/key', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS)
  })

  const text = await res.text()

  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: 'Invalid API key. Please check your key and try again.' }
  }

  if (!res.ok) {
    return { ok: false, message: `Key validation failed (${res.status}): ${text.slice(0, 200)}` }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, message: 'Key validation returned non-JSON response.' }
  }

  const info = (parsed.data ?? parsed) as Record<string, unknown>
  return {
    ok: true,
    providerId: OPENROUTER_PROVIDER_ID,
    keyLabel: typeof info.label === 'string' ? info.label : typeof info.name === 'string' ? info.name : undefined,
    keyLimit: typeof info.limit === 'number' ? info.limit as number | null : null,
    keyUsage: (typeof info.usage === 'number' ? info.usage : 0) as number
  }
}

async function validateOpenAiCompatibleKey(
  key: string,
  baseUrl: string,
  endpointFormat: ModelEndpointFormat,
  fetchImpl: typeof fetch
): Promise<KeyValidationResult> {
  // Try /v1/models first — if it returns 200 with data[], key is valid
  const modelsUrl = upstreamOpenAiModelsUrl(baseUrl)

  const res = await fetchImpl(modelsUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS)
  })

  const text = await res.text()

  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: 'Invalid API key. Please check your key and try again.' }
  }

  // ── Non-2xx /v1/models: discriminate real-API vs wrong-endpoint ──
  if (!res.ok) {
    // 5xx → fail closed: server errors don't prove a valid key
    if (res.status >= 500) {
      return {
        ok: false,
        message: `Server error (${res.status}) from /v1/models. The endpoint may be unreachable or misconfigured.`
      }
    }

    const trimmed = text.trimStart()
    // HTML response → wrong endpoint, fail closed (not an API)
    if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
      return {
        ok: false,
        message: `Unexpected HTML response from ${new URL(modelsUrl).hostname}. The endpoint does not appear to be an OpenAI-compatible API.`
      }
    }

    // Try JSON parse for 4xx — a real API returns JSON even on errors
    try {
      JSON.parse(text)
    } catch {
      // Non-JSON, non-HTML → wrong endpoint, fail closed
      return {
        ok: false,
        message: `Unexpected response from ${new URL(modelsUrl).hostname}. The endpoint may not be an OpenAI-compatible API.`
      }
    }

    // JSON 4xx from /v1/models → could be a real API without /v1/models support
    // Fall back to format-specific endpoint validation
    return validateWithEndpoint(key, baseUrl, endpointFormat, fetchImpl)
  }

  // ── 2xx /v1/models: must be parseable JSON ──
  const okTrimmed = text.trimStart()
  if (okTrimmed.startsWith('<') || okTrimmed.toLowerCase().startsWith('<!doctype')) {
    return {
      ok: false,
      message: `Unexpected HTML response from ${new URL(modelsUrl).hostname}. The endpoint does not appear to be an OpenAI-compatible API.`
    }
  }

  let parsed: { data?: unknown }
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      message: `Unexpected non-JSON response from ${new URL(modelsUrl).hostname}. The endpoint may not be an OpenAI-compatible API.`
    }
  }

  if (Array.isArray(parsed.data)) {
    return { ok: true, providerId: 'custom' }
  }

  // 2xx with valid JSON but no data array — fall back to endpoint check
  return validateWithEndpoint(key, baseUrl, endpointFormat, fetchImpl)
}

/**
 * Build a versioned endpoint URL for the given path (e.g. "chat/completions", "responses").
 * Mirrors upstreamOpenAiChatCompletionsUrl / upstreamOpenAiModelsUrl logic so /beta bases
 * resolve to /v1.
 */
function upstreamEndpointUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  const lastSeg = trimmed.split('/').pop()?.toLowerCase() ?? ''

  const isVersion = /^v\d+$/i.test(lastSeg) || lastSeg === 'beta'

  let versioned: string
  if (isVersion) {
    if (lastSeg === 'beta') {
      // /beta → strip beta, append /v1
      const slash = trimmed.lastIndexOf('/')
      versioned = slash >= 0 ? `${trimmed.slice(0, slash)}/v1` : `${trimmed}/v1`
    } else {
      versioned = trimmed
    }
  } else {
    versioned = `${trimmed}/v1`
  }

  return `${versioned.replace(/\/+$/, '')}/${path}`
}

/**
 * Build a minimal request body for key validation, appropriate to the endpoint format.
 */
function buildValidationBody(format: ModelEndpointFormat): string {
  switch (format) {
    case 'responses':
      return JSON.stringify({
        model: 'gpt-4o-mini',
        input: 'hi',
        max_output_tokens: 1
      })
    case 'messages':
      return JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
    case 'chat_completions':
    default:
      return JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      })
  }
}

/**
 * Validate a key by hitting the format-specific endpoint (chat_completions, responses, or messages).
 *
 * Gate policy (fail-closed):
 * - 2xx                     → key is valid
 * - 401 / 403               → invalid key
 * - 5xx                     → fail closed (server error is not proof of a valid key)
 * - Non-JSON / HTML body    → fail closed (wrong endpoint, not an API)
 * - 4xx with structured      → if the body is parseable JSON with an error.message or error.type,
 *   OpenAI-compatible error    treat as proof that auth passed (model-not-found, etc.)
 * - Other 4xx               → fail closed (unknown error from endpoint)
 */
async function validateWithEndpoint(
  key: string,
  baseUrl: string,
  endpointFormat: ModelEndpointFormat,
  fetchImpl: typeof fetch
): Promise<KeyValidationResult> {
  const path = modelEndpointPath(endpointFormat)
  const url = upstreamEndpointUrl(baseUrl, path)
  const body = buildValidationBody(endpointFormat)

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body,
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS)
    })

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Invalid API key. Please check your key and try again.' }
    }

    const text = await res.text()

    // 2xx → key is valid, but must not be HTML (wrong endpoint / proxy misconfiguration)
    if (res.ok) {
      const trimmed = text.trimStart()
      if (trimmed.startsWith('<')) {
        return {
          ok: false,
          message: `Unexpected HTML response from ${new URL(url).hostname}. The endpoint may not be an OpenAI-compatible API.`
        }
      }
      return { ok: true, providerId: 'custom' }
    }

    // 5xx → fail closed: server errors don't prove a valid key
    if (res.status >= 500) {
      return {
        ok: false,
        message: `Server error (${res.status}) from ${new URL(url).hostname}. The endpoint may be unreachable or misconfigured.`
      }
    }

    // 4xx (not 401/403) → check for structured OpenAI-compatible error that proves auth passed
    const isJsonLike = text.trimStart().startsWith('{')
    if (!isJsonLike) {
      return {
        ok: false,
        message: `Unexpected response (${res.status}) from ${new URL(url).hostname}. The endpoint may not be an OpenAI-compatible API.`
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return {
        ok: false,
        message: `Invalid JSON response (${res.status}) from ${new URL(url).hostname}. The endpoint may not be an OpenAI-compatible API.`
      }
    }

    // Check for tightly-constrained OpenAI-compatible error shape.
    // Must have error.message (a non-empty string) — this proves the API
    // understood the request and auth passed (model_not_found, etc.).
    const err = (parsed as { error?: { message?: unknown; type?: unknown; code?: unknown } }).error
    if (err && typeof err === 'object' && typeof err.message === 'string' && err.message.length > 0) {
      return { ok: true, providerId: 'custom' }
    }

    return {
      ok: false,
      message: `Validation failed (${res.status}): ${text.slice(0, 200)}`
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      return { ok: false, message: `Cannot reach ${new URL(url).hostname}. Check the base URL and network connection.` }
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { ok: false, message: 'Connection timed out. Check the base URL and network connection.' }
    }
    return { ok: false, message: `Connection failed: ${msg}` }
  }
}

/**
 * Discover models available for a given provider + key.
 * Reuses the existing Phase 2 catalog machinery.
 */
export async function discoverModels(
  provider: ModelProviderProfileV1,
  fetchImpl: typeof fetch = fetch
): Promise<ModelDiscoveryResult> {
  const result = await fetchModelProviderCatalog({
    provider: { ...provider, apiKey: provider.apiKey },
    fetchImpl
  })

  if (!result.ok) {
    return { ok: false, message: result.message }
  }

  return {
    ok: true,
    catalogModels: result.catalogModels
  }
}

function isOpenRouterProvider(providerId: string, baseUrl: string): boolean {
  if (providerId === OPENROUTER_PROVIDER_ID) return true
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return /openrouter\.ai/i.test(baseUrl)
  }
}

export { REDACTED_SECRET }
