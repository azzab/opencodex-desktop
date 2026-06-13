import { LOCAL_PROVIDERS, type LocalProviderDef } from '../../shared/provider-profiles'

export type LocalProviderDetectionResult =
  | { ok: true; provider: LocalProviderDef; models: string[]; latencyMs: number; version?: string }
  | { ok: false; providerId: string; message: string }

const DETECT_TIMEOUT_MS = 5_000
const DISCOVERY_TIMEOUT_MS = 3_000

/**
 * Auto-detect a single local provider on its default port by hitting its
 * discovery endpoint. Returns detected models, latency, and optional version.
 */
export async function detectLocalProvider(
  provider: LocalProviderDef,
  fetchImpl: typeof fetch = fetch
): Promise<LocalProviderDetectionResult> {
  try {
    const start = Date.now()
    const res = await fetchImpl(`${provider.apiPath}${provider.discoveryPath}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(DETECT_TIMEOUT_MS)
    })
    const latencyMs = Date.now() - start

    if (!res.ok) {
      return {
        ok: false,
        providerId: provider.id,
        message: `No response on port ${provider.defaultPort} (HTTP ${res.status}). Is ${provider.name} running?`
      }
    }

    const text = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return {
        ok: false,
        providerId: provider.id,
        message: `Received non-JSON response from ${provider.name}. Verify the server is running.`
      }
    }

    const models = extractLocalModels(provider, parsed)
    const version = extractLocalVersion(provider, parsed)

    return {
      ok: true,
      provider,
      models,
      latencyMs,
      version
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      return {
        ok: false,
        providerId: provider.id,
        message: `${provider.name} is not running on port ${provider.defaultPort}. Start ${provider.name} and try again.`
      }
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return {
        ok: false,
        providerId: provider.id,
        message: `${provider.name} on port ${provider.defaultPort} did not respond in time. Check the server.`
      }
    }
    return {
      ok: false,
      providerId: provider.id,
      message: `Failed to detect ${provider.name}: ${msg}`
    }
  }
}

/**
 * Scan all known local providers and return results for any that respond.
 * Non-responding providers are still reported with ok:false — callers can
 * distinguish between "not present" and "present but misconfigured".
 */
export async function scanLocalProviders(
  onProgress?: (result: LocalProviderDetectionResult) => void,
  fetchImpl: typeof fetch = fetch
): Promise<LocalProviderDetectionResult[]> {
  const results = await Promise.all(
    LOCAL_PROVIDERS.map(async (provider) => {
      const result = await detectLocalProvider(provider, fetchImpl)
      onProgress?.(result)
      return result
    })
  )
  return results
}

/**
 * Extract model IDs from a local provider's discovery response.
 *
 * Ollama: { models: [{ name: "llama3:8b", ... }, ...] }
 * LM Studio: { data: [{ id: "local-model", ... }, ...] } (OpenAI-compatible format)
 */
function extractLocalModels(provider: LocalProviderDef, parsed: unknown): string[] {
  const obj = objectValue(parsed)

  // Ollama format
  if (provider.id === 'ollama') {
    const models = obj.models
    if (!Array.isArray(models)) return []
    return models
      .map((m) => {
        const modelObj = objectValue(m)
        return typeof modelObj.name === 'string' ? modelObj.name.trim() : ''
      })
      .filter(Boolean)
  }

  // LM Studio / OpenAI-compatible format
  const data = obj.data
  if (Array.isArray(data)) {
    return data
      .map((m) => {
        const modelObj = objectValue(m)
        return typeof modelObj.id === 'string' ? modelObj.id.trim() : ''
      })
      .filter(Boolean)
  }

  return []
}

/**
 * Extract version info from a local provider's response if available.
 */
function extractLocalVersion(provider: LocalProviderDef, parsed: unknown): string | undefined {
  const obj = objectValue(parsed)

  if (provider.id === 'ollama') {
    const v = obj.version
    return typeof v === 'string' ? v.trim() : undefined
  }

  // LM Studio doesn't typically include version in /v1/models
  return undefined
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
