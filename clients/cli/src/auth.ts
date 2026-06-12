import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Auth: thin wrapper around token management — no business logic    */
/* ------------------------------------------------------------------ */

const AuthConfigSchema = z.object({
  token: z.string().trim().default(''),
  host: z.string().trim().default('127.0.0.1'),
  port: z.number().int().positive().default(18999),
  requireToken: z.boolean().default(false),
  loopbackOnly: z.boolean().default(true)
})
export type AuthConfig = z.infer<typeof AuthConfigSchema>

export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function resolveAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const token = env.OPENCODEX_TOKEN ?? env.KUN_RUNTIME_TOKEN ?? ''
  return AuthConfigSchema.parse({
    token,
    host: env.OPENCODEX_HOST ?? '127.0.0.1',
    port: Number(env.OPENCODEX_PORT ?? env.KUN_PORT ?? '18999'),
    requireToken: token.length > 0,
    loopbackOnly: true
  })
}

export function isLoopbackHost(host: string): boolean {
  try {
    const parsed = new URL(host.includes('://') ? host : `http://${host}`)
    return LOOPBACK_HOSTS.has(parsed.hostname)
  } catch {
    return LOOPBACK_HOSTS.has(host)
  }
}

export function baseUrlFromAuth(auth: AuthConfig): string {
  return `http://${auth.host}:${auth.port}`
}
