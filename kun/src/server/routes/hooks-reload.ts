import type { ServerRuntime } from './server-runtime.js'
import { isAuthorized } from '../auth.js'
import { ERRORS } from './runtime-error.js'
import { jsonResponse, type JsonResponse } from '../response.js'
import type { KunHookSettingsV1 } from '../../contracts/hooks.js'

/**
 * Reload hook settings at runtime without restarting the Kun process.
 * Accepts a full KunHookSettingsV1 payload and applies it through
 * the hook gate's loadSettings().
 */
export async function reloadHookSettings(
  runtime: ServerRuntime,
  request: Request
): Promise<JsonResponse> {
  if (!runtime.hookGate) {
    return ERRORS.unavailable('Hook runtime is not available.')
  }
  if (!isAuthorized(request.headers, runtime.runtimeToken, runtime.insecure)) {
    return ERRORS.unauthorized()
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return ERRORS.validation('Request body must be JSON.')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ERRORS.validation('Request body must be a JSON object.')
  }
  const payload = body as Record<string, unknown>

  // Validate and apply
  try {
    const settings: KunHookSettingsV1 = {
      enabled: typeof payload.enabled === 'boolean' ? payload.enabled : false,
      trustedHooks: (payload.trustedHooks as KunHookSettingsV1['trustedHooks']) ?? {},
      defaultTimeoutMs: typeof payload.defaultTimeoutMs === 'number' && payload.defaultTimeoutMs > 0
        ? Math.floor(payload.defaultTimeoutMs)
        : 10_000,
      maxOutputBytes: typeof payload.maxOutputBytes === 'number' && payload.maxOutputBytes > 0
        ? Math.floor(payload.maxOutputBytes)
        : 64_000,
      maxAuditEvents: typeof payload.maxAuditEvents === 'number' && payload.maxAuditEvents > 0
        ? Math.floor(payload.maxAuditEvents)
        : 200,
      auditLog: Array.isArray(payload.auditLog)
        ? (payload.auditLog as KunHookSettingsV1['auditLog'])
        : []
    }
    runtime.hookGate.loadSettings(settings)
    return jsonResponse({ ok: true, message: 'Hook settings reloaded.' }, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ERRORS.validation(`Failed to apply hook settings: ${message}`)
  }
}
