import { describe, it, expect, vi } from 'vitest'
import { detectLocalProvider, scanLocalProviders } from './ollama-lmstudio-detect'
import { LOCAL_PROVIDERS } from '../../shared/provider-profiles'

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  })
}

function mockFetchWithHeaders(status: number, body: unknown, headers?: Record<string, string>): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers ?? {})),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  })
}

describe('detectLocalProvider', () => {
  const ollama = LOCAL_PROVIDERS.find((p) => p.id === 'ollama')!

  it('detects Ollama with models on success', async () => {
    const fetchImpl = mockFetch(200, {
      models: [
        { name: 'llama3:8b', size: 4661224576 },
        { name: 'codellama:7b', size: 3822285824 }
      ],
      version: '0.1.26'
    })

    const result = await detectLocalProvider(ollama, fetchImpl)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.models).toEqual(['llama3:8b', 'codellama:7b'])
      expect(result.version).toBe('0.1.26')
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
      expect(result.provider.id).toBe('ollama')
    }
  })

  it('returns ok:false when Ollama is not running (ECONNREFUSED)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' })
    )

    const result = await detectLocalProvider(ollama, fetchImpl)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('not running')
      expect(result.providerId).toBe('ollama')
    }
  })

  it('returns ok:false on timeout', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError')
    )

    const result = await detectLocalProvider(ollama, fetchImpl)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('did not respond in time')
    }
  })

  it('returns ok:false on non-JSON response', async () => {
    const fetchImpl = mockFetch(200, '<html><body>Not JSON</body></html>')

    const result = await detectLocalProvider(ollama, fetchImpl)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('non-JSON')
    }
  })

  it('returns ok:false on HTTP error status', async () => {
    const fetchImpl = mockFetch(500, 'Internal Server Error')

    const result = await detectLocalProvider(ollama, fetchImpl)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('500')
    }
  })

  it('handles empty models array gracefully', async () => {
    const fetchImpl = mockFetch(200, { models: [], version: '0.2.0' })

    const result = await detectLocalProvider(ollama, fetchImpl)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.models).toEqual([])
    }
  })

  it('filters out models with empty names', async () => {
    const fetchImpl = mockFetch(200, {
      models: [{ name: '' }, { name: 'llama3:8b' }, { name: '  ' }]
    })

    const result = await detectLocalProvider(ollama, fetchImpl)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.models).toEqual(['llama3:8b'])
    }
  })
})

describe('scanLocalProviders', () => {
  it('scans all local providers concurrently', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('11434')) {
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ models: [{ name: 'llama3:8b' }] }))
        }
      }
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    })

    const results = await scanLocalProviders(undefined, fetchImpl as typeof fetch)

    expect(results).toHaveLength(LOCAL_PROVIDERS.length)
    const ollama = results.find((r) => r.ok === true)
    expect(ollama?.ok).toBe(true)
    if (ollama?.ok) {
      expect(ollama.models).toEqual(['llama3:8b'])
    }
    const lmStudio = results.find((r) => !r.ok)
    expect(lmStudio?.ok).toBe(false)
  })

  it('reports progress via callback', async () => {
    const onProgress = vi.fn()
    const fetchImpl = mockFetch(200, { models: [] })

    await scanLocalProviders(onProgress, fetchImpl as typeof fetch)

    expect(onProgress).toHaveBeenCalledTimes(LOCAL_PROVIDERS.length)
    for (const call of onProgress.mock.calls) {
      expect(call[0]).toHaveProperty('ok')
    }
  })

  it('detects LM Studio with OpenAI-compatible response', async () => {
    const lmStudio = LOCAL_PROVIDERS.find((p) => p.id === 'lm-studio')!
    const fetchImpl = mockFetch(200, {
      data: [{ id: 'local-model' }, { id: 'qwen2.5-coder-7b' }]
    })

    const result = await detectLocalProvider(lmStudio, fetchImpl)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.models).toEqual(['local-model', 'qwen2.5-coder-7b'])
    }
  })
})
