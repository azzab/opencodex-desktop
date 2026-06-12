import { z } from 'zod'
import type { ThreadService } from '../../services/thread-service.js'
import type { GoalEvaluator } from '../../ports/goal-evaluator.js'
import type { RuntimeEventRecorder } from '../../services/runtime-event-recorder.js'
import type {
  GoalEvalConfig,
  GoalEvalResult,
  GoalEvalAuditEvent
} from '../../contracts/automations.js'
import { GoalEvalConfigSchema } from '../../contracts/automations.js'

/**
 * Evaluate a goal for a thread. POST /v1/threads/:id/goal/eval
 *
 * Body: optional partial GoalEvalConfig to override defaults
 * Response: { result: GoalEvalResult, budget: { exhausted, kind }, audit: GoalEvalAuditEvent }
 */
export async function evaluateGoal(params: {
  threadId: string
  threadService: ThreadService
  evaluator: GoalEvaluator
  events: RuntimeEventRecorder
  config: GoalEvalConfig
  nowIso: () => string
  recentTranscript: string
  hadToolCalls: boolean
}): Promise<{
  result: GoalEvalResult
  budget: { exhausted: boolean; kind: string }
  audit: GoalEvalAuditEvent
} | { error: string; status: number }> {
  const thread = await params.threadService.get(params.threadId)
  if (!thread) return { error: 'thread not found', status: 404 }

  const goal = thread.goal
  if (!goal) return { error: 'no active goal on this thread', status: 400 }
  if (goal.status !== 'active') return { error: 'goal is not active', status: 400 }

  const evalTokensUsed = 0 // Reset per-eval; total tracked in audit events
  const evalCostUsd = 0

  const context = {
    threadId: params.threadId,
    objective: goal.objective,
    recentTranscript: params.recentTranscript,
    tokensUsed: goal.tokensUsed,
    tokenBudget: goal.tokenBudget ?? null,
    costUsedUsd: 0, // TODO: wire from usage service
    hadToolCalls: params.hadToolCalls,
    iterationCount: 1, // TODO: track across turns
    evalTokensUsed,
    evalCostUsd
  }

  // Check evaluator budget
  const budgetCheck = params.evaluator.checkBudget(context, params.config)
  if (budgetCheck.exhausted) {
    const audit: GoalEvalAuditEvent = {
      threadId: params.threadId,
      turnId: '',
      iteration: context.iterationCount,
      decision: 'continue',
      reason: `Goal evaluator budget exhausted: ${budgetCheck.kind}`,
      budgetExhausted: true,
      budgetKind: budgetCheck.kind,
      tokensUsed: context.evalTokensUsed,
      costUsd: context.evalCostUsd,
      timestamp: params.nowIso()
    }
    await params.evaluator.recordAudit(audit)
    await params.events.record({
      kind: 'error',
      threadId: params.threadId,
      message: `Goal evaluator budget exhausted: ${budgetCheck.kind}`,
      code: 'goal_eval_budget_exhausted',
      severity: 'warning'
    })
    return {
      result: {
        decision: 'blocked',
        reason: `Goal evaluator budget exhausted: ${budgetCheck.kind}. Needs user attention.`,
        confidence: 1,
        needsAttention: true
      },
      budget: budgetCheck,
      audit
    }
  }

  // Run the evaluator
  const result = await params.evaluator.evaluate(context, params.config)
  const audit: GoalEvalAuditEvent = {
    threadId: params.threadId,
    turnId: '',
    iteration: context.iterationCount,
    decision: result.decision,
    reason: result.reason,
    budgetExhausted: false,
    budgetKind: 'none',
    tokensUsed: context.evalTokensUsed,
    costUsd: context.evalCostUsd,
    timestamp: params.nowIso()
  }
  await params.evaluator.recordAudit(audit)

  // Record the evaluation as a runtime event
  await params.events.record({
    kind: 'goal_updated',
    threadId: params.threadId,
    goal: {
      ...goal,
      status: result.decision === 'done' ? 'complete'
        : result.decision === 'blocked' ? 'blocked'
        : 'active',
      updatedAt: params.nowIso()
    }
  })

  return { result, budget: budgetCheck, audit }
}

export const GoalEvalRequestBody = z.object({
  config: GoalEvalConfigSchema.partial().optional()
})
