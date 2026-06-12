import type { ServerRuntime } from './server-runtime.js'
import { jsonResponse } from '../response.js'
import { ERRORS } from './runtime-error.js'

/**
 * GET /v1/threads/:id/evidence
 * List all evidence entries for a thread (newest first).
 * Query params:
 *  - kind: filter by kind (screenshot, console, network)
 *  - limit: max entries (default 50, max 200)
 */
export function listThreadEvidence(
  runtime: ServerRuntime,
  threadId: string,
  request: Request
): ReturnType<typeof jsonResponse> {
  if (!runtime.evidenceStore) {
    return ERRORS.unavailable('evidence store is not available')
  }

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const limitParam = url.searchParams.get('limit')
  const limit = Math.min(
    Math.max(1, limitParam ? parseInt(limitParam, 10) || 50 : 50),
    200
  )

  let entries = runtime.evidenceStore.forThread(threadId)

  if (kind && ['screenshot', 'console', 'network'].includes(kind)) {
    entries = entries.filter((e) => e.kind === kind)
  }

  entries = entries.slice(0, limit)

  return jsonResponse({
    threadId,
    count: entries.length,
    entries: entries.map((e) => ({
      id: e.id,
      threadId: e.threadId,
      runId: e.runId,
      kind: e.kind,
      timestamp: e.timestamp,
      storedAt: e.storedAt,
      ...(e.screenshotUrl ? { screenshotUrl: e.screenshotUrl } : {}),
      // Include screenshot base64 only for the list.
      // Full screenshot retrieval is via the single-entry endpoint.
      ...(e.screenshotBase64 ? { screenshotBase64: e.screenshotBase64 } : {}),
      consoleCount: e.consoleEntries?.length ?? 0,
      networkCount: e.networkEntries?.length ?? 0
    }))
  })
}

/**
 * GET /v1/threads/:id/evidence/:evidenceId
 * Get a single evidence entry with full data.
 */
export function getThreadEvidenceEntry(
  runtime: ServerRuntime,
  threadId: string,
  evidenceId: string
): ReturnType<typeof jsonResponse> {
  if (!runtime.evidenceStore) {
    return ERRORS.unavailable('evidence store is not available')
  }

  const entries = runtime.evidenceStore.forThread(threadId)
  const entry = entries.find((e) => e.id === evidenceId)

  if (!entry) {
    return ERRORS.notFound('evidence entry not found')
  }

  return jsonResponse(entry)
}
