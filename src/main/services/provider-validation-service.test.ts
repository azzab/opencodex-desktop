import { describe, it, expect, vi } from 'vitest'
import { validateProviderKey, discoverModels } from './provider-validation-service'
import { OPENROUTER_PROVIDER_ID } from '../../shared/app-settings-types'
import type { ModelProviderProfileV1 } from '../../shared/app-settings-types'

type MockResponse = {
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

function mockFetchFn(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body)
  }) as unknown as typeof fetch
}

/** Create a fetch mock that returns a specific response for the Nth call (1-indexed). */
function mockFetchSequence(...responses: MockResponse[]): typeof fetch {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce(r)
  }
  return fn as unknown as typeof fetch
}

/** Build a raw mock response object. */
function mockRes(status: number, body: string): MockResponse {
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { parsed = body }
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(parsed)
  }
}

describe('Provider Validation Service', () => {
  describe('validateProviderKey — OpenRouter', () => {
    it('should validate a valid OpenRouter key', async () => {
      const fetchMock = mockFetchFn(200, {
        data: { label: 'My Key', limit: 10, usage: 5 }
      })
      const result = await validateProviderKey(
        OPENROUTER_PROVIDER_ID,
        'pk-fixture-valid-key',
        'https://openrouter.ai/api/v1',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.providerId).toBe(OPENROUTER_PROVIDER_ID)
        expect(result.keyLabel).toBe('My Key')
        expect(result.keyLimit).toBe(10)
        expect(result.keyUsage).toBe(5)
      }
    })

    it('should reject an invalid OpenRouter key (401)', async () => {
      const fetchMock = mockFetchFn(401, { error: 'Unauthorized' })
      const result = await validateProviderKey(
        OPENROUTER_PROVIDER_ID,
        'pk-fixture-invalid-key',
        'https://openrouter.ai/api/v1',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toContain('Invalid API key')
      }
    })

    it('should reject an invalid OpenRouter key (403)', async () => {
      const fetchMock = mockFetchFn(403, { error: 'Forbidden' })
      const result = await validateProviderKey(
        OPENROUTER_PROVIDER_ID,
        'pk-fixture-invalid-key',
        'https://openrouter.ai/api/v1',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toContain('Invalid API key')
      }
    })

    it('should reject empty key', async () => {
      const result = await validateProviderKey(
        OPENROUTER_PROVIDER_ID,
        '',
        'https://openrouter.ai/api/v1'
      )
      expect(result.ok).toBe(false)
    })

    it('should detect OpenRouter from base URL', async () => {
      const fetchMock = mockFetchFn(200, { data: { label: 'Test' } })
      const result = await validateProviderKey(
        'custom',
        'pk-fixture-or-key',
        'https://openrouter.ai/api/v1',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.providerId).toBe(OPENROUTER_PROVIDER_ID)
      }
    })
  })

  describe('validateProviderKey — OpenAI-compatible', () => {
    it('should validate a key via /v1/models', async () => {
      const fetchMock = mockFetchFn(200, {
        data: [{ id: 'model-a' }, { id: 'model-b' }]
      })
      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(true)
    })

    it('should reject an invalid key (401)', async () => {
      const fetchMock = mockFetchFn(401, { error: 'Unauthorized' })
      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-invalid',
        'https://api.example.com/v1',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(false)
    })

    it('should fall back to chat completion when /v1/models returns 404', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"Not Found"}}'))
        .mockResolvedValueOnce(mockRes(200, '{}')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(true)
    })

    it('should handle connection errors gracefully', async () => {
      const fetchMock = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')) as unknown as typeof fetch
      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(false)
    })

    it('should handle timeout errors gracefully', async () => {
      const abortError = new Error('The operation was aborted')
      abortError.name = 'AbortError'
      const fetchMock = vi.fn().mockRejectedValueOnce(abortError) as unknown as typeof fetch
      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(false)
    })
  })

  describe('validateProviderKey — DeepSeek', () => {
    it('should validate a DeepSeek key', async () => {
      const fetchMock = mockFetchFn(200, {
        data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }]
      })
      const result = await validateProviderKey(
        'deepseek',
        'pk-fixture-ds-key',
        'https://api.deepseek.com',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(true)
    })

    it('should reject an invalid DeepSeek key', async () => {
      const fetchMock = mockFetchFn(401, { error: 'Invalid API key' })
      const result = await validateProviderKey(
        'deepseek',
        'pk-fixture-invalid',
        'https://api.deepseek.com',
        undefined,
        fetchMock
      )
      expect(result.ok).toBe(false)
    })
  })

  // ── Issue 1: Fail-closed validation ──────────────────────────────────

  describe('fail-closed validation (Issue 1)', () => {
    it('should reject 404 from wrong endpoint (non-JSON body)', async () => {
      // /v1/models returns 404 HTML → fail immediately at stage 1
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '<html>Not Found</html>')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://wrong-endpoint.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/html|not an openai/i)
      }
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should reject 500 server error from chat completions fallback', async () => {
      // /v1/models returns 404, fallback chat completions returns 500
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockResolvedValueOnce(mockRes(500, '{"error":{"message":"Internal server error"}}')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/server error|unreachable|misconfigured/i)
      }
    })

    it('should reject non-JSON HTML response from fallback', async () => {
      // /v1/models returns JSON (real API without models), but fallback endpoint returns HTML
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockResolvedValueOnce(mockRes(200, '<!DOCTYPE html><html><body>Welcome</body></html>')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://not-an-api.example.com',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/html|not an openai/i)
      }
    })

    it('should accept valid fallback (2xx chat completion)', async () => {
      // /v1/models fails, chat completions returns 200
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockResolvedValueOnce(mockRes(200, '{"choices":[]}')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(true)
    })

    it('should accept model-not-found as proof of auth (OpenAI-compatible error shape)', async () => {
      // /v1/models fails, chat completions returns 404 with structured error
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockResolvedValueOnce(mockRes(404, JSON.stringify({
          error: {
            message: 'The model `gpt-3.5-turbo` does not exist or you do not have access to it.',
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        }))) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(true)
    })

    it('should reject 4xx with JSON but no error.message/type field', async () => {
      // /v1/models fails, chat completions returns 400 with unexpected JSON
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockResolvedValueOnce(mockRes(400, '{"foo":"bar"}')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
    })

    it('should reject 500 when /v1/models itself returns 500', async () => {
      // 5xx from /v1/models must fail closed immediately — no fallback
      const fetchMock = mockFetchFn(500, '{"error":{"message":"Internal error"}}')

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/server error|unreachable|misconfigured/i)
      }
    })
  })

  // ── Additional fail-closed gates (orchestrator-requested) ──────────

  describe('/v1/models fail-closed gates', () => {
    it('should fail immediately when /v1/models returns 404 HTML (wrong endpoint)', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '<html><body>Not Found</body></html>')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://wrong-endpoint.example.com',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/html|not an openai/i)
      }
      // Must not have attempted a fallback call
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should fail immediately when /v1/models returns 404 non-JSON plaintext', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, 'Not Found')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://wrong-endpoint.example.com',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/unexpected|not an openai/i)
      }
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should fail immediately when /v1/models returns 500', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(500, 'Internal Server Error')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/server error|unreachable|misconfigured/i)
      }
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should fail immediately when /v1/models returns 200 HTML', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(200, '<!DOCTYPE html><html><body>Welcome</body></html>')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://not-an-api.example.com',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/html|not an openai/i)
      }
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should fail immediately when /v1/models returns 200 non-JSON', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(200, 'plain text, not json')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/non-json|not an openai/i)
      }
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should still fall back when /v1/models returns JSON 404 (real API without models endpoint)', async () => {
      // Real APIs return JSON errors when /v1/models is unsupported.
      // This is a valid fallback path.
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"Not Found"}}'))
        .mockResolvedValueOnce(mockRes(200, '{"choices":[]}')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('should still fall back when /v1/models returns JSON 2xx without data array', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(200, '{"object":"list"}'))
        .mockResolvedValueOnce(mockRes(200, '{"choices":[]}')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  // ── Issue 2: endpointFormat honored ──────────────────────────────────

  describe('endpointFormat routing (Issue 2)', () => {
    it('should route chat_completions to /v1/chat/completions', async () => {
      let capturedUrl = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}')) // models fails (real API)
        .mockImplementationOnce((url: string) => {
          capturedUrl = url
          return Promise.resolve(mockRes(200, '{"choices":[]}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'chat_completions',
        fetchMock
      )
      expect(capturedUrl).toContain('/chat/completions')
    })

    it('should route responses to /v1/responses', async () => {
      let capturedUrl = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}')) // models fails (real API)
        .mockImplementationOnce((url: string) => {
          capturedUrl = url
          return Promise.resolve(mockRes(200, '{}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'responses',
        fetchMock
      )
      expect(capturedUrl).toContain('/responses')
      // Should NOT contain chat/completions
      expect(capturedUrl).not.toContain('/chat/completions')
    })

    it('should route messages to /v1/messages', async () => {
      let capturedUrl = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}')) // models fails (real API)
        .mockImplementationOnce((url: string) => {
          capturedUrl = url
          return Promise.resolve(mockRes(200, '{}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'messages',
        fetchMock
      )
      expect(capturedUrl).toContain('/messages')
      expect(capturedUrl).not.toContain('/chat/completions')
    })

    it('should default to chat_completions when endpointFormat is undefined', async () => {
      let capturedUrl = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}')) // models fails (real API)
        .mockImplementationOnce((url: string) => {
          capturedUrl = url
          return Promise.resolve(mockRes(200, '{}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        undefined,
        fetchMock
      )
      expect(capturedUrl).toContain('/chat/completions')
    })

    it('should send appropriate body for chat_completions', async () => {
      let capturedBody = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockImplementationOnce((_url: string, init?: { body?: string }) => {
          capturedBody = init?.body ?? ''
          return Promise.resolve(mockRes(200, '{"choices":[]}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'chat_completions',
        fetchMock
      )
      const parsed = JSON.parse(capturedBody)
      expect(parsed.model).toBe('gpt-3.5-turbo')
      expect(parsed.messages).toBeDefined()
      expect(parsed.max_tokens).toBe(1)
    })

    it('should send appropriate body for responses', async () => {
      let capturedBody = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockImplementationOnce((_url: string, init?: { body?: string }) => {
          capturedBody = init?.body ?? ''
          return Promise.resolve(mockRes(200, '{}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'responses',
        fetchMock
      )
      const parsed = JSON.parse(capturedBody)
      expect(parsed.model).toBe('gpt-4o-mini')
      expect(parsed.input).toBe('hi')
      expect(parsed.max_output_tokens).toBe(1)
    })

    it('should send appropriate body for messages', async () => {
      let capturedBody = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockImplementationOnce((_url: string, init?: { body?: string }) => {
          capturedBody = init?.body ?? ''
          return Promise.resolve(mockRes(200, '{}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'messages',
        fetchMock
      )
      const parsed = JSON.parse(capturedBody)
      expect(parsed.model).toBe('claude-3-haiku-20240307')
      expect(parsed.messages).toBeDefined()
      expect(parsed.max_tokens).toBe(1)
    })

    it('should still use /v1/models for models endpoint regardless of format', async () => {
      let capturedModelsUrl = ''
      const fetchMock = vi.fn()
        .mockImplementationOnce((url: string) => {
          capturedModelsUrl = url
          return Promise.resolve(mockRes(200, JSON.stringify({ data: [{ id: 'test-model' }] })))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'responses',
        fetchMock
      )
      expect(capturedModelsUrl).toContain('/models')
      expect(capturedModelsUrl).not.toContain('/responses')
    })

    it('should validate a key via responses format fallback', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}')) // models fails (real API)
        .mockResolvedValueOnce(mockRes(200, '{}')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'responses',
        fetchMock
      )
      expect(result.ok).toBe(true)
    })

    it('should validate a key via messages format fallback', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}')) // models fails (real API)
        .mockResolvedValueOnce(mockRes(200, '{}')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com/v1',
        'messages',
        fetchMock
      )
      expect(result.ok).toBe(true)
    })

    it('should normalize "chat" alias to chat_completions', async () => {
      let capturedUrl = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockImplementationOnce((url: string) => {
          capturedUrl = url
          return Promise.resolve(mockRes(200, '{}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'chat' as unknown as Parameters<typeof validateProviderKey>[3],
        fetchMock
      )
      expect(capturedUrl).toContain('/chat/completions')
    })

    it('should normalize "response" alias to responses', async () => {
      let capturedUrl = ''
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockImplementationOnce((url: string) => {
          capturedUrl = url
          return Promise.resolve(mockRes(200, '{}'))
        }) as unknown as typeof fetch

      await validateProviderKey(
        'custom-provider',
        'pk-fixture-test-key',
        'https://api.example.com',
        'response' as unknown as Parameters<typeof validateProviderKey>[3],
        fetchMock
      )
      expect(capturedUrl).toContain('/responses')
    })
  })

  describe('discoverModels', () => {
    it('should discover models via catalog machinery', async () => {
      const fetchMock = mockFetchFn(200, {
        data: [
          { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000, architecture: { tokenizer: 'o200k_base', input_modalities: ['text'], output_modalities: ['text'] }, pricing: { prompt: '2.50', completion: '10.00' }, supported_parameters: ['tools'] }
        ]
      })
      const provider: ModelProviderProfileV1 = {
        id: OPENROUTER_PROVIDER_ID,
        name: 'OpenRouter',
        apiKey: 'pk-fixture-or-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        endpointFormat: 'chat_completions',
        models: [],
        catalogModels: []
      }
      const result = await discoverModels(provider, fetchMock)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.catalogModels.length).toBe(1)
        expect(result.catalogModels[0].id).toBe('openai/gpt-4o')
      }
    })

    it('should discover models for custom provider', async () => {
      const fetchMock = mockFetchFn(200, {
        data: [
          { id: 'custom-model-1', name: 'Custom Model 1', created: 1234567890 },
          { id: 'custom-model-2', name: 'Custom Model 2', created: 1234567891 }
        ]
      })
      const provider: ModelProviderProfileV1 = {
        id: 'my-custom-provider',
        name: 'My Custom Provider',
        apiKey: 'pk-fixture-custom-key',
        baseUrl: 'https://llm.example.com/v1',
        endpointFormat: 'chat_completions',
        models: [],
        catalogModels: []
      }
      const result = await discoverModels(provider, fetchMock)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.catalogModels.length).toBe(2)
        expect(result.catalogModels[0].id).toBe('custom-model-1')
      }
    })

    it('should handle catalog fetch errors', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch
      const provider: ModelProviderProfileV1 = {
        id: OPENROUTER_PROVIDER_ID,
        name: 'OpenRouter',
        apiKey: 'pk-fixture-or-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        endpointFormat: 'chat_completions',
        models: [],
        catalogModels: []
      }
      const result = await discoverModels(provider, fetchMock)
      expect(result.ok).toBe(false)
    })
  })

  describe('validateProviderKey — custom provider add/edit flow', () => {
    it('should validate a custom provider with /v1/models endpoint', async () => {
      const fetchMock = mockFetchFn(200, {
        data: [{ id: 'llama-3' }, { id: 'mistral' }]
      })
      const result = await validateProviderKey(
        'my-custom-llm',
        'pk-fixture-custom-123',
        'https://llm.myservice.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(true)
    })

    it('should reject custom provider with invalid key (401)', async () => {
      const fetchMock = mockFetchFn(401, { error: 'Unauthorized' })
      const result = await validateProviderKey(
        'my-custom-llm',
        'pk-fixture-bad-key',
        'https://llm.myservice.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toContain('Invalid API key')
      }
    })

    it('should reject empty provider ID', async () => {
      const result = await validateProviderKey(
        '',
        'pk-fixture-test',
        'https://api.example.com/v1'
      )
      expect(result.ok).toBe(false)
    })

    it('should reject empty key for custom provider', async () => {
      const result = await validateProviderKey(
        'custom-prov',
        '',
        'https://api.example.com/v1'
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toContain('API key is required')
      }
    })

    it('should handle unreachable base URL gracefully', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('ENOTFOUND')) as unknown as typeof fetch
      const result = await validateProviderKey(
        'custom-prov',
        'pk-fixture-test',
        'https://nonexistent.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
    })

    it('should reject non-JSON HTML response from custom provider fallback', async () => {
      // /v1/models returns JSON 404 (real API without models), fallback returns HTML
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockRes(404, '{"error":{"message":"not found"}}'))
        .mockResolvedValueOnce(mockRes(200, '<!DOCTYPE html><html>Welcome</html>')) as unknown as typeof fetch

      const result = await validateProviderKey(
        'custom-prov',
        'pk-fixture-test',
        'https://api.example.com/v1',
        'chat_completions',
        fetchMock
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toMatch(/html|not an openai/i)
      }
    })
  })
})
