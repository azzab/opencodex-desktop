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
  'automation',
  'remote_runner'
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
    automation: z.boolean(),
    remoteRunners: z.boolean()
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
  }).strict(),
  remoteRunners: z.object({
    available: z.boolean(),
    enabled: z.boolean()
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

/* ------------------------------------------------------------------ */
/*  Remote Runner App-Server Protocol Schemas (Phase H10)             */
/*                                                                     */
/*  These schemas expose metadata-only remote-runner status and       */
/*  operation results to H9 clients (CLI, IDE, browser, mobile,       */
/*  remote-relay) through the app-server bridge. No raw credentials,  */
/*  secret material, endpoint refs, or credential refs are exposed.   */
/* ------------------------------------------------------------------ */

export const AppServerRemoteRunnerConnectionStatusSchema = z.enum([
  'disconnected',
  'connecting',
  'handshaking',
  'connected',
  'error'
])
export type AppServerRemoteRunnerConnectionStatus = z.infer<
  typeof AppServerRemoteRunnerConnectionStatusSchema
>

export const AppServerRemoteRunnerHandshakeSummarySchema = z.object({
  issuedAt: isoDateSchema,
  shell: z.object({ os: z.string(), shell: z.string() }).strict(),
  gitAvailable: z.boolean(),
  toolPolicy: z.record(z.string(), z.string())
}).strict()
export type AppServerRemoteRunnerHandshakeSummary = z.infer<
  typeof AppServerRemoteRunnerHandshakeSummarySchema
>

export const AppServerRemoteRunnerHostSummarySchema = z.object({
  id: idSchema,
  label: labelSchema,
  enabled: z.boolean(),
  connectionStatus: AppServerRemoteRunnerConnectionStatusSchema,
  lastHandshake: AppServerRemoteRunnerHandshakeSummarySchema.nullable(),
  lastError: z.string().nullable(),
  trustedPathCount: z.number().int().nonnegative()
}).strict()
export type AppServerRemoteRunnerHostSummary = z.infer<
  typeof AppServerRemoteRunnerHostSummarySchema
>

export const AppServerRemoteRunnerAuditEntrySchema = z.object({
  id: idSchema,
  timestamp: isoDateSchema,
  runnerId: idSchema,
  action: z.string().trim().min(1).max(256),
  outcome: z.string().trim().min(1).max(64),
  reason: z.string().trim().max(1000).nullable().optional()
}).strict()
export type AppServerRemoteRunnerAuditEntry = z.infer<
  typeof AppServerRemoteRunnerAuditEntrySchema
>

export const AppServerRemoteRunnerStatusResponseSchema = z.object({
  hosts: z.array(AppServerRemoteRunnerHostSummarySchema).max(50),
  enabled: z.boolean(),
  auditLog: z.array(AppServerRemoteRunnerAuditEntrySchema).max(500)
}).strict()
export type AppServerRemoteRunnerStatusResponse = z.infer<
  typeof AppServerRemoteRunnerStatusResponseSchema
>

export const AppServerRemoteRunnerActionKindSchema = z.enum([
  'connect',
  'disconnect',
  'reconnect',
  'handshake'
])
export type AppServerRemoteRunnerActionKind = z.infer<
  typeof AppServerRemoteRunnerActionKindSchema
>

export const AppServerRemoteRunnerActionRequestSchema = z.object({
  hostId: idSchema,
  action: AppServerRemoteRunnerActionKindSchema
}).strict()
export type AppServerRemoteRunnerActionRequest = z.input<
  typeof AppServerRemoteRunnerActionRequestSchema
>

export const AppServerRemoteRunnerActionResponseSchema = z.object({
  ok: z.boolean(),
  hostId: idSchema,
  message: z.string().trim().max(1000).optional()
}).strict()
export type AppServerRemoteRunnerActionResponse = z.infer<
  typeof AppServerRemoteRunnerActionResponseSchema
>

export const AppServerRemoteRunnerTrustKindSchema = z.enum(['trust', 'revoke'])
export type AppServerRemoteRunnerTrustKind = z.infer<
  typeof AppServerRemoteRunnerTrustKindSchema
>

export const AppServerRemoteRunnerTrustRequestSchema = z.object({
  hostId: idSchema,
  action: AppServerRemoteRunnerTrustKindSchema,
  path: pathSchema,
  label: z.string().trim().max(200).optional()
}).strict()
export type AppServerRemoteRunnerTrustRequest = z.input<
  typeof AppServerRemoteRunnerTrustRequestSchema
>

export const AppServerRemoteRunnerTrustResponseSchema = z.object({
  ok: z.boolean(),
  hostId: idSchema,
  path: pathSchema,
  message: z.string().trim().max(1000).optional()
}).strict()
export type AppServerRemoteRunnerTrustResponse = z.infer<
  typeof AppServerRemoteRunnerTrustResponseSchema
>

export const AppServerRemoteRunnerExecRequestSchema = z.object({
  hostId: idSchema,
  command: textSchema.max(100_000),
  cwd: z.string().trim().max(4096).optional(),
  timeoutMs: z.number().int().positive().max(86_400_000).optional(),
  maxOutputBytes: z.number().int().positive().max(10_000_000).optional()
}).strict()
export type AppServerRemoteRunnerExecRequest = z.input<
  typeof AppServerRemoteRunnerExecRequestSchema
>

export const AppServerRemoteRunnerExecResponseSchema = z.object({
  ok: z.boolean(),
  runId: idSchema.optional(),
  output: z.string().max(200_000).optional(),
  exitCode: z.number().int().nullable().optional(),
  message: z.string().trim().max(2000).optional()
}).strict()
export type AppServerRemoteRunnerExecResponse = z.infer<
  typeof AppServerRemoteRunnerExecResponseSchema
>

export const AppServerRemoteRunnerStopRequestSchema = z.object({
  hostId: idSchema
}).strict()
export type AppServerRemoteRunnerStopRequest = z.input<
  typeof AppServerRemoteRunnerStopRequestSchema
>

export const AppServerRemoteRunnerStopResponseSchema = z.object({
  ok: z.boolean(),
  hostId: idSchema,
  wasRunning: z.boolean(),
  message: z.string().trim().max(1000).optional()
}).strict()
export type AppServerRemoteRunnerStopResponse = z.infer<
  typeof AppServerRemoteRunnerStopResponseSchema
>

export const AppServerRemoteRunnerResumeRequestSchema = z.object({
  hostId: idSchema
}).strict()
export type AppServerRemoteRunnerResumeRequest = z.input<
  typeof AppServerRemoteRunnerResumeRequestSchema
>

export const AppServerRemoteRunnerResumeResponseSchema = z.object({
  ok: z.boolean(),
  hostId: idSchema,
  runId: idSchema.nullable().optional(),
  restored: z.boolean(),
  message: z.string().trim().max(1000).optional()
}).strict()
export type AppServerRemoteRunnerResumeResponse = z.infer<
  typeof AppServerRemoteRunnerResumeResponseSchema
>

export const AppServerRemoteRunnerAuditRequestSchema = z.object({
  limit: z.number().int().positive().max(500).optional()
}).strict()
export type AppServerRemoteRunnerAuditRequest = z.input<
  typeof AppServerRemoteRunnerAuditRequestSchema
>

export const AppServerRemoteRunnerAuditResponseSchema = z.object({
  entries: z.array(AppServerRemoteRunnerAuditEntrySchema).max(500)
}).strict()
export type AppServerRemoteRunnerAuditResponse = z.infer<
  typeof AppServerRemoteRunnerAuditResponseSchema
>
