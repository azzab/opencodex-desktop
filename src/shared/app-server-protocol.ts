import { z } from 'zod'

export const APP_SERVER_PROTOCOL_VERSION = 1

const idSchema = z.string().trim().min(1).max(256)
const optionalIdSchema = z.string().trim().min(1).max(256).optional()
const isoDateSchema = z.string().trim().min(1).max(128)
const pathSchema = z.string().trim().min(1).max(4096)
const optionalPathSchema = z.string().trim().max(4096).optional()
const labelSchema = z.string().trim().min(1).max(200)
const textSchema = z.string().min(1).max(200_000)
const optionalTextSchema = z.string().max(200_000).optional()

export const AppServerSurfaceSchema = z.enum([
  'electron',
  'cli',
  'ide',
  'browser',
  'mobile',
  'remote-relay'
])
export type AppServerSurface = z.infer<typeof AppServerSurfaceSchema>

export const AppServerThreadModeSchema = z.enum(['agent', 'plan'])
export type AppServerThreadMode = z.infer<typeof AppServerThreadModeSchema>

export const AppServerThreadStatusSchema = z.enum(['idle', 'running', 'archived', 'deleted'])
export const AppServerTurnStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'aborted'])
export const AppServerGoalStatusSchema = z.enum([
  'active',
  'paused',
  'blocked',
  'usageLimited',
  'budgetLimited',
  'complete'
])

export const AppServerNotificationCategorySchema = z.enum([
  'health',
  'thread',
  'turn',
  'item',
  'tool_call',
  'approval',
  'artifact',
  'usage',
  'goal',
  'loop',
  'subagent',
  'automation'
])
export type AppServerNotificationCategory = z.infer<typeof AppServerNotificationCategorySchema>

export const AppServerProjectSchema = z.object({
  id: idSchema,
  root: pathSchema,
  label: labelSchema,
  trusted: z.boolean(),
  active: z.boolean(),
  capabilities: z.object({
    threads: z.boolean(),
    approvals: z.boolean(),
    usage: z.boolean(),
    events: z.boolean(),
    attachments: z.boolean(),
    automation: z.boolean()
  }).strict()
}).strict()
export type AppServerProject = z.infer<typeof AppServerProjectSchema>

export const AppServerUsageSchema = z.object({
  threadId: optionalIdSchema,
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  cacheMissTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
  cacheHitRate: z.number().min(0).max(1).nullable()
}).strict()
export type AppServerUsage = z.infer<typeof AppServerUsageSchema>

export const AppServerGoalSchema = z.object({
  threadId: idSchema,
  objective: textSchema.max(4000),
  status: AppServerGoalStatusSchema,
  tokenBudget: z.number().int().positive().nullable().optional(),
  tokensUsed: z.number().int().nonnegative(),
  updatedAt: isoDateSchema
}).strict()
export type AppServerGoal = z.infer<typeof AppServerGoalSchema>

export const AppServerThreadSchema = z.object({
  id: idSchema,
  title: z.string().max(300),
  projectId: optionalIdSchema,
  workspaceRoot: z.string().max(4096),
  model: z.string().max(256),
  mode: AppServerThreadModeSchema,
  status: AppServerThreadStatusSchema,
  relation: z.enum(['primary', 'fork', 'side']).optional(),
  parentThreadId: optionalIdSchema,
  forkedFromThreadId: optionalIdSchema,
  goal: AppServerGoalSchema.optional(),
  usage: AppServerUsageSchema.optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema
}).strict()
export type AppServerThread = z.infer<typeof AppServerThreadSchema>

export const AppServerTurnSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  status: AppServerTurnStatusSchema,
  promptPreview: z.string().max(2000),
  model: z.string().max(256).optional(),
  mode: AppServerThreadModeSchema.optional(),
  startedAt: isoDateSchema.optional(),
  finishedAt: isoDateSchema.optional()
}).strict()
export type AppServerTurn = z.infer<typeof AppServerTurnSchema>

export const AppServerItemSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  turnId: idSchema,
  kind: z.enum([
    'message',
    'reasoning',
    'tool_call',
    'tool_result',
    'approval',
    'user_input',
    'file_change',
    'error',
    'other'
  ]),
  summary: z.string().max(4000),
  redacted: z.boolean()
}).strict()
export type AppServerItem = z.infer<typeof AppServerItemSchema>

export const AppServerToolCallSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  turnId: idSchema,
  name: labelSchema,
  status: z.enum(['pending', 'running', 'completed', 'failed', 'denied']),
  argumentsPreview: z.string().max(8000),
  approvalId: optionalIdSchema,
  startedAt: isoDateSchema.optional(),
  finishedAt: isoDateSchema.optional()
}).strict()
export type AppServerToolCall = z.infer<typeof AppServerToolCallSchema>

export const AppServerApprovalSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  turnId: idSchema,
  toolName: labelSchema,
  status: z.enum(['pending', 'allowed', 'denied', 'expired']),
  summary: z.string().max(4000),
  expiresAt: isoDateSchema.optional()
}).strict()
export type AppServerApproval = z.infer<typeof AppServerApprovalSchema>

export const AppServerArtifactSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  turnId: optionalIdSchema,
  kind: z.enum(['file', 'image', 'diff', 'terminal', 'browser', 'report', 'other']),
  name: labelSchema,
  path: optionalPathSchema,
  uri: z.string().trim().max(4096).optional(),
  mimeType: z.string().trim().max(128).optional(),
  redaction: z.enum(['metadata', 'summary', 'selected_excerpt', 'explicit_full'])
}).strict()
export type AppServerArtifact = z.infer<typeof AppServerArtifactSchema>

export const AppServerLoopSchema = z.object({
  threadId: idSchema,
  turnId: optionalIdSchema,
  runId: optionalIdSchema,
  status: z.enum(['idle', 'running', 'blocked', 'failed', 'completed']),
  phase: z.string().trim().max(120),
  updatedAt: isoDateSchema
}).strict()
export type AppServerLoop = z.infer<typeof AppServerLoopSchema>

export const AppServerSubagentSchema = z.object({
  parentThreadId: idSchema,
  childThreadId: optionalIdSchema,
  label: labelSchema,
  status: z.enum(['queued', 'running', 'completed', 'failed', 'blocked']),
  model: z.string().trim().max(256).optional(),
  tokenBudget: z.number().int().positive().optional()
}).strict()
export type AppServerSubagent = z.infer<typeof AppServerSubagentSchema>

export const AppServerAutomationEventSchema = z.object({
  threadId: optionalIdSchema,
  action: z.string().trim().min(1).max(120),
  decision: z.enum(['allow', 'ask', 'deny', 'completed', 'failed']),
  permission: z.string().trim().max(120).optional(),
  reason: z.string().trim().max(1000).optional(),
  auditId: optionalIdSchema
}).strict()
export type AppServerAutomationEvent = z.infer<typeof AppServerAutomationEventSchema>

export const AppServerNotificationSchema = z.object({
  id: idSchema,
  version: z.literal(APP_SERVER_PROTOCOL_VERSION),
  category: AppServerNotificationCategorySchema,
  type: z.string().trim().min(1).max(120),
  sentAt: isoDateSchema,
  threadId: optionalIdSchema,
  redaction: z.enum(['metadata', 'summary', 'selected_excerpt', 'explicit_full']),
  payload: z.record(z.string(), z.unknown())
}).strict()
export type AppServerNotification = z.infer<typeof AppServerNotificationSchema>

export const AppServerNotificationOptionsSchema = z.object({
  threadId: optionalIdSchema,
  sinceSeq: z.number().int().nonnegative().optional(),
  categories: z.array(AppServerNotificationCategorySchema).max(32).optional(),
  optOutCategories: z.array(AppServerNotificationCategorySchema).max(32).default([])
}).strict()
export type AppServerNotificationOptions = z.input<typeof AppServerNotificationOptionsSchema>

export const AppServerHealthResponseSchema = z.object({
  ok: z.boolean(),
  protocolVersion: z.literal(APP_SERVER_PROTOCOL_VERSION),
  runtime: z.object({
    ok: z.boolean(),
    status: z.number().int().positive(),
    owner: z.literal('kun')
  }).strict(),
  auth: z.object({
    loopbackOnly: z.boolean(),
    tokenRequired: z.boolean()
  }).strict()
}).strict()
export type AppServerHealthResponse = z.infer<typeof AppServerHealthResponseSchema>

export const AppServerStartThreadRequestSchema = z.object({
  workspaceRoot: pathSchema,
  title: z.string().trim().max(300).optional(),
  model: z.string().trim().max(256).optional(),
  mode: AppServerThreadModeSchema.default('agent'),
  initialPrompt: optionalTextSchema,
  approvalPolicy: z.enum(['on-request', 'untrusted', 'never', 'auto', 'suggest']).optional(),
  sandboxMode: z.enum(['read-only', 'workspace-write', 'danger-full-access', 'external-sandbox']).optional()
}).strict()
export type AppServerStartThreadRequest = z.input<typeof AppServerStartThreadRequestSchema>

export const AppServerResumeThreadRequestSchema = z.object({
  sessionId: idSchema,
  workspaceRoot: optionalPathSchema,
  model: z.string().trim().max(256).optional(),
  mode: AppServerThreadModeSchema.optional()
}).strict()
export type AppServerResumeThreadRequest = z.infer<typeof AppServerResumeThreadRequestSchema>

export const AppServerForkThreadRequestSchema = z.object({
  threadId: idSchema,
  title: z.string().trim().max(300).optional(),
  relation: z.enum(['fork', 'side']).default('fork')
}).strict()
export type AppServerForkThreadRequest = z.input<typeof AppServerForkThreadRequestSchema>

export const AppServerSteerTurnRequestSchema = z.object({
  threadId: idSchema,
  turnId: idSchema,
  text: textSchema
}).strict()
export type AppServerSteerTurnRequest = z.infer<typeof AppServerSteerTurnRequestSchema>

export const AppServerThreadStartResponseSchema = z.object({
  thread: AppServerThreadSchema,
  turn: z.object({
    threadId: idSchema,
    turnId: idSchema
  }).strict().optional()
}).strict()
export type AppServerThreadStartResponse = z.infer<typeof AppServerThreadStartResponseSchema>
