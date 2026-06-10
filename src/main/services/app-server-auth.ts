export type AppServerClientAuth = {
  host?: string | null
  authorization?: string | null
  token?: string | null
}

export type AppServerAuthConfig = {
  token?: string | null
  requireToken?: boolean
  loopbackOnly?: boolean
}

export type AppServerAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; message: string }

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLoopbackClientHost(value: string | null | undefined): boolean {
  const host = value?.trim()
  if (!host) return true
  try {
    const parsed = new URL(host.includes('://') ? host : `http://${host}`)
    return LOOPBACK_HOSTS.has(parsed.hostname)
  } catch {
    return LOOPBACK_HOSTS.has(host)
  }
}

export function extractBearerToken(value: string | null | undefined): string {
  const header = value?.trim() ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() ?? ''
}

export function validateAppServerClientAuth(
  client: AppServerClientAuth,
  config: AppServerAuthConfig
): AppServerAuthResult {
  if (config.loopbackOnly !== false && !isLoopbackClientHost(client.host)) {
    return {
      ok: false,
      status: 403,
      message: 'App-server clients must connect through a loopback host.'
    }
  }

  const expectedToken = config.token?.trim() ?? ''
  const requiresToken = config.requireToken === true || expectedToken.length > 0
  if (!requiresToken) return { ok: true }

  const actualToken = client.token?.trim() || extractBearerToken(client.authorization)
  if (!actualToken || actualToken !== expectedToken) {
    return {
      ok: false,
      status: 401,
      message: 'A valid local app-server token is required.'
    }
  }
  return { ok: true }
}
