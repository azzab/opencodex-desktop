import { Router } from '../router.js'
import { healthJsonResponse } from './health.js'
import { buildWorkspaceStatusResponse } from './workspace.js'
import {
  approveThreadPlan,
  createThread,
  clearThreadGoal,
  clearThreadTodos,
  deleteThread,
  forkThread,
  getThreadGoal,
  getThreadPlan,
  getThreadTodos,
  getThread,
  listThreads,
  setThreadGoal,
  setThreadTodos,
  updateThread
} from './threads.js'
import {
  compactTurn,
  getTurn,
  interruptTurn,
  startTurn,
  steerTurn
} from './turns.js'
import { startReview } from './review.js'
import { buildEventStreamResponse } from './events.js'
import { decideApproval } from './approvals.js'
import { resolveUserInput } from './user-inputs.js'
import { resumeSession } from './sessions.js'
import { usageJsonResponse } from './usage.js'
import { runtimeInfoJsonResponse, runtimeToolDiagnosticsJsonResponse } from './runtime-info.js'
import { listSkills } from './skills.js'
import {
  attachmentDiagnostics,
  getAttachmentContent,
  getAttachmentMetadata,
  uploadAttachment
} from './attachments.js'
import {
  createMemory,
  deleteMemory,
  listMemories,
  memoryDiagnostics,
  updateMemory
} from './memory.js'
import {
  createCheckpoint,
  deleteCheckpoint,
  forkFromCheckpoint,
  getCheckpoint,
  listCheckpoints,
  restoreCheckpoint
} from './checkpoints.js'
import { listThreadEvidence, getThreadEvidenceEntry } from './evidence.js'
import { isAuthorized, bearerToken } from '../auth.js'
import { ERRORS } from './runtime-error.js'
import { reloadHookSettings } from './hooks-reload.js'
import type { ServerRuntime } from './server-runtime.js'
import type { JsonResponse } from '../response.js'
import { jsonResponse } from '../response.js'
import {
  createLoop,
  listLoops,
  getLoop,
  updateLoop,
  pauseLoop,
  resumeLoop,
  cancelLoop,
  deleteLoop
} from './loop-scheduler.js'
import { evaluateGoal } from './goal-evaluator.js'
import {
  createApprovalRequest,
  type ApprovalRequest
} from '../../domain/approval.js'

/**
 * Build the full router used by the HTTP server. The router exposes:
 * - `GET /health` (unauthenticated)
 * - `GET /v1/runtime/info` (auth)
 * - `GET /v1/runtime/tools` (auth)
 * - `GET /v1/skills` (auth)
 * - `POST /v1/attachments` (auth)
 * - `GET /v1/attachments/diagnostics` (auth)
 * - `GET /v1/attachments/{id}` and `{id}/content` (auth)
 * - `GET/POST /v1/memory`, `PATCH/DELETE /v1/memory/{id}`, diagnostics (auth)
 * - `GET /v1/workspace/status` (auth)
 * - `GET/POST /v1/threads` (auth)
 * - `GET/PATCH/DELETE /v1/threads/{id}` (auth)
 * - `POST /v1/threads/{id}/fork` (auth)
 * - `GET/POST/DELETE /v1/threads/{id}/goal` (auth)
 * - `GET/POST/DELETE /v1/threads/{id}/todos` (auth)
 * - `POST /v1/threads/{id}/turns` (auth)
 * - `POST /v1/threads/{id}/review` (auth)
 * - `GET /v1/threads/{id}/turns/{turnId}` (auth)
 * - `POST /v1/threads/{id}/turns/{turnId}/steer` (auth)
 * - `POST /v1/threads/{id}/turns/{turnId}/interrupt` (auth)
 * - `POST /v1/threads/{id}/compact` (auth)
 * - `GET /v1/threads/{id}/events` (auth)
 * - `POST /v1/approvals/{id}` (auth)
 * - `POST /v1/user-inputs/{id}` and `/v1/user-input/{id}` (auth)
 * - `POST /v1/sessions/{id}/resume-thread` (auth)
 * - `GET /v1/usage` (auth)
 */
export function buildRouter(runtime: ServerRuntime): Router {
  const router = new Router()
  router.add('GET', '/health', () => healthJsonResponse())
  router.add('GET', '/v1/runtime/info', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return runtimeInfoJsonResponse(runtime)
  })
  router.add('GET', '/v1/runtime/tools', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return runtimeToolDiagnosticsJsonResponse(runtime)
  })
  router.add('POST', '/v1/runtime/hooks/reload', async (request) => {
    return reloadHookSettings(runtime, request)
  })
  router.add('GET', '/v1/skills', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listSkills(runtime)
  })
  router.add('POST', '/v1/attachments', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return uploadAttachment(runtime.attachmentStore, request)
  })
  router.add('GET', '/v1/attachments/diagnostics', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return attachmentDiagnostics(runtime.attachmentStore)
  })
  router.add('GET', '/v1/attachments/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getAttachmentMetadata(runtime.attachmentStore, ctx.params.id)
  })
  router.add('GET', '/v1/attachments/:id/content', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getAttachmentContent(runtime.attachmentStore, ctx.params.id, request)
  })
  router.add('GET', '/v1/memory', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listMemories(runtime.memoryStore, request)
  })
  router.add('POST', '/v1/memory', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return createMemory(runtime.memoryStore, request)
  })
  router.add('GET', '/v1/memory/diagnostics', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return memoryDiagnostics(runtime.memoryStore)
  })
  router.add('PATCH', '/v1/memory/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return updateMemory(runtime.memoryStore, ctx.params.id, request)
  })
  router.add('DELETE', '/v1/memory/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return deleteMemory(runtime.memoryStore, ctx.params.id)
  })
  router.add('GET', '/v1/workspace/status', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    const url = new URL(request.url)
    const path = url.searchParams.get('path')
    return buildWorkspaceStatusResponse({ inspector: runtime.workspaceInspector, path })
  })
  router.add('GET', '/v1/threads', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listThreads(runtime.threadService, request)
  })
  router.add('POST', '/v1/threads', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return createThread(runtime.threadService, request)
  })
  router.add('GET', '/v1/threads/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getThread(runtime.threadService, ctx.params.id, runtime.sessionStore)
  })
  router.add('PATCH', '/v1/threads/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return updateThread(runtime.threadService, ctx.params.id, request)
  })
  router.add('DELETE', '/v1/threads/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return deleteThread(runtime.threadService, ctx.params.id, runtime.hookGate)
  })
  router.add('POST', '/v1/threads/:id/fork', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return forkThread(runtime.threadService, ctx.params.id, request)
  })
  router.add('GET', '/v1/threads/:id/plan', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getThreadPlan(runtime.threadService, ctx.params.id)
  })
  router.add('POST', '/v1/threads/:id/plan/approve', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return approveThreadPlan(runtime.threadService, ctx.params.id)
  })
  router.add('GET', '/v1/threads/:id/goal', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getThreadGoal(runtime.threadService, ctx.params.id)
  })
  router.add('POST', '/v1/threads/:id/goal', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return setThreadGoal(runtime.threadService, ctx.params.id, request)
  })
  router.add('DELETE', '/v1/threads/:id/goal', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return clearThreadGoal(runtime.threadService, ctx.params.id)
  })
  router.add('GET', '/v1/threads/:id/todos', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getThreadTodos(runtime.threadService, ctx.params.id)
  })
  router.add('POST', '/v1/threads/:id/todos', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return setThreadTodos(runtime.threadService, ctx.params.id, request)
  })
  router.add('DELETE', '/v1/threads/:id/todos', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return clearThreadTodos(runtime.threadService, ctx.params.id)
  })
  router.add('POST', '/v1/threads/:id/turns', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return startTurn(runtime.turnService, ctx.params.id, request, ({ threadId, turnId }) => {
      runtime.runTurn(threadId, turnId)
    })
  })
  router.add('POST', '/v1/threads/:id/review', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.reviewService || !runtime.runReview) {
      return ERRORS.unavailable('review is not available')
    }
    return startReview(
      runtime.turnService,
      ctx.params.id,
      request,
      ({ threadId, turnId, reviewItemId }, target, model) => {
        runtime.runReview?.({ threadId, turnId, reviewItemId, target, model })
      }
    )
  })
  router.add('GET', '/v1/threads/:id/turns/:turnId', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getTurn(runtime.turnService, ctx.params.id, ctx.params.turnId)
  })
  router.add('POST', '/v1/threads/:id/turns/:turnId/steer', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return steerTurn(runtime.turnService, ctx.params.id, ctx.params.turnId, request)
  })
  router.add('POST', '/v1/threads/:id/turns/:turnId/interrupt', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return interruptTurn(runtime.turnService, ctx.params.id, ctx.params.turnId, request)
  })
  router.add('POST', '/v1/threads/:id/compact', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return compactTurn(runtime.turnService, ctx.params.id, request)
  })
  router.add('GET', '/v1/threads/:id/events', (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return buildEventStreamResponse({
      request,
      threadId: ctx.params.id,
      eventBus: runtime.eventBus,
      sessionStore: runtime.sessionStore,
      allocateSeq: runtime.allocateSeq
    })
  })
  router.add('POST', '/v1/approvals/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return decideApproval({
      approvalId: ctx.params.id,
      request,
      gate: runtime.approvalGate,
      events: runtime.events,
      hookGate: runtime.hookGate
    })
  })

  // ── Approval listing ──
  router.add('GET', '/v1/approvals', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    const url = new URL(request.url)
    const threadId = url.searchParams.get('threadId') ?? undefined
    const pending = runtime.approvalGate.pending(threadId)
    return jsonResponse({
      approvals: pending.map((a) => ({
        id: a.id,
        threadId: a.threadId,
        turnId: a.turnId,
        toolName: a.toolName,
        status: a.status,
        summary: a.summary
      }))
    })
  })

  // ═══ Test-only approval fixture (insecure mode only) ═══
  // POST /v1/_test/approvals creates a pending approval via the real
  // gate protocol so smoke tests can exercise the full approval
  // round-trip (list → allow/deny → confirm resolved) without requiring
  // a real model + tool invocation to trigger one.
  router.add('POST', '/v1/_test/approvals', async (request) => {
    if (!runtime.insecure) {
      return ERRORS.notFound('no route')
    }
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    try {
      const body = (await request.json()) as Record<string, unknown>
      const threadId = String(body.threadId ?? '')
      const turnId = String(body.turnId ?? '')
      const toolName = String(body.toolName ?? '_test_fixture')
      const summary = String(body.summary ?? 'Test approval')
      if (!threadId || !turnId) {
        return jsonResponse({ error: 'threadId and turnId are required' }, 400)
      }
      const approval = createApprovalRequest({
        id: `app_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        threadId,
        turnId,
        toolName,
        summary
      })
      // Request via the real gate; creates a pending promise that nobody
      // awaits (no agent loop is running), but the gate registry is populated
      // so list+decide work identically to a real approval.
      runtime.approvalGate.request(approval).catch(() => { /* nobody waiting */ })
      await runtime.events.record({
        kind: 'approval_requested' as const,
        threadId: approval.threadId,
        turnId: approval.turnId,
        itemId: undefined,
        approvalId: approval.id,
        toolName: approval.toolName,
        status: 'pending',
        summary: approval.summary
      })
      return jsonResponse({
        ok: true,
        approval: {
          id: approval.id,
          threadId: approval.threadId,
          turnId: approval.turnId,
          toolName: approval.toolName,
          status: approval.status,
          summary: approval.summary
        }
      }, 201)
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400)
    }
  })

  router.add('POST', '/v1/user-inputs/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return resolveUserInput({
      inputId: ctx.params.id,
      request,
      gate: runtime.userInputGate,
      events: runtime.events,
      hookGate: runtime.hookGate
    })
  })
  router.add('POST', '/v1/user-input/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return resolveUserInput({
      inputId: ctx.params.id,
      request,
      gate: runtime.userInputGate,
      events: runtime.events,
      hookGate: runtime.hookGate
    })
  })
  router.add('POST', '/v1/sessions/:id/resume-thread', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return resumeSession(runtime.threadService, ctx.params.id, request, runtime.hookGate)
  })
  router.add('POST', '/v1/checkpoints', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return createCheckpoint(runtime, request)
  })
  router.add('GET', '/v1/checkpoints/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getCheckpoint(runtime, ctx.params.id)
  })
  router.add('DELETE', '/v1/checkpoints/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return deleteCheckpoint(runtime, ctx.params.id)
  })
  router.add('POST', '/v1/checkpoints/:id/restore', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return restoreCheckpoint(runtime, ctx.params.id, request)
  })
  router.add('POST', '/v1/checkpoints/:id/fork', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return forkFromCheckpoint(runtime, ctx.params.id, request)
  })
  router.add('GET', '/v1/threads/:id/checkpoints', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listCheckpoints(runtime, ctx.params.id)
  })
  // ── Goal evaluator ──
  router.add('POST', '/v1/threads/:id/goal/eval', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.goalEvaluator) return ERRORS.unavailable('goal evaluator is not available')
    // Extract recent transcript from query or body
    const rawBody: unknown = await request.json().catch(() => ({}))
    const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>
    const recentTranscript = typeof body.recentTranscript === 'string' ? body.recentTranscript : ''
    const hadToolCalls = typeof body.hadToolCalls === 'boolean' ? body.hadToolCalls : true
    const evaluated = await evaluateGoal({
      threadId: ctx.params.id,
      threadService: runtime.threadService,
      evaluator: runtime.goalEvaluator,
      events: runtime.events,
      config: {
        enabled: true,
        model: runtime.automationSettings?.goal.model ?? 'deepseek-v4-flash',
        maxContinuationTurns: runtime.automationSettings?.goal.maxContinuationTurns ?? 50,
        blockedRetryAfterTurns: runtime.automationSettings?.goal.blockedRetryAfterTurns ?? 3,
        toolFree: true,
        budget: runtime.automationSettings?.goal.budget ?? {
          maxIterations: 5,
          maxTokensPerEval: 512,
          maxCostUsdPerEval: 0.01,
          totalMaxIterations: 20,
          totalMaxTokens: 5000,
          totalMaxCostUsd: 0.5
        }
      },
      nowIso: runtime.nowIso,
      recentTranscript,
      hadToolCalls
    })
    if ('error' in evaluated) {
      return jsonResponse({ error: evaluated.error }, evaluated.status)
    }
    return jsonResponse(evaluated)
  })
  // ── Loop scheduler ──
  router.add('POST', '/v1/loops', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.loopScheduler) return ERRORS.unavailable('loop scheduler is not available')
    return createLoop(runtime.loopScheduler, request)
  })
  router.add('GET', '/v1/loops', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.loopScheduler) return ERRORS.unavailable('loop scheduler is not available')
    return listLoops(runtime.loopScheduler, request)
  })
  router.add('GET', '/v1/loops/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.loopScheduler) return ERRORS.unavailable('loop scheduler is not available')
    return getLoop(runtime.loopScheduler, ctx.params.id)
  })
  router.add('PATCH', '/v1/loops/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.loopScheduler) return ERRORS.unavailable('loop scheduler is not available')
    return updateLoop(runtime.loopScheduler, ctx.params.id, request)
  })
  router.add('POST', '/v1/loops/:id/pause', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.loopScheduler) return ERRORS.unavailable('loop scheduler is not available')
    return pauseLoop(runtime.loopScheduler, ctx.params.id)
  })
  router.add('POST', '/v1/loops/:id/resume', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.loopScheduler) return ERRORS.unavailable('loop scheduler is not available')
    return resumeLoop(runtime.loopScheduler, ctx.params.id)
  })
  router.add('POST', '/v1/loops/:id/cancel', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.loopScheduler) return ERRORS.unavailable('loop scheduler is not available')
    return cancelLoop(runtime.loopScheduler, ctx.params.id)
  })
  router.add('DELETE', '/v1/loops/:id', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    if (!runtime.loopScheduler) return ERRORS.unavailable('loop scheduler is not available')
    return deleteLoop(runtime.loopScheduler, ctx.params.id)
  })
  router.add('GET', '/v1/usage', async (request) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return usageJsonResponse(request, runtime)
  })
  router.add('GET', '/v1/threads/:id/evidence', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return listThreadEvidence(runtime, ctx.params.id, request)
  })
  router.add('GET', '/v1/threads/:id/evidence/:evidenceId', async (request, ctx) => {
    if (!authorize(request, runtime)) return ERRORS.unauthorized()
    return getThreadEvidenceEntry(runtime, ctx.params.id, ctx.params.evidenceId)
  })
  return router
}

function authorize(request: Request, runtime: ServerRuntime): boolean {
  return isAuthorized(request.headers, runtime.runtimeToken, runtime.insecure)
}

void bearerToken
