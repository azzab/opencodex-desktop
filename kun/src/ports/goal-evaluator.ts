import type {
  GoalEvalConfig,
  GoalEvalResult,
  GoalEvalAuditEvent
} from '../contracts/automations.js'

export type GoalEvaluatorContext = {
  threadId: string
  objective: string
  /** Recent transcript text (assistant + tool results since last turn). */
  recentTranscript: string
  /** Tools remaining in the thread budget (non-negative). */
  tokensUsed: number
  tokenBudget: number | null
  costUsedUsd: number
  /** Whether the model emitted tool calls this turn (implies work was done). */
  hadToolCalls: boolean
  iterationCount: number
  /** Total tokens spent across all evaluator calls for this goal. */
  evalTokensUsed: number
  evalCostUsd: number
}

export interface GoalEvaluator {
  /** Evaluate whether the goal is done, should continue, or is blocked. */
  evaluate(context: GoalEvaluatorContext, config: GoalEvalConfig): Promise<GoalEvalResult>

  /** Check if the evaluator's own budget has been exhausted. */
  checkBudget(
    context: GoalEvaluatorContext,
    config: GoalEvalConfig
  ): { exhausted: boolean; kind: GoalEvalAuditEvent['budgetKind'] }

  /** Record an audit event for the evaluation. */
  recordAudit(event: GoalEvalAuditEvent): Promise<void>

  /** Get the accumulated audit events for a thread. */
  auditEvents(threadId: string): Promise<GoalEvalAuditEvent[]>
}
