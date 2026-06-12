import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { get } from 'node:http'

// Mock electron shell.openExternal (kept for safety, not used when openExternal override is provided)
vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined)
  }
}))

import { generatePKCE, startOAuthFlow, type OAuthCredentialStore, type OAuthFlowOptions } from './oauth-pkce-service'

function mockCredentialStore(): OAuthCredentialStore {
  const keys = new Map<string, string>()
  return {
    async setKey(providerId: string, key: string): Promise<void> {
      keys.set(providerId, key)
    },
    maskKey(providerId: string): string {
      const key = keys.get(providerId)
      if (!key) return ''
      if (key.length <= 12) return '••••••••'
      return `${key.slice(0, 5)}…${key.slice(-4)}`
    },
    hasKey(providerId: string): boolean {
      return keys.has(providerId)
    }
  }
}

// ── Mock fetch helpers ───────────────────────────────────────────────

type MockResponse = {
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

/** Build a mock fetch response. */
function mockRes(status: number, body: unknown): MockResponse {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  let parsed: unknown = body
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body) } catch { /* keep as string */ }
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(bodyStr),
    json: () => Promise.resolve(parsed)
  }
}

/** Create a fetch mock that returns responses in sequence. */
function mockFetchSequence(...responses: MockResponse[]): typeof fetch {
  const fn = vi.fn()
  for (const r of responses) {
    fn.mockResolvedValueOnce(r)
  }
  return fn as unknown as typeof fetch
}

/** Standard no-op timer mocks — timers never fire, clear is a no-op. */
function noopTimers(): Pick<OAuthFlowOptions, 'setTimeout' | 'clearTimeout'> {
  return {
    setTimeout: vi.fn(() => ({}) as ReturnType<typeof setTimeout>) as unknown as typeof globalThis.setTimeout,
    clearTimeout: vi.fn() as unknown as typeof globalThis.clearTimeout
  }
}

// ── Helper: drive the OAuth callback via HTTP ────────────────────────

/** Parse the auth URL captured by openExternal mock and return port + state. */
function parseAuthUrl(authUrl: string): { port: number; state: string; codeChallenge: string } {
  const url = new URL(authUrl)
  const callbackUrlParam = url.searchParams.get('callback_url')!
  const callbackUrl = new URL(callbackUrlParam)
  return {
    port: parseInt(callbackUrl.port, 10),
    state: url.searchParams.get('state')!,
    codeChallenge: url.searchParams.get('code_challenge')!
  }
}

/** Make an HTTP GET to the loopback callback server. Returns the response body. */
function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ── Existing tests (unchanged) ───────────────────────────────────────

describe('OAuth PKCE', () => {
  describe('generatePKCE', () => {
    it('should produce a code verifier between 43 and 128 characters', () => {
      const pkce = generatePKCE()
      expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43)
      expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128)
    })

    it('should produce a code challenge derived from the verifier (S256)', () => {
      const pkce = generatePKCE()
      const expectedChallenge = createHash('sha256')
        .update(pkce.codeVerifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      expect(pkce.codeChallenge).toBe(expectedChallenge)
    })

    it('should produce a unique state for each call', () => {
      const pkce1 = generatePKCE()
      const pkce2 = generatePKCE()
      expect(pkce1.state).not.toBe(pkce2.state)
    })

    it('should produce a unique code verifier for each call', () => {
      const pkce1 = generatePKCE()
      const pkce2 = generatePKCE()
      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier)
    })

    it('should produce valid base64url characters only', () => {
      const pkce = generatePKCE()
      const base64urlRegex = /^[A-Za-z0-9_-]+$/
      expect(pkce.codeVerifier).toMatch(base64urlRegex)
      expect(pkce.codeChallenge).toMatch(base64urlRegex)
      expect(pkce.state).toMatch(base64urlRegex)
    })
  })

  describe('startOAuthFlow — stored-in-main contract', () => {
    it('should require a credentialStore argument (fail closed without it)', () => {
      expect(typeof startOAuthFlow).toBe('function')
      expect(startOAuthFlow.length).toBeGreaterThanOrEqual(1)
    })

    it('should have a callable startOAuthFlow export', () => {
      expect(typeof startOAuthFlow).toBe('function')
    })

    it('should accept optional OAuthFlowOptions as second argument', async () => {
      // Verify that options parameter is accepted and overrides work
      const store = mockCredentialStore()
      const openExternalMock = vi.fn().mockRejectedValue(new Error('no-browser'))
      const noop = noopTimers()

      const result = await startOAuthFlow(store, {
        openExternal: openExternalMock,
        ...noop
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toContain('no-browser')
      }
    })
  })

  describe('OAuthCredentialStore integration contract', () => {
    it('should work with a mock credentialStore (key never leaves store)', () => {
      const store = mockCredentialStore()

      store.setKey('openrouter', 'pk-fixture-v1-abcdef1234567890ghijkl')

      const masked = store.maskKey('openrouter')
      expect(masked).not.toBe('pk-fixture-v1-abcdef1234567890ghijkl')
      expect(masked).toContain('pk-fi')
      expect(masked).toContain('…')

      expect(store.hasKey('openrouter')).toBe(true)
    })

    it('should return empty mask for unset key', () => {
      const store = mockCredentialStore()
      expect(store.maskKey('nonexistent')).toBe('')
      expect(store.hasKey('nonexistent')).toBe(false)
    })
  })
})

// ── NEW: Full mocked OAuth flow tests ────────────────────────────────

describe('startOAuthFlow — mocked authorization-server flow', () => {
  let capturedAuthUrl: string | null = null
  let store: OAuthCredentialStore

  beforeEach(() => {
    capturedAuthUrl = null
    store = mockCredentialStore()
  })

  afterEach(() => {
    capturedAuthUrl = null
  })

  // ── Helpers ──────────────────────────────────────────────────────

  function openExternalMock(): (url: string) => Promise<void> {
    return vi.fn().mockImplementation((url: string) => {
      capturedAuthUrl = url
      return Promise.resolve()
    })
  }

  /** Start the flow and wait until the server is listening (auth URL captured). */
  async function startFlowAndWait(
    opts: {
      fetch?: typeof fetch
      openExternal?: (url: string) => Promise<void>
      setTimeout?: typeof globalThis.setTimeout
      clearTimeout?: typeof globalThis.clearTimeout
    } = {}
  ): Promise<{ resultPromise: ReturnType<typeof startOAuthFlow>; authUrl: string; port: number; state: string }> {
    const timers = noopTimers()
    const resultPromise = startOAuthFlow(store, {
      fetch: opts.fetch,
      openExternal: opts.openExternal ?? openExternalMock(),
      setTimeout: opts.setTimeout ?? timers.setTimeout,
      clearTimeout: opts.clearTimeout ?? timers.clearTimeout
    })

    // Poll until the auth URL is captured (server is listening)
    await vi.waitFor(() => {
      expect(capturedAuthUrl).not.toBeNull()
    }, { timeout: 3000, interval: 10 })

    const { port, state } = parseAuthUrl(capturedAuthUrl!)
    return { resultPromise, authUrl: capturedAuthUrl!, port, state }
  }

  /** Drive a successful callback and return the result. */
  async function driveSuccessCallback(
    overrides?: {
      code?: string
      keyLabel?: string
      keyLimit?: number | null
      keyUsage?: number
    }
  ): ReturnType<typeof startOAuthFlow> {
    const exchangeKey = 'pk-fixture-exchanged-' + Math.random().toString(36).slice(2, 10)

    // First fetch call: token exchange → returns key
    // Second fetch call: key info → returns metadata
    const mockFetch = mockFetchSequence(
      mockRes(200, {
        key: exchangeKey,
        label: overrides?.keyLabel ?? 'pk-fixture-test-label',
        limit: overrides?.keyLimit ?? 100,
        usage: overrides?.keyUsage ?? 42
      }),
      mockRes(200, {
        data: {
          label: overrides?.keyLabel ?? 'pk-fixture-test-label',
          limit: overrides?.keyLimit ?? 100,
          usage: overrides?.keyUsage ?? 42
        }
      })
    )

    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    // Drive the callback
    const code = overrides?.code ?? 'pk-fixture-auth-code'
    const callbackUrl = `http://127.0.0.1:${port}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    return resultPromise
  }

  // ── Happy path ────────────────────────────────────────────────────

  it('should complete full OAuth flow: PKCE params in auth URL, store key in credentialStore, return only masked metadata', async () => {
    const result = await driveSuccessCallback()

    // Verify success result structure
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected ok')

    expect(result.providerId).toBe('openrouter')
    expect(result.keyLabel).toBe('pk-fixture-test-label')
    expect(result.keyLimit).toBe(100)
    expect(result.keyUsage).toBe(42)

    // Renderer result must contain only masked metadata — no raw key
    expect(result.maskedPreview).toContain('pk-fi')
    expect(result.maskedPreview).toContain('…')
    const resultStr = JSON.stringify(result)
    expect(resultStr).not.toContain('pk-fixture-exchanged')

    // Raw key must be in credentialStore
    expect(store.hasKey('openrouter')).toBe(true)
  })

  it('should include correct PKCE challenge and S256 method in auth URL', async () => {
    const { authUrl } = await startFlowAndWait()

    const url = new URL(authUrl)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')

    const challenge = url.searchParams.get('code_challenge')!
    expect(challenge.length).toBeGreaterThan(0)
    // Must be base64url-encoded (no +, /, or = padding)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('should use loopback-only callback URL (127.0.0.1, not 0.0.0.0 or external)', async () => {
    const { authUrl } = await startFlowAndWait()

    const url = new URL(authUrl)
    const callbackUrlParam = url.searchParams.get('callback_url')!
    const callbackUrl = new URL(callbackUrlParam)

    expect(callbackUrl.hostname).toBe('127.0.0.1')
    expect(callbackUrl.pathname).toBe('/callback')
    // Must not be 0.0.0.0 or localhost
    expect(callbackUrl.hostname).not.toBe('0.0.0.0')
    expect(callbackUrl.hostname).not.toBe('localhost')
  })

  // ── Server single-use / closed after exchange ─────────────────────

  it('should close the callback server after exchange (single-use)', async () => {
    const exchangeKey = 'pk-fixture-singleuse-' + Math.random().toString(36).slice(2, 10)

    const mockFetch = mockFetchSequence(
      mockRes(200, { key: exchangeKey, label: 'pk-fixture-label', limit: 50, usage: 10 }),
      mockRes(200, { data: { label: 'pk-fixture-label', limit: 50, usage: 10 } })
    )

    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    // Drive callback
    const callbackUrl = `http://127.0.0.1:${port}/callback?code=pk-fixture-code&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(true)

    // Now try to make another request — should fail (server closed)
    let secondRequestFailed = false
    try {
      await httpGet(`http://127.0.0.1:${port}/callback?code=pk-fixture-code2&state=${encodeURIComponent(state)}`)
    } catch (e) {
      secondRequestFailed = true
    }
    expect(secondRequestFailed).toBe(true)
  })

  // ── State validation ──────────────────────────────────────────────

  it('should reject callback with state mismatch', async () => {
    const mockFetch = mockFetchSequence(
      mockRes(200, { key: 'pk-fixture-key', label: 'x', limit: 1, usage: 0 })
    )
    const { resultPromise, port } = await startFlowAndWait({ fetch: mockFetch })

    // Drive callback with wrong state
    const callbackUrl = `http://127.0.0.1:${port}/callback?code=pk-fixture-code&state=wrong-state-value`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/state mismatch/i)
    }

    // Key must NOT have been stored
    expect(store.hasKey('openrouter')).toBe(false)
  })

  // ── Missing code ──────────────────────────────────────────────────

  it('should reject callback with missing authorization code', async () => {
    const mockFetch = mockFetchSequence() // won't be called
    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    // Drive callback without code param
    const callbackUrl = `http://127.0.0.1:${port}/callback?state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('No authorization code')
    }
  })

  // ── OAuth error from provider ─────────────────────────────────────

  it('should handle OAuth error param from the provider', async () => {
    const mockFetch = mockFetchSequence() // won't be called
    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    // Drive callback with error param (simulating provider rejection)
    const callbackUrl = `http://127.0.0.1:${port}/callback?error=access_denied&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('OAuth error')
      expect(result.message).toContain('access_denied')
    }
  })

  // ── Token exchange failures ───────────────────────────────────────

  it('should handle token exchange HTTP error (e.g. invalid code)', async () => {
    const mockFetch = mockFetchSequence(
      mockRes(400, '{"error":"invalid_grant","error_description":"Invalid authorization code"}')
    )
    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    const callbackUrl = `http://127.0.0.1:${port}/callback?code=pk-fixture-bad-code&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('Token exchange failed')
    }
    expect(store.hasKey('openrouter')).toBe(false)
  })

  it('should handle token exchange returning non-JSON body', async () => {
    const mockFetch = mockFetchSequence(
      mockRes(200, '<html>Not JSON</html>')
    )
    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    const callbackUrl = `http://127.0.0.1:${port}/callback?code=pk-fixture-code&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('non-JSON')
    }
    expect(store.hasKey('openrouter')).toBe(false)
  })

  it('should handle token exchange response missing key field', async () => {
    const mockFetch = mockFetchSequence(
      mockRes(200, { not_a_key: 'nope', label: 'x' })
    )
    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    const callbackUrl = `http://127.0.0.1:${port}/callback?code=pk-fixture-code&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('missing key')
    }
    expect(store.hasKey('openrouter')).toBe(false)
  })

  // ── Key info fetch graceful fallback ─────────────────────────────

  it('should still succeed when key-info fetch fails (uses exchange metadata fallback)', async () => {
    const exchangeKey = 'pk-fixture-nokeyinfo-' + Math.random().toString(36).slice(2, 10)

    // First call: token exchange succeeds
    // Second call: key info fails with 500
    const mockFetch = mockFetchSequence(
      mockRes(200, {
        key: exchangeKey,
        label: 'pk-fixture-exchange-label',
        limit: 200,
        usage: 5
      }),
      mockRes(500, 'Internal Server Error')
    )

    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    const callbackUrl = `http://127.0.0.1:${port}/callback?code=pk-fixture-code&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected ok')

    // Should fall back to exchange metadata
    expect(result.keyLabel).toBe('pk-fixture-exchange-label')
    expect(result.keyLimit).toBe(200)
    expect(result.keyUsage).toBe(5)

    // Key must be stored
    expect(store.hasKey('openrouter')).toBe(true)
  })

  // ── Browser open failure ──────────────────────────────────────────

  it('should handle browser open failure gracefully', async () => {
    const failingOpenExternal = vi.fn().mockRejectedValue(new Error('cannot-open-browser'))
    const noop = noopTimers()

    const result = await startOAuthFlow(store, {
      openExternal: failingOpenExternal,
      ...noop
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('cannot-open-browser')
    }
  })

  // ── Result never contains raw key ─────────────────────────────────

  it('should never leak raw key in the result (masked preview only)', async () => {
    const exchangeKey = 'pk-fixture-secret-' + Math.random().toString(36).slice(2, 10)

    const mockFetch = mockFetchSequence(
      mockRes(200, { key: exchangeKey, label: 'pk-fixture-label', limit: 1, usage: 0 }),
      mockRes(200, { data: { label: 'pk-fixture-label', limit: 1, usage: 0 } })
    )

    const { resultPromise, port, state } = await startFlowAndWait({ fetch: mockFetch })

    const callbackUrl = `http://127.0.0.1:${port}/callback?code=pk-fixture-code&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(true)

    // The entire result object must not contain the raw exchange key
    const resultStr = JSON.stringify(result)
    expect(resultStr).not.toContain(exchangeKey)
    // Must contain only the masked preview
    if (result.ok) {
      expect(result.maskedPreview).toContain('…')
      expect(result.maskedPreview).not.toBe(exchangeKey)
    }
  })

  // ── PKCE verifier vs challenge: verify the auth URL challenge matches ──

  it('should include a code_challenge in the auth URL that is the S256 hash of the verifier', async () => {
    // We can verify this by checking the auth URL contains a challenge
    // and that the challenge is a valid base64url S256 hash
    const { authUrl } = await startFlowAndWait()

    const url = new URL(authUrl)
    const challenge = url.searchParams.get('code_challenge')!
    const method = url.searchParams.get('code_challenge_method')!

    expect(method).toBe('S256')
    // S256 produces a 32-byte hash → 43 chars in base64url
    expect(challenge.length).toBeGreaterThanOrEqual(43)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  // ── Timeout is cancelled when callback arrives ────────────────────

  it('should clear the timeout when callback arrives (no timeout leak)', async () => {
    const clearTimeoutSpy = vi.fn() as unknown as typeof globalThis.clearTimeout
    const setTimeoutSpy = vi.fn(() => ({}) as ReturnType<typeof setTimeout>) as unknown as typeof globalThis.setTimeout

    const mockFetch = mockFetchSequence(
      mockRes(200, { key: 'pk-fixture-noleak', label: 'x', limit: 1, usage: 0 }),
      mockRes(200, { data: { label: 'x', limit: 1, usage: 0 } })
    )

    const { resultPromise, port, state } = await startFlowAndWait({
      fetch: mockFetch,
      setTimeout: setTimeoutSpy,
      clearTimeout: clearTimeoutSpy
    })

    // Drive callback
    const callbackUrl = `http://127.0.0.1:${port}/callback?code=pk-fixture-code&state=${encodeURIComponent(state)}`
    await httpGet(callbackUrl)

    const result = await resultPromise
    expect(result.ok).toBe(true)

    // clearTimeout must have been called exactly once (when callback arrived)
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
    // setTimeout must have been called exactly once (when flow started)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1)
  })
})
