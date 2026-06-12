import { z } from 'zod'

// ── Goal evaluator contracts ──────────────────────────────────────────────

export const GoalEvalDecision = z.enum(['done', 'continue', 'blocked'])
export type GoalEvalDecision = z.infer<typeof GoalEvalDecision>

export const GoalEvalResultSchema = z.object({
  decision: GoalEvalDecision,
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).optional(),
  needsAttention: z.boolean().optional()
})
export type GoalEvalResult = z.infer<typeof GoalEvalResultSchema>

export const GoalEvalBudgetSchema = z.object({
  maxIterations: z.number().int().positive(),
  maxTokensPerEval: z.number().int().positive(),
  maxCostUsdPerEval: z.number().positive(),
  totalMaxIterations: z.number().int().positive(),
  totalMaxTokens: z.number().int().positive(),
  totalMaxCostUsd: z.number().positive()
})
export type GoalEvalBudget = z.infer<typeof GoalEvalBudgetSchema>

export const DEFAULT_GOAL_EVAL_MAX_ITERATIONS = 20
export const DEFAULT_GOAL_EVAL_MAX_TOKENS_PER_EVAL = 512
export const DEFAULT_GOAL_EVAL_MAX_COST_USD_PER_EVAL = 0.01
export const DEFAULT_GOAL_EVAL_TOTAL_MAX_ITERATIONS = 200
export const DEFAULT_GOAL_EVAL_TOTAL_MAX_TOKENS = 25_000
export const DEFAULT_GOAL_EVAL_TOTAL_MAX_COST_USD = 0.5

export const GoalEvalConfigSchema = z.object({
  enabled: z.boolean(),
  model: z.string().min(1),
  budget: GoalEvalBudgetSchema,
  maxContinuationTurns: z.number().int().positive().default(50),
  blockedRetryAfterTurns: z.number().int().nonnegative().default(3),
  toolFree: z.literal(true)
})
export type GoalEvalConfig = z.infer<typeof GoalEvalConfigSchema>

export const GoalEvalAuditEventSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  iteration: z.number().int().nonnegative(),
  decision: GoalEvalDecision,
  reason: z.string().min(1),
  budgetExhausted: z.boolean(),
  budgetKind: z.enum(['none', 'iteration', 'token', 'cost', 'iteration_cap', 'token_cap', 'cost_cap']),
  tokensUsed: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  timestamp: z.string()
})
export type GoalEvalAuditEvent = z.infer<typeof GoalEvalAuditEventSchema>

// ── Loop scheduler contracts ──────────────────────────────────────────────

export const LoopScheduleKind = z.enum(['interval', 'cron', 'at'])
export type LoopScheduleKind = z.infer<typeof LoopScheduleKind>

export const LoopScheduleSpecSchema = z.object({
  kind: LoopScheduleKind,
  everyMinutes: z.number().int().positive().optional(),
  cronExpression: z.string().optional(),
  atTime: z.string().optional(),
  timezone: z.string().optional()
}).refine((spec) => {
  if (spec.kind === 'interval') return typeof spec.everyMinutes === 'number' && spec.everyMinutes > 0
  if (spec.kind === 'cron') return typeof spec.cronExpression === 'string' && spec.cronExpression.trim().length > 0
  if (spec.kind === 'at') return typeof spec.atTime === 'string' && spec.atTime.trim().length > 0
  return false
}, { message: 'schedule spec must include the required field for its kind' })
export type LoopScheduleSpec = z.infer<typeof LoopScheduleSpecSchema>

export const LoopStatus = z.enum(['active', 'paused', 'cancelled', 'expired', 'completed'])
export type LoopStatus = z.infer<typeof LoopStatus>

export const LoopCatchUpPolicy = z.enum(['skip', 'burst'])
export type LoopCatchUpPolicy = z.infer<typeof LoopCatchUpPolicy>

export const LoopQueuePolicy = z.enum(['queue', 'skip'])
export type LoopQueuePolicy = z.infer<typeof LoopQueuePolicy>

export const LoopRunStatus = z.enum(['idle', 'running', 'success', 'error', 'skipped'])
export type LoopRunStatus = z.infer<typeof LoopRunStatus>

export const LoopUsageSchema = z.object({
  totalTurns: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  lastTurnTokens: z.number().int().nonnegative(),
  lastTurnCostUsd: z.number().nonnegative()
})
export type LoopUsage = z.infer<typeof LoopUsageSchema>

export const LoopRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  threadTemplateId: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  schedule: LoopScheduleSpecSchema,
  status: LoopStatus,
  catchUpPolicy: LoopCatchUpPolicy.default('skip'),
  queuePolicy: LoopQueuePolicy.default('queue'),
  expiryRuns: z.number().int().positive().optional(),
  expiryDate: z.string().optional(),
  maxRuns: z.number().int().positive().optional(),
  runCount: z.number().int().nonnegative().default(0),
  nextRunAt: z.string().optional(),
  lastRunAt: z.string().optional(),
  lastRunStatus: LoopRunStatus.default('idle'),
  lastRunThreadId: z.string().optional(),
  lastRunError: z.string().optional(),
  usage: LoopUsageSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})
export type LoopRecord = z.infer<typeof LoopRecordSchema>

export const CreateLoopRequest = z.object({
  projectId: z.string().min(1),
  threadTemplateId: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  schedule: LoopScheduleSpecSchema,
  catchUpPolicy: LoopCatchUpPolicy.optional(),
  queuePolicy: LoopQueuePolicy.optional(),
  expiryRuns: z.number().int().positive().optional(),
  expiryDate: z.string().optional(),
  maxRuns: z.number().int().positive().optional()
})
export type CreateLoopRequest = z.infer<typeof CreateLoopRequest>

export const UpdateLoopRequest = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  schedule: LoopScheduleSpecSchema.optional(),
  status: LoopStatus.optional(),
  catchUpPolicy: LoopCatchUpPolicy.optional(),
  queuePolicy: LoopQueuePolicy.optional(),
  expiryRuns: z.number().int().positive().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  maxRuns: z.number().int().positive().nullable().optional()
}).refine((v) =>
  v.prompt !== undefined ||
  v.model !== undefined ||
  v.schedule !== undefined ||
  v.status !== undefined ||
  v.catchUpPolicy !== undefined ||
  v.queuePolicy !== undefined ||
  v.expiryRuns !== undefined ||
  v.expiryDate !== undefined ||
  v.maxRuns !== undefined,
  { message: 'update must change at least one field' }
)
export type UpdateLoopRequest = z.infer<typeof UpdateLoopRequest>

export const ListLoopsResponse = z.object({
  loops: z.array(LoopRecordSchema)
})
export type ListLoopsResponse = z.infer<typeof ListLoopsResponse>

export const LoopResponse = z.object({
  loop: LoopRecordSchema
})
export type LoopResponse = z.infer<typeof LoopResponse>

export const LoopPauseResponse = z.object({
  id: z.string().min(1),
  paused: z.literal(true)
})
export type LoopPauseResponse = z.infer<typeof LoopPauseResponse>

export const LoopResumeResponse = z.object({
  id: z.string().min(1),
  resumed: z.literal(true)
})
export type LoopResumeResponse = z.infer<typeof LoopResumeResponse>

export const LoopCancelResponse = z.object({
  id: z.string().min(1),
  cancelled: z.literal(true)
})
export type LoopCancelResponse = z.infer<typeof LoopCancelResponse>

// ── Automations settings (under agents.kun.automations) ───────────────────

export const GoalAutomationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().min(1).default('deepseek-v4-flash'),
  maxContinuationTurns: z.number().int().positive().default(50),
  blockedRetryAfterTurns: z.number().int().nonnegative().default(3),
  budget: GoalEvalBudgetSchema.default({
    maxIterations: DEFAULT_GOAL_EVAL_MAX_ITERATIONS,
    maxTokensPerEval: DEFAULT_GOAL_EVAL_MAX_TOKENS_PER_EVAL,
    maxCostUsdPerEval: DEFAULT_GOAL_EVAL_MAX_COST_USD_PER_EVAL,
    totalMaxIterations: DEFAULT_GOAL_EVAL_TOTAL_MAX_ITERATIONS,
    totalMaxTokens: DEFAULT_GOAL_EVAL_TOTAL_MAX_TOKENS,
    totalMaxCostUsd: DEFAULT_GOAL_EVAL_TOTAL_MAX_COST_USD
  })
})
export type GoalAutomationSettings = z.infer<typeof GoalAutomationSettingsSchema>

export const LoopAutomationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  defaultModel: z.string().min(1).default('deepseek-v4-pro'),
  maxConcurrentLoops: z.number().int().positive().default(5),
  minIntervalMinutes: z.number().int().positive().default(1),
  requireProjectId: z.boolean().default(true)
})
export type LoopAutomationSettings = z.infer<typeof LoopAutomationSettingsSchema>

export const AutomationSettingsSchema = z.object({
  goal: GoalAutomationSettingsSchema.default({
    enabled: true,
    model: 'deepseek-v4-flash',
    maxContinuationTurns: 50,
    blockedRetryAfterTurns: 3,
    budget: {
      maxIterations: DEFAULT_GOAL_EVAL_MAX_ITERATIONS,
      maxTokensPerEval: DEFAULT_GOAL_EVAL_MAX_TOKENS_PER_EVAL,
      maxCostUsdPerEval: DEFAULT_GOAL_EVAL_MAX_COST_USD_PER_EVAL,
      totalMaxIterations: DEFAULT_GOAL_EVAL_TOTAL_MAX_ITERATIONS,
      totalMaxTokens: DEFAULT_GOAL_EVAL_TOTAL_MAX_TOKENS,
      totalMaxCostUsd: DEFAULT_GOAL_EVAL_TOTAL_MAX_COST_USD
    }
  }),
  loop: LoopAutomationSettingsSchema.default({
    enabled: true,
    defaultModel: 'deepseek-v4-pro',
    maxConcurrentLoops: 5,
    minIntervalMinutes: 1,
    requireProjectId: true
  })
})
export type AutomationSettings = z.infer<typeof AutomationSettingsSchema>

export function normalizeAutomationSettings(input: unknown): AutomationSettings {
  const parsed = AutomationSettingsSchema.parse(input ?? {})
  return {
    goal: GoalAutomationSettingsSchema.parse(parsed.goal ?? {}),
    loop: LoopAutomationSettingsSchema.parse(parsed.loop ?? {})
  }
}
