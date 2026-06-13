import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { shell } from 'electron'

const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth'
const OPENROUTER_TOKEN_URL = 'https://openrouter.ai/api/v1/auth/keys'
const OPENROUTER_KEY_INFO_URL = 'https://openrouter.ai/api/v1/auth/key'
const OAUTH_CALLBACK_TIMEOUT_MS = 120_000
const MAX_CODE_VERIFIER_LENGTH = 128
const CODE_VERIFIER_BYTE_LENGTH = 48
const OPENROUTER_PROVIDER_ID = 'openrouter'

export type PKCEParams = {
  codeVerifier: string
  codeChallenge: string
  state: string
}

export type OAuthStartResult = {
  authUrl: string
  port: number
  state: string
}

/**
 * The result returned to the renderer after a successful OAuth flow.
 * NEVER contains the raw API key — the key is stored in the credential store
 * inside main process before this result is returned.
 */
export type OAuthTokenResult = {
  ok: true
  providerId: string
  maskedPreview: string
  keyLabel: string
  keyLimit: number | null
  keyUsage: number
} | {
  ok: false
  message: string
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sha256(input: string): Buffer {
  return createHash('sha256').update(input).digest()
}

export function generatePKCE(): PKCEParams {
  const codeVerifier = base64UrlEncode(randomBytes(CODE_VERIFIER_BYTE_LENGTH)).slice(0, MAX_CODE_VERIFIER_LENGTH)
  const codeChallenge = base64UrlEncode(sha256(codeVerifier))
  const state = base64UrlEncode(randomBytes(16))
  return { codeVerifier, codeChallenge, state }
}

function buildAuthUrl(challenge: string, state: string, port: number): string {
  const params = new URLSearchParams({
    callback_url: `http://127.0.0.1:${port}/callback`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  })
  return `${OPENROUTER_AUTH_URL}?${params.toString()}`
}

type ExchangeResult = {
  ok: true
  key: string
  keyLabel: string
  keyLimit: number | null
  keyUsage: number
} | {
  ok: false
  message: string
}

async function exchangeCodeForKey(
  code: string,
  codeVerifier: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  signal?: AbortSignal
): Promise<ExchangeResult> {
  const body = JSON.stringify({
    code,
    code_verifier: codeVerifier,
    code_challenge_method: 'S256'
  })

  const res = await fetchFn(OPENROUTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body,
    signal
  })

  const text = await res.text()
  if (!res.ok) {
    return { ok: false, message: `Token exchange failed (${res.status}): ${text.slice(0, 400)}` }
  }

  let parsed: { key?: string; name?: string; label?: string; limit?: number | null; usage?: number }
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: 'Token exchange returned non-JSON body.' }
  }

  if (!parsed.key) {
    return { ok: false, message: 'Token exchange response missing key.' }
  }

  return {
    ok: true,
    key: parsed.key,
    keyLabel: parsed.label || parsed.name || 'OpenRouter Key',
    keyLimit: typeof parsed.limit === 'number' ? parsed.limit : null,
    keyUsage: parsed.usage ?? 0
  }
}

async function fetchKeyInfo(
  key: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
  signal?: AbortSignal
): Promise<{ label: string; limit: number | null; usage: number } | null> {
  try {
    const res = await fetchFn(OPENROUTER_KEY_INFO_URL, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      },
      signal
    })
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>
    const inner = (data.data ?? data) as Record<string, unknown>
    return {
      label: typeof inner.label === 'string' ? inner.label : typeof inner.name === 'string' ? inner.name : 'OpenRouter Key',
      limit: typeof inner.limit === 'number' ? inner.limit as number | null : null,
      usage: (typeof inner.usage === 'number' ? inner.usage : 0) as number
    }
  } catch {
    return null
  }
}

export interface OAuthCredentialStore {
  setKey(providerId: string, key: string): Promise<void>
  maskKey(providerId: string): string
  hasKey(providerId: string): boolean
}

export interface OAuthFlowOptions {
  /** HTTP fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch
  /** Open a URL in the system browser. Defaults to electron shell.openExternal. */
  openExternal?: (url: string) => Promise<void>
  /** Timer for OAuth flow timeout. Defaults to globalThis.setTimeout. */
  setTimeout?: typeof globalThis.setTimeout
  /** Cancel timer. Defaults to globalThis.clearTimeout. */
  clearTimeout?: typeof globalThis.clearTimeout
}

/**
 * Start the OpenRouter OAuth PKCE flow.
 *
 * 1. Generate PKCE params
 * 2. Start a loopback-only HTTP server on a random ephemeral port
 * 3. Open the system browser to the auth URL
 * 4. Wait for the callback with the authorization code
 * 5. Exchange code for API key
 * 6. Store the key in credentialStore (never returned to renderer)
 * 7. Close the server
 *
 * The server is single-use and only listens on 127.0.0.1.
 * The renderer receives only masked metadata — the raw key stays in main.
 */
export function startOAuthFlow(
  credentialStore: OAuthCredentialStore,
  options?: OAuthFlowOptions
): Promise<OAuthTokenResult> {
  const fetchFn = options?.fetch ?? globalThis.fetch
  const openExternalFn = options?.openExternal ?? shell.openExternal
  const _setTimeout = options?.setTimeout ?? globalThis.setTimeout
  const _clearTimeout = options?.clearTimeout ?? globalThis.clearTimeout

  return new Promise((resolve) => {
    const pkce = generatePKCE()
    let server: Server | null = null
    let settled = false

    const finish = (result: OAuthTokenResult): void => {
      if (settled) return
      settled = true
      if (server) {
        server.close()
        server = null
      }
      resolve(result)
    }

    const timeout = _setTimeout(() => {
      finish({ ok: false, message: 'OAuth flow timed out. Please try again.' })
    }, OAUTH_CALLBACK_TIMEOUT_MS)

    server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        })
        res.end()
        return
      }

      const addr = server!.address() as { port: number } | null
      if (!addr) return
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${addr.port}`)

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end(`<html><body><h1>Authentication Failed</h1><p>${escapeHtml(error)}</p><p>You can close this window.</p></body></html>`)
          finish({ ok: false, message: `OAuth error: ${error}` })
          return
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<html><body><h1>Missing Code</h1><p>No authorization code received. You can close this window.</p></body></html>')
          finish({ ok: false, message: 'No authorization code received.' })
          return
        }

        if (state !== pkce.state) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<html><body><h1>Invalid State</h1><p>State mismatch. You can close this window.</p></body></html>')
          finish({ ok: false, message: 'OAuth state mismatch. Possible CSRF attack.' })
          return
        }

        // Exchange code for key
        _clearTimeout(timeout)
        try {
          const exchangeResult = await exchangeCodeForKey(code, pkce.codeVerifier, fetchFn)
          if (!exchangeResult.ok) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end(`<html><body><h1>Error</h1><p>${escapeHtml(exchangeResult.message)}</p><p>You can close this window.</p></body></html>`)
            finish({ ok: false, message: exchangeResult.message })
            return
          }

          // Store the key in the credential store FIRST (never return to renderer)
          const rawKey = exchangeResult.key
          await credentialStore.setKey(OPENROUTER_PROVIDER_ID, rawKey)

          // Fetch richer key info (label, limit, usage)
          const info = await fetchKeyInfo(rawKey, fetchFn)
          const keyLabel = info?.label || exchangeResult.keyLabel
          const keyLimit = info?.limit ?? exchangeResult.keyLimit
          const keyUsage = info?.usage ?? exchangeResult.keyUsage

          const maskedPreview = credentialStore.maskKey(OPENROUTER_PROVIDER_ID)

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`<html><body><h1>Signed In</h1><p>You have successfully signed in with OpenRouter. You can close this window.</p></body></html>`)

          finish({
            ok: true,
            providerId: OPENROUTER_PROVIDER_ID,
            maskedPreview,
            keyLabel,
            keyLimit,
            keyUsage
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          res.writeHead(500, { 'Content-Type': 'text/html' })
          res.end(`<html><body><h1>Error</h1><p>${escapeHtml(msg)}</p><p>You can close this window.</p></body></html>`)
          finish({ ok: false, message: msg })
        }
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address() as { port: number }
      const authUrl = buildAuthUrl(pkce.codeChallenge, pkce.state, addr.port)

      // Open system browser
      void openExternalFn(authUrl).catch((e) => {
        finish({ ok: false, message: `Failed to open browser: ${e instanceof Error ? e.message : String(e)}` })
      })
    })

    server.on('error', (err) => {
      _clearTimeout(timeout)
      finish({ ok: false, message: `Failed to start OAuth callback server: ${err.message}` })
    })
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
