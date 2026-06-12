import { z } from 'zod'
import {
  KUN_APPROVAL_TEMPLATE,
  KUN_ATTACHMENT_CONTENT_TEMPLATE,
  KUN_ATTACHMENT_DIAGNOSTICS_TEMPLATE,
  KUN_ATTACHMENTS_TEMPLATE,
  KUN_ATTACHMENT_TEMPLATE,
  KUN_CHECKPOINTS_TEMPLATE,
  KUN_CHECKPOINT_FORK_TEMPLATE,
  KUN_CHECKPOINT_RESTORE_TEMPLATE,
  KUN_CHECKPOINT_TEMPLATE,
  KUN_HEALTH_TEMPLATE,
  KUN_LOOPS_TEMPLATE,
  KUN_LOOP_TEMPLATE,
  KUN_LOOP_PAUSE_TEMPLATE,
  KUN_LOOP_RESUME_TEMPLATE,
  KUN_LOOP_CANCEL_TEMPLATE,
  KUN_MEMORY_DIAGNOSTICS_TEMPLATE,
  KUN_MEMORY_RECORD_TEMPLATE,
  KUN_MEMORY_TEMPLATE,
  KUN_RUNTIME_INFO_TEMPLATE,
  KUN_RUNTIME_TOOLS_TEMPLATE,
  KUN_RUNTIME_HOOKS_RELOAD_TEMPLATE,
  KUN_SESSION_RESUME_TEMPLATE,
  KUN_SKILLS_TEMPLATE,
  KUN_THREADS_TEMPLATE,
  KUN_THREAD_CHECKPOINTS_TEMPLATE,
  KUN_THREAD_COMPACT_TEMPLATE,
  KUN_THREAD_FORK_TEMPLATE,
  KUN_THREAD_GOAL_TEMPLATE,
  KUN_THREAD_GOAL_EVAL_TEMPLATE,
  KUN_THREAD_REVIEW_TEMPLATE,
  KUN_THREAD_TODOS_TEMPLATE,
  KUN_THREAD_INTERRUPT_TEMPLATE,
  KUN_THREAD_STEER_TEMPLATE,
  KUN_THREAD_TURNS_TEMPLATE,
  KUN_THREAD_TEMPLATE,
  KUN_THREAD_EVIDENCE_TEMPLATE,
  KUN_THREAD_EVIDENCE_ENTRY_TEMPLATE,
  KUN_USER_INPUT_TEMPLATE,
  KUN_USAGE_TEMPLATE
} from '../../shared/kun-endpoints'
import {
  CLAW_MODEL_IDS,
  SCHEDULE_MODEL_IDS,
  SCHEDULE_REASONING_EFFORT_IDS,
  WRITE_INLINE_COMPLETION_MODEL_IDS
} from '../../shared/app-settings'
import { DESKTOP_COMMANDS } from '../../shared/ds-gui-api'
import { GUI_UPDATE_CHANNELS } from '../../shared/gui-update'
import { KEYBOARD_SHORTCUT_COMMANDS } from '../../shared/keyboard-shortcuts'
import { WRITE_EXPORT_FORMATS } from '../../shared/write-export'

const MAX_BODY_BYTES = 2_000_000
const MAX_PATH_LENGTH = 4_096
const MAX_URL_LENGTH = 4_096
const MAX_ID_LENGTH = 256
const MAX_BRANCH_LENGTH = 255
const MAX_EDITOR_ID_LENGTH = 64
const MAX_NOTIFICATION_TITLE_LENGTH = 200
const MAX_NOTIFICATION_BODY_LENGTH = 5_000
const MAX_CHANNEL_TEXT_LENGTH = 100_000
const MAX_SKILL_FILE_BYTES = 1_000_000
const MAX_CONFIG_FILE_BYTES = 2_000_000
const MAX_DEVICE_CODE_LENGTH = 8_192
const MAX_EDITOR_COMPLETION_TEXT = 200_000

const SAFE_OPEN_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function trimmedString(max: number): z.ZodString {
  return z.string().trim().min(1).max(max)
}

function optionalTrimmedString(max: number): z.ZodOptional<z.ZodString> {
  return z.string().trim().max(max).optional()
}

export function isSafeOpenExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return SAFE_OPEN_EXTERNAL_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}

export const defaultPathSchema = optionalTrimmedString(MAX_PATH_LENGTH)

interface EndpointTemplate {
  /** Compiled path matcher. */
  match(path: string): boolean
  allowedMethods: readonly string[]
}

function compileEndpoint(
  template: string,
  allowedMethods: readonly string[]
): EndpointTemplate {
  // Build a regex from the template by escaping the literal parts and
  // substituting the `{id}` / `{turn}` placeholders with `[^/]+`. The
  // template fragments are URL-encoded by the path helpers, so they
  // contain only characters that are safe to escape directly.
  const pattern = template.replace(/[.+*?^$()|[\]\\]/g, '\\$&').replace(/\{(?:id|turn)\}/g, '[^/]+')
  const regex = new RegExp(`^${pattern}$`)
  return {
    match: (path: string) => regex.test(path),
    allowedMethods
  }
}

const ENDPOINTS: readonly EndpointTemplate[] = [
  compileEndpoint(KUN_HEALTH_TEMPLATE, ['GET']),
  compileEndpoint(KUN_RUNTIME_INFO_TEMPLATE, ['GET']),
  compileEndpoint(KUN_RUNTIME_TOOLS_TEMPLATE, ['GET']),
  compileEndpoint(KUN_RUNTIME_HOOKS_RELOAD_TEMPLATE, ['POST']),
  compileEndpoint(KUN_SKILLS_TEMPLATE, ['GET']),
  compileEndpoint(KUN_ATTACHMENTS_TEMPLATE, ['POST']),
  compileEndpoint(KUN_ATTACHMENT_DIAGNOSTICS_TEMPLATE, ['GET']),
  compileEndpoint(KUN_ATTACHMENT_TEMPLATE, ['GET']),
  compileEndpoint(KUN_ATTACHMENT_CONTENT_TEMPLATE, ['GET']),
  compileEndpoint(KUN_MEMORY_TEMPLATE, ['GET', 'POST']),
  compileEndpoint(KUN_MEMORY_DIAGNOSTICS_TEMPLATE, ['GET']),
  compileEndpoint(KUN_MEMORY_RECORD_TEMPLATE, ['PATCH', 'DELETE']),
  compileEndpoint(KUN_THREADS_TEMPLATE, ['GET', 'POST']),
  compileEndpoint(KUN_THREAD_TEMPLATE, ['GET', 'PATCH', 'DELETE']),
  compileEndpoint(KUN_THREAD_FORK_TEMPLATE, ['POST']),
  compileEndpoint(KUN_THREAD_GOAL_TEMPLATE, ['GET', 'POST', 'DELETE']),
  compileEndpoint(KUN_THREAD_GOAL_EVAL_TEMPLATE, ['POST']),
  compileEndpoint(KUN_THREAD_TODOS_TEMPLATE, ['GET', 'POST', 'DELETE']),
  compileEndpoint(KUN_THREAD_COMPACT_TEMPLATE, ['POST']),
  compileEndpoint(KUN_THREAD_REVIEW_TEMPLATE, ['POST']),
  compileEndpoint(KUN_THREAD_TURNS_TEMPLATE, ['POST']),
  compileEndpoint(KUN_THREAD_STEER_TEMPLATE, ['POST']),
  compileEndpoint(KUN_THREAD_INTERRUPT_TEMPLATE, ['POST']),
  compileEndpoint(KUN_APPROVAL_TEMPLATE, ['POST']),
  compileEndpoint(KUN_THREAD_EVIDENCE_TEMPLATE, ['GET']),
  compileEndpoint(KUN_THREAD_EVIDENCE_ENTRY_TEMPLATE, ['GET']),
  compileEndpoint(KUN_USER_INPUT_TEMPLATE, ['POST']),
  compileEndpoint(KUN_SESSION_RESUME_TEMPLATE, ['POST']),
  compileEndpoint(KUN_USAGE_TEMPLATE, ['GET']),
  compileEndpoint(KUN_CHECKPOINTS_TEMPLATE, ['POST']),
  compileEndpoint(KUN_CHECKPOINT_TEMPLATE, ['GET', 'DELETE']),
  compileEndpoint(KUN_CHECKPOINT_RESTORE_TEMPLATE, ['POST']),
  compileEndpoint(KUN_CHECKPOINT_FORK_TEMPLATE, ['POST']),
  compileEndpoint(KUN_THREAD_CHECKPOINTS_TEMPLATE, ['GET']),
  compileEndpoint(KUN_LOOPS_TEMPLATE, ['GET', 'POST']),
  compileEndpoint(KUN_LOOP_TEMPLATE, ['GET', 'PATCH', 'DELETE']),
  compileEndpoint(KUN_LOOP_PAUSE_TEMPLATE, ['POST']),
  compileEndpoint(KUN_LOOP_RESUME_TEMPLATE, ['POST']),
  compileEndpoint(KUN_LOOP_CANCEL_TEMPLATE, ['POST'])
]

function isAllowedRuntimeRequest(value: { path: string; method?: string }): boolean {
  try {
    const url = new URL(value.path, 'http://localhost')
    const path = url.pathname
    const method = value.method ?? 'GET'
    for (const endpoint of ENDPOINTS) {
      if (endpoint.match(path)) {
        return endpoint.allowedMethods.includes(method)
      }
    }
    return false
  } catch {
    return false
  }
}

export const runtimeRequestPayloadSchema = z
  .object({
    path: trimmedString(MAX_URL_LENGTH).transform((value) =>
      value.startsWith('/') ? value : `/${value}`
    ),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
    body: z.string().max(MAX_BODY_BYTES).optional()
  })
  .refine((payload) => isAllowedRuntimeRequest(payload), {
    message: 'runtime request path is not allowed'
  })
  .strict()

const localeSchema = z.enum(['en', 'zh', 'ar'])
const themeSchema = z.enum(['system', 'light', 'dark'])
const uiFontScaleSchema = z.enum(['small', 'medium', 'large'])
const approvalPolicySchema = z.enum(['on-request', 'untrusted', 'never', 'auto', 'suggest'])
const sandboxModeSchema = z.enum(['read-only', 'workspace-write', 'danger-full-access', 'external-sandbox'])
const mcpSearchModeSchema = z.enum(['direct', 'search', 'auto'])
const kunStorageBackendSchema = z.enum(['hybrid', 'file'])
const modelEndpointFormatSchema = z.enum(['chat_completions', 'responses', 'messages'])
const kunCompactionSummaryModeSchema = z.enum(['heuristic', 'model'])
const kunAutomationPermissionModeSchema = z.enum(['deny', 'ask', 'allow'])
const kunSubagentWorkflowPresetIdSchema = z.enum([
  'review_swarm',
  'implementation_split',
  'research_split',
  'audit_split'
])
const clawRunModeSchema = z.enum(['agent', 'plan'])
const clawImProviderSchema = z.enum(['feishu', 'weixin'])
const clawScheduleKindSchema = z.enum(['manual', 'interval', 'daily', 'at'])
const clawTaskStatusSchema = z.enum(['idle', 'running', 'success', 'error'])
const clawModelSchema = z.enum(CLAW_MODEL_IDS)
const scheduleReasoningEffortSchema = z.enum(SCHEDULE_REASONING_EFFORT_IDS)
const writeInlineCompletionModelSchema = z.union([
  z.enum(WRITE_INLINE_COMPLETION_MODEL_IDS),
  trimmedString(128)
])

const modelProviderPatchSchema = z.object({
  apiKey: z.string().max(MAX_BODY_BYTES).optional(),
  baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  providers: z.array(z.object({
    id: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    apiKey: z.string().max(MAX_BODY_BYTES).optional(),
    baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
    endpointFormat: modelEndpointFormatSchema.optional(),
    models: z.array(z.string().trim().min(1).max(256)).max(500).optional(),
    catalogUpdatedAt: z.string().trim().max(128).optional(),
    catalogError: z.string().trim().max(512).optional(),
    catalogModels: z.array(z.object({
      id: z.string().trim().min(1).max(256),
      name: z.string().trim().min(1).max(160),
      providerId: z.string().trim().min(1).max(64),
      contextLength: z.number().int().positive().optional(),
      tokenizer: z.string().trim().min(1).max(80).optional(),
      pricingUsdPerMillion: z.object({
        input: z.number().nonnegative(),
        output: z.number().nonnegative(),
        cacheRead: z.number().nonnegative().optional(),
        cacheWrite: z.number().nonnegative().optional()
      }).strict().optional(),
      capabilities: z.object({
        inputModalities: z.array(z.string().trim().min(1).max(40)).max(20),
        outputModalities: z.array(z.string().trim().min(1).max(40)).max(20),
        reasoning: z.boolean(),
        tools: z.boolean(),
        recommendedUse: z.array(z.string().trim().min(1).max(40)).max(20)
      }).strict()
    }).strict()).max(500).optional()
  }).strict()).max(50).optional()
}).strict()

export const modelProviderCatalogPayloadSchema = z.object({
  providerId: z.string().trim().min(1).max(64)
}).strict()

const kunRuntimePatchSchema = z.object({
  binaryPath: defaultPathSchema,
  port: z.number().int().min(1).max(65_535).optional(),
  autoStart: z.boolean().optional(),
  apiKey: z.string().max(MAX_BODY_BYTES).optional(),
  baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  providerId: z.string().trim().max(64).optional(),
  endpointFormat: modelEndpointFormatSchema.optional(),
  runtimeToken: z.string().max(MAX_BODY_BYTES).optional(),
  dataDir: defaultPathSchema,
  model: z.string().trim().min(1).max(128).optional(),
  approvalPolicy: approvalPolicySchema.optional(),
  sandboxMode: sandboxModeSchema.optional(),
  tokenEconomyMode: z.boolean().optional(),
  tokenEconomy: z.object({
    enabled: z.boolean().optional(),
    compressToolDescriptions: z.boolean().optional(),
    compressToolResults: z.boolean().optional(),
    conciseResponses: z.boolean().optional(),
    historyHygiene: z.object({
      maxToolResultLines: z.number().int().positive().max(100_000).optional(),
      maxToolResultBytes: z.number().int().positive().max(8 * 1024 * 1024).optional(),
      maxToolResultTokens: z.number().int().positive().max(256_000).optional(),
      maxToolArgumentStringBytes: z.number().int().positive().max(8 * 1024 * 1024).optional(),
      maxToolArgumentStringTokens: z.number().int().positive().max(64_000).optional(),
      maxArrayItems: z.number().int().positive().max(10_000).optional()
    }).strict().optional()
  }).strict().optional(),
  insecure: z.boolean().optional(),
  mcpSearch: z.object({
    enabled: z.boolean().optional(),
    mode: mcpSearchModeSchema.optional(),
    autoThresholdToolCount: z.number().int().positive().optional(),
    topKDefault: z.number().int().positive().optional(),
    topKMax: z.number().int().positive().optional(),
    minScore: z.number().nonnegative().optional()
  }).strict().optional(),
  storage: z.object({
    backend: kunStorageBackendSchema.optional(),
    sqlitePath: defaultPathSchema
  }).strict().optional(),
  contextCompaction: z.object({
    defaultSoftThreshold: z.number().int().positive().optional(),
    defaultHardThreshold: z.number().int().positive().optional(),
    summaryMode: kunCompactionSummaryModeSchema.optional(),
    summaryTimeoutMs: z.number().int().positive().max(120_000).optional(),
    summaryMaxTokens: z.number().int().positive().max(16_000).optional(),
    summaryInputMaxBytes: z.number().int().positive().max(8 * 1024 * 1024).optional()
  }).strict().optional(),
  runtimeTuning: z.object({
    toolStorm: z.object({
      enabled: z.boolean().optional(),
      windowSize: z.number().int().positive().max(128).optional(),
      threshold: z.number().int().min(2).max(128).optional()
    }).strict().optional(),
    toolArgumentRepair: z.object({
      maxStringBytes: z.number().int().positive().max(16 * 1024 * 1024).optional()
    }).strict().optional()
  }).strict().optional(),
  subagents: z.object({
    enabled: z.boolean().optional(),
    defaultModel: z.string().trim().min(1).max(128).optional(),
    defaultPreset: kunSubagentWorkflowPresetIdSchema.optional(),
    maxParallel: z.number().int().nonnegative().max(64).optional(),
    maxChildRuns: z.number().int().nonnegative().max(1_000).optional(),
    maxTotalChildTokens: z.number().int().nonnegative().max(10_000_000).optional(),
    maxChildCostUsd: z.number().nonnegative().max(10_000).optional(),
    perAgentTimeoutMs: z.number().int().nonnegative().max(600_000).optional(),
    workflowPresets: z.partialRecord(
      kunSubagentWorkflowPresetIdSchema,
      z.object({
        id: kunSubagentWorkflowPresetIdSchema.optional(),
        enabled: z.boolean().optional(),
        label: z.string().trim().min(1).max(80).optional(),
        defaultModel: z.string().trim().min(1).max(128).optional(),
        maxParallel: z.number().int().nonnegative().max(64).optional(),
        maxChildRuns: z.number().int().nonnegative().max(1_000).optional(),
        maxTotalChildTokens: z.number().int().nonnegative().max(10_000_000).optional(),
        maxChildCostUsd: z.number().nonnegative().max(10_000).optional(),
        perAgentTimeoutMs: z.number().int().nonnegative().max(600_000).optional()
      }).strict()
    ).optional()
  }).strict().optional(),
  automation: z.object({
    enabled: z.boolean().optional(),
    browserWorkbenchEnabled: z.boolean().optional(),
    localDevOnly: z.boolean().optional(),
    allowedHosts: z.array(z.string().trim().min(1).max(255)).max(128).optional(),
    permissions: z.object({
      browserNavigation: kunAutomationPermissionModeSchema.optional(),
      browserInteraction: kunAutomationPermissionModeSchema.optional(),
      screenshots: kunAutomationPermissionModeSchema.optional(),
      localFileAccess: kunAutomationPermissionModeSchema.optional(),
      appControl: kunAutomationPermissionModeSchema.optional()
    }).strict().optional(),
    auditLog: z.object({
      enabled: z.boolean().optional(),
      maxEntries: z.number().int().positive().max(10_000).optional()
    }).strict().optional()
  }).strict().optional(),
  automations: z.object({
    goal: z.object({
      enabled: z.boolean().optional(),
      model: z.string().trim().min(1).max(128).optional(),
      maxContinuationTurns: z.number().int().positive().max(500).optional(),
      blockedRetryAfterTurns: z.number().int().nonnegative().max(100).optional(),
      budget: z.object({
        maxIterations: z.number().int().positive().max(100).optional(),
        maxTokensPerEval: z.number().int().positive().max(65536).optional(),
        maxCostUsdPerEval: z.number().positive().max(10).optional(),
        totalMaxIterations: z.number().int().positive().max(10000).optional(),
        totalMaxTokens: z.number().int().positive().max(10_000_000).optional(),
        totalMaxCostUsd: z.number().positive().max(100).optional()
      }).strict().optional()
    }).strict().optional(),
    loop: z.object({
      enabled: z.boolean().optional(),
      defaultModel: z.string().trim().min(1).max(128).optional(),
      maxConcurrentLoops: z.number().int().positive().max(50).optional(),
      minIntervalMinutes: z.number().int().positive().max(1440).optional(),
      requireProjectId: z.boolean().optional()
    }).strict().optional()
  }).strict().optional(),
  userAgentStack: z.object({
    enabled: z.boolean().optional(),
    importedAt: z.string().max(128).optional(),
    refreshedAt: z.string().max(128).optional(),
    sourcePaths: z.array(z.string().trim().min(1).max(MAX_PATH_LENGTH)).max(512).optional(),
    skillRoots: z.array(z.object({
      path: z.string().trim().min(1).max(MAX_PATH_LENGTH),
      scope: z.enum(['project', 'user', 'plugin']),
      source: z.string().trim().min(1).max(128),
      available: z.boolean()
    }).strict()).max(512).optional(),
    mcpServers: z.array(z.object({
      id: z.string().trim().min(1).max(MAX_ID_LENGTH),
      enabled: z.boolean(),
      transport: z.enum(['stdio', 'streamable-http', 'sse']),
      command: z.string().trim().min(1).max(MAX_PATH_LENGTH).optional(),
      args: z.array(z.string().max(MAX_BODY_BYTES)).max(256).optional(),
      url: z.string().trim().max(MAX_URL_LENGTH).optional(),
      headers: z.record(z.string().min(1).max(512), z.string().max(MAX_BODY_BYTES)).optional(),
      env: z.record(z.string().min(1).max(512), z.string().max(MAX_BODY_BYTES)).optional(),
      trustScope: z.enum(['user', 'workspace']),
      trustedWorkspaceRoots: z.array(z.string().trim().min(1).max(MAX_PATH_LENGTH)).max(256).optional(),
      timeoutMs: z.number().int().positive().max(600_000).optional(),
      sourcePath: z.string().trim().max(MAX_PATH_LENGTH).optional()
    }).strict()).max(512).optional(),
    cli: z.array(z.object({
      name: z.string().trim().min(1).max(128),
      available: z.boolean(),
      path: z.string().trim().max(MAX_PATH_LENGTH).optional(),
      version: z.string().max(2048).optional(),
      message: z.string().max(2048).optional()
    }).strict()).max(128).optional(),
    redactedPreviewJson: z.string().max(MAX_BODY_BYTES).optional(),
    validationErrors: z.array(z.object({
      source: z.string().max(MAX_PATH_LENGTH),
      message: z.string().max(2048)
    }).strict()).max(512).optional()
  }).strict().optional(),
  terminal: z.object({
    enabled: z.boolean().optional()
  }).strict().optional(),
  checkpoints: z.object({
    maxPerThread: z.number().int().nonnegative().max(1000).optional(),
    maxTotal: z.number().int().nonnegative().max(10000).optional(),
    autoBeforeMutation: z.boolean().optional()
  }).strict().optional(),
  hooks: z.object({
    enabled: z.boolean().optional(),
    defaultTimeoutMs: z.number().int().positive().max(120_000).optional(),
    maxOutputBytes: z.number().int().positive().max(8 * 1024 * 1024).optional(),
    maxAuditEvents: z.number().int().positive().max(10_000).optional(),
    trustedHooks: z.record(z.string().min(1).max(MAX_ID_LENGTH), z.object({
      id: z.string().min(1).max(MAX_ID_LENGTH).optional(),
      scriptPath: z.string().max(MAX_PATH_LENGTH).optional(),
      pinnedContent: z.string().max(MAX_BODY_BYTES).optional(),
      contentHash: z.string().max(128).optional(),
      scope: z.enum(['user', 'project']).optional(),
      approvedAt: z.string().max(128).optional(),
      trusted: z.boolean().optional()
    }).strict()).optional(),
    auditLog: z.array(z.object({
      hookId: z.string().min(1).max(MAX_ID_LENGTH),
      phase: z.string().min(1).max(128),
      startedAt: z.string().max(128),
      durationMs: z.number().int().nonnegative(),
      exitCode: z.number().int().nullable(),
      signal: z.string().max(64).nullable(),
      stdoutBytes: z.number().int().nonnegative(),
      stderrBytes: z.number().int().nonnegative(),
      decision: z.enum(['allow', 'deny']).optional(),
      error: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional()
    }).strict()).max(200).optional()
  }).strict().optional(),
  remoteRunners: z.object({
    enabled: z.boolean().optional(),
    hosts: z.array(z.object({
      id: z.string().trim().min(1).max(MAX_ID_LENGTH),
      label: z.string().trim().min(1).max(200),
      enabled: z.boolean(),
      endpointRef: z.string().trim().min(1).max(MAX_ID_LENGTH),
      usernameRef: z.string().trim().max(MAX_ID_LENGTH).optional(),
      credentialStorage: z.object({
        kind: z.enum(['none', 'os-keychain', 'ssh-agent', 'secret-manager']),
        credentialRef: z.string().max(MAX_ID_LENGTH).optional(),
        exportsRawSecret: z.literal(false)
      }).strict(),
      hostKeyPolicy: z.enum(['known-hosts', 'pinned-fingerprint-ref', 'manual-confirm']),
      connectionStatus: z.enum(['disconnected', 'connecting', 'handshaking', 'connected', 'error']).default('disconnected'),
      lastHandshake: z.union([
        z.object({
          issuedAt: z.string().trim().min(1).max(128),
          shell: z.object({ os: z.string(), shell: z.string() }).strict(),
          gitAvailable: z.boolean(),
          toolPolicy: z.record(z.string(), z.string())
        }).strict(),
        z.null()
      ]).optional(),
      lastHandshakeError: z.string().max(MAX_CHANNEL_TEXT_LENGTH).nullable().optional(),
      trustedPaths: z.array(z.object({
        path: z.string().trim().min(1).max(MAX_PATH_LENGTH),
        label: z.string().trim().min(1).max(200),
        trustedAt: z.string().max(128),
        auditId: z.string().max(MAX_ID_LENGTH)
      }).strict()).max(200).default([])
    }).strict()).max(50).optional(),
    dataPolicy: z.object({
      defaultAllowed: z.array(z.string().max(100)).max(32).optional(),
      consentRequired: z.array(z.string().max(100)).max(32).optional(),
      never: z.array(z.string().max(100)).max(32).optional()
    }).strict().optional(),
    auditLog: z.array(z.object({
      id: z.string().min(1).max(MAX_ID_LENGTH),
      timestamp: z.string().max(128),
      runnerId: z.string().max(MAX_ID_LENGTH),
      runId: z.string().max(MAX_ID_LENGTH).optional(),
      actor: z.enum(['host', 'remote-client', 'policy', 'runner']),
      action: z.string().min(1).max(256),
      outcome: z.enum(['requested', 'allowed', 'denied', 'blocked', 'completed', 'failed']),
      payloadRedaction: z.enum(['metadata', 'summary', 'selected_excerpt', 'explicit_full']),
      consentId: z.string().max(MAX_ID_LENGTH).optional(),
      reason: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional()
    }).strict()).max(500).optional(),
    maxAuditEntries: z.number().int().positive().max(10_000).optional()
  }).strict().optional()
}).strict()

export const userAgentStackImportPayloadSchema = z.object({
  workspaceRoot: z.string().trim().max(MAX_PATH_LENGTH).optional()
}).strict()

const logPatchSchema = z.object({
  enabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(365).optional()
}).strict()

const notificationsPatchSchema = z.object({
  turnComplete: z.boolean().optional()
}).strict()

const appBehaviorPatchSchema = z.object({
  openAtLogin: z.boolean().optional(),
  startMinimized: z.boolean().optional(),
  closeToTray: z.boolean().optional()
}).strict()

const keyboardShortcutCommandIds = KEYBOARD_SHORTCUT_COMMANDS.map((command) => command.id) as [
  typeof KEYBOARD_SHORTCUT_COMMANDS[number]['id'],
  ...Array<typeof KEYBOARD_SHORTCUT_COMMANDS[number]['id']>
]

const keyboardShortcutsPatchSchema = z.object({
  bindings: z.partialRecord(
    z.enum(keyboardShortcutCommandIds),
    z.array(z.string().trim().max(64)).max(4)
  ).optional()
}).strict()

const writeInlineCompletionPatchSchema = z.object({
  enabled: z.boolean().optional(),
  retrievalEnabled: z.boolean().optional(),
  longCompletionEnabled: z.boolean().optional(),
  apiKey: z.string().max(MAX_BODY_BYTES).optional(),
  baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  inheritModel: z.boolean().optional(),
  model: writeInlineCompletionModelSchema.optional(),
  debounceMs: z.number().int().min(150).max(5_000).optional(),
  longDebounceMs: z.number().int().min(1_000).max(15_000).optional(),
  minAcceptScore: z.number().min(0.1).max(0.95).optional(),
  longMinAcceptScore: z.number().min(0.1).max(0.95).optional(),
  maxTokens: z.number().int().min(16).max(512).optional(),
  longMaxTokens: z.number().int().min(64).max(1_024).optional()
}).strict()

const writeSettingsPatchSchema = z.object({
  defaultWorkspaceRoot: defaultPathSchema,
  activeWorkspaceRoot: defaultPathSchema,
  workspaces: z.array(trimmedString(MAX_PATH_LENGTH)).max(256).optional(),
  inlineCompletion: writeInlineCompletionPatchSchema.optional()
}).strict()

const clawSkillPatchSchema = z.object({
  defaultNames: z.array(trimmedString(128)).max(128).optional(),
  extraDirs: z.array(trimmedString(MAX_PATH_LENGTH)).max(128).optional(),
  promptPrefix: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional()
}).strict()

const clawImPatchSchema = z.object({
  enabled: z.boolean().optional(),
  provider: clawImProviderSchema.optional(),
  port: z.number().int().min(1024).max(65_535).optional(),
  path: trimmedString(MAX_PATH_LENGTH).optional(),
  secret: z.string().max(MAX_BODY_BYTES).optional(),
  weixinBridgeUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  openClawGatewayUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  model: z.string().trim().min(1).max(128).optional(),
  mode: clawRunModeSchema.optional(),
  responseTimeoutMs: z.number().int().min(5_000).max(600_000).optional()
}).strict()

const clawImAgentProfilePatchSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2_000).optional(),
  identity: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  personality: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  userContext: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  replyRules: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional()
}).strict()

const clawImPlatformCredentialPatchSchema = z.union([
  z.object({
    kind: z.literal('feishu').optional(),
    appId: z.string().max(512).optional(),
    appSecret: z.string().max(MAX_BODY_BYTES).optional(),
    domain: z.string().max(512).optional(),
    createdAt: z.string().max(128).optional()
  }).strict(),
  z.object({
    kind: z.literal('weixin'),
    accountId: z.string().max(512).optional(),
    sessionKey: z.string().max(MAX_BODY_BYTES).optional(),
    createdAt: z.string().max(128).optional()
  }).strict()
])

const clawImRemoteSessionPatchSchema = z.object({
  chatId: z.string().max(MAX_ID_LENGTH).optional(),
  messageId: z.string().max(MAX_ID_LENGTH).optional(),
  threadId: z.string().max(MAX_ID_LENGTH).optional(),
  senderId: z.string().max(MAX_ID_LENGTH).optional(),
  senderName: z.string().max(512).optional(),
  updatedAt: z.string().max(128).optional()
}).strict()

const clawImConversationPatchSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  chatId: z.string().max(MAX_ID_LENGTH).optional(),
  remoteThreadId: z.string().max(MAX_ID_LENGTH).optional(),
  latestMessageId: z.string().max(MAX_ID_LENGTH).optional(),
  senderId: z.string().max(MAX_ID_LENGTH).optional(),
  senderName: z.string().max(512).optional(),
  localThreadId: z.string().max(MAX_ID_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional()
}).strict()

const clawImChannelPatchSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  provider: clawImProviderSchema.optional(),
  label: z.string().max(512).optional(),
  enabled: z.boolean().optional(),
  model: z.string().trim().min(1).max(128).optional(),
  threadId: z.string().max(MAX_ID_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  agentProfile: clawImAgentProfilePatchSchema.optional(),
  platformCredential: clawImPlatformCredentialPatchSchema.optional(),
  remoteSession: clawImRemoteSessionPatchSchema.optional(),
  conversations: z.array(clawImConversationPatchSchema).max(512).optional(),
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional()
}).strict()

const clawTaskSchedulePatchSchema = z.object({
  kind: clawScheduleKindSchema.optional(),
  everyMinutes: z.number().int().min(1).max(10_080).optional(),
  timeOfDay: z.string().max(16).optional(),
  atTime: z.string().max(128).optional()
}).strict()

const clawTaskPatchSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  title: z.string().max(512).optional(),
  enabled: z.boolean().optional(),
  prompt: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  model: z.string().trim().min(1).max(128).optional(),
  reasoningEffort: scheduleReasoningEffortSchema.optional(),
  mode: clawRunModeSchema.optional(),
  schedule: clawTaskSchedulePatchSchema.optional(),
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional(),
  lastRunAt: z.string().max(128).optional(),
  nextRunAt: z.string().max(128).optional(),
  lastStatus: clawTaskStatusSchema.optional(),
  lastMessage: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  lastThreadId: z.string().max(MAX_ID_LENGTH).optional()
}).strict()

const clawSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  skills: clawSkillPatchSchema.optional(),
  im: clawImPatchSchema.optional(),
  channels: z.array(clawImChannelPatchSchema).max(512).optional(),
  tasks: z.array(clawTaskPatchSchema).max(512).optional()
}).strict()

const scheduleSkillPatchSchema = z.object({
  defaultNames: z.array(trimmedString(128)).max(128).optional(),
  extraDirs: z.array(trimmedString(MAX_PATH_LENGTH)).max(128).optional()
}).strict()

const scheduleInternalPatchSchema = z.object({
  port: z.number().int().min(1024).max(65_535).optional(),
  secret: z.string().max(MAX_BODY_BYTES).optional()
}).strict()

const scheduledTaskSchedulePatchSchema = z.object({
  kind: clawScheduleKindSchema.optional(),
  everyMinutes: z.number().int().min(1).max(10_080).optional(),
  timeOfDay: z.string().max(16).optional(),
  atTime: z.string().max(128).optional()
}).strict()

const scheduledTaskPatchSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  title: z.string().max(512).optional(),
  enabled: z.boolean().optional(),
  prompt: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  workspaceRoot: defaultPathSchema,
  model: z.string().trim().min(1).max(128).optional(),
  reasoningEffort: scheduleReasoningEffortSchema.optional(),
  mode: clawRunModeSchema.optional(),
  schedule: scheduledTaskSchedulePatchSchema.optional(),
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional(),
  lastRunAt: z.string().max(128).optional(),
  nextRunAt: z.string().max(128).optional(),
  lastStatus: clawTaskStatusSchema.optional(),
  lastMessage: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  lastThreadId: z.string().max(MAX_ID_LENGTH).optional()
}).strict()

const scheduleSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  defaultWorkspaceRoot: defaultPathSchema,
  model: z.union([z.enum(SCHEDULE_MODEL_IDS), trimmedString(128)]).optional(),
  mode: clawRunModeSchema.optional(),
  promptPrefix: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional(),
  skills: scheduleSkillPatchSchema.optional(),
  keepAwake: z.boolean().optional(),
  internal: scheduleInternalPatchSchema.optional(),
  tasks: z.array(scheduledTaskPatchSchema).max(512).optional()
}).strict()

function stripLegacySettingsPatchKeys(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const source = payload as Record<string, unknown>
  const next: Record<string, unknown> = { ...source }

  delete next.agentProvider
  delete next.deepseek
  delete next.reasonix
  delete next.quickChat

  if (typeof next.agents === 'object' && next.agents !== null && !Array.isArray(next.agents)) {
    const agents = { ...(next.agents as Record<string, unknown>) }
    delete agents.codewhale
    delete agents.reasonix
    delete agents.quickChat
    next.agents = agents
  }

  return next
}

const settingsPatchObjectSchema = z.object({
  version: z.literal(1).optional(),
  locale: localeSchema.optional(),
  theme: themeSchema.optional(),
  uiFontScale: uiFontScaleSchema.optional(),
  provider: modelProviderPatchSchema.optional(),
  agents: z.object({
    kun: kunRuntimePatchSchema.optional()
  }).strict().optional(),
  workspaceRoot: defaultPathSchema,
  log: logPatchSchema.optional(),
  notifications: notificationsPatchSchema.optional(),
  appBehavior: appBehaviorPatchSchema.optional(),
  keyboardShortcuts: keyboardShortcutsPatchSchema.optional(),
  write: writeSettingsPatchSchema.optional(),
  claw: clawSettingsPatchSchema.optional(),
  schedule: scheduleSettingsPatchSchema.optional(),
  guiUpdate: z.object({
    channel: z.enum(GUI_UPDATE_CHANNELS).optional()
  }).strict().optional(),
  codePromptPrefix: z.string().max(MAX_CHANNEL_TEXT_LENGTH).optional()
}).strict()

export const settingsPatchSchema = z.preprocess(stripLegacySettingsPatchKeys, settingsPatchObjectSchema)

export const skillSaveFilePayloadSchema = z
  .object({
    rootPath: trimmedString(MAX_PATH_LENGTH),
    skillName: trimmedString(128),
    content: z.string().max(MAX_SKILL_FILE_BYTES)
  })
  .strict()

export const skillListPayloadSchema = z
  .object({
    workspaceRoot: z.string().trim().max(MAX_PATH_LENGTH).optional()
  })
  .strict()

export const phase7DiagnosticsPayloadSchema = z
  .object({
    workspaceRoot: z.string().trim().max(MAX_PATH_LENGTH).optional()
  })
  .strict()

export const rootPathSchema = trimmedString(MAX_PATH_LENGTH)
export const deepseekConfigContentSchema = z.string().max(MAX_CONFIG_FILE_BYTES)

export const workspaceRootSchema = trimmedString(MAX_PATH_LENGTH)
export const gitBranchPayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    branch: trimmedString(MAX_BRANCH_LENGTH)
  })
  .strict()

export const managedGitWorktreeCreatePayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    branch: trimmedString(MAX_BRANCH_LENGTH),
    baseBranch: optionalTrimmedString(MAX_BRANCH_LENGTH),
    worktreeParent: optionalTrimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const managedGitWorktreeRemovePayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    path: trimmedString(MAX_PATH_LENGTH),
    confirmation: optionalTrimmedString(MAX_ID_LENGTH),
    snapshotParent: optionalTrimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const managedGitWorktreeHandoffPayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    path: trimmedString(MAX_PATH_LENGTH),
    threadId: optionalTrimmedString(MAX_ID_LENGTH),
    goal: optionalTrimmedString(MAX_BODY_BYTES)
  })
  .strict()

export const gitPathListPayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    paths: z.array(trimmedString(MAX_PATH_LENGTH)).min(1).max(200)
  })
  .strict()

export const gitDiscardPayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    paths: z.array(trimmedString(MAX_PATH_LENGTH)).min(1).max(200),
    confirmation: optionalTrimmedString(MAX_ID_LENGTH)
  })
  .strict()

export const gitReviewPreparationPayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    commitMessage: optionalTrimmedString(512),
    remote: optionalTrimmedString(MAX_BRANCH_LENGTH),
    baseBranch: optionalTrimmedString(MAX_BRANCH_LENGTH)
  })
  .strict()

export const gitAuditLogPayloadSchema = z
  .object({
    workspaceRoot: workspaceRootSchema,
    limit: z.number().int().positive().max(500).optional()
  })
  .strict()

export const openEditorPathPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    editorId: optionalTrimmedString(MAX_EDITOR_ID_LENGTH),
    line: z.number().int().positive().max(1_000_000).optional(),
    column: z.number().int().positive().max(1_000_000).optional()
  })
  .strict()

export const workspaceFileTargetPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    line: z.number().int().positive().max(1_000_000).optional(),
    column: z.number().int().positive().max(1_000_000).optional()
  })
  .strict()

export const workspaceDirectoryTargetPayloadSchema = z
  .object({
    path: optionalTrimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const workspaceFileWritePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    content: z.string().max(MAX_BODY_BYTES)
  })
  .strict()

export const workspaceFileCreatePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    content: z.string().max(MAX_BODY_BYTES).optional()
  })
  .strict()

export const workspaceDirectoryCreatePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const workspaceClipboardImageSavePayloadSchema = z
  .object({
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    currentFilePath: trimmedString(MAX_PATH_LENGTH),
    imageDirectory: optionalTrimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const workspaceEntryRenamePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH),
    newName: trimmedString(255)
  })
  .strict()

export const workspaceEntryDeletePayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const workspaceFileWatchPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: trimmedString(MAX_PATH_LENGTH)
  })
  .strict()

export const writeExportPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    format: z.enum(WRITE_EXPORT_FORMATS),
    content: z.string().max(MAX_BODY_BYTES)
  })
  .strict()

export const writeRichClipboardPayloadSchema = z
  .object({
    path: trimmedString(MAX_PATH_LENGTH),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    content: z.string().max(MAX_BODY_BYTES)
  })
  .strict()

const writeInlineEditRecentEditSchema = z
  .object({
    source: z.enum(['user', 'inline-edit']),
    ageMs: z.number().int().min(0).max(24 * 60 * 60 * 1_000),
    filePath: optionalTrimmedString(MAX_PATH_LENGTH),
    from: z.number().int().min(0).max(MAX_BODY_BYTES),
    to: z.number().int().min(0).max(MAX_BODY_BYTES),
    deletedText: z.string().max(8_000),
    insertedText: z.string().max(8_000),
    beforeContext: z.string().max(4_000),
    afterContext: z.string().max(4_000),
    instruction: z.string().trim().min(1).max(10_000).optional(),
    scopeKind: z.enum(['selection', 'paragraph']).optional()
  })
  .strict()
  .refine((edit) => edit.to >= edit.from, {
    message: 'Recent edit end must be greater than or equal to start.'
  })

const writeInlineCompletionEditCandidateSchema = z
  .object({
    kind: z.enum(['selection', 'paragraph']),
    from: z.number().int().min(0).max(MAX_BODY_BYTES),
    to: z.number().int().min(0).max(MAX_BODY_BYTES),
    startLine: z.number().int().positive().max(1_000_000),
    startColumn: z.number().int().positive().max(1_000_000),
    endLine: z.number().int().positive().max(1_000_000),
    endColumn: z.number().int().positive().max(1_000_000),
    original: z.string().max(MAX_EDITOR_COMPLETION_TEXT),
    selectedText: z.string().max(50_000).optional()
  })
  .strict()
  .refine((scope) => scope.to >= scope.from, {
    message: 'Completion edit candidate end must be greater than or equal to start.'
  })

export const writeInlineCompletionPayloadSchema = z
  .object({
    prefix: z.string().max(MAX_EDITOR_COMPLETION_TEXT),
    suffix: z.string().max(MAX_EDITOR_COMPLETION_TEXT),
    mode: z.enum(['short', 'long', 'edit']).optional(),
    workspaceRoot: optionalTrimmedString(MAX_PATH_LENGTH),
    currentFilePath: optionalTrimmedString(MAX_PATH_LENGTH),
    cursor: z
      .object({
        line: z.number().int().positive().max(1_000_000),
        column: z.number().int().min(0).max(1_000_000)
      })
      .strict(),
    context: z
      .object({
        language: trimmedString(64),
        currentLinePrefix: z.string().max(20_000),
        currentLineSuffix: z.string().max(20_000),
        previousLine: z.string().max(20_000),
        previousNonEmptyLine: z.string().max(20_000),
        nextLine: z.string().max(20_000),
        indentation: z.string().max(2_000),
        signals: z
          .object({
            list: z.boolean(),
            quote: z.boolean(),
            heading: z.boolean(),
            table: z.boolean(),
            atLineEnd: z.boolean(),
            endsWithSentencePunctuation: z.boolean(),
            previousLineEndsWithSentencePunctuation: z.boolean(),
            prefersNewLineCompletion: z.boolean(),
            paragraphBreakOpportunity: z.boolean()
          })
          .strict()
      })
      .strict(),
    policy: z
      .object({
        name: trimmedString(128),
        instruction: z.string().max(50_000),
        acceptanceCriteria: z.array(z.string().max(5_000)).max(12),
        rejectionCriteria: z.array(z.string().max(5_000)).max(12)
      })
      .strict(),
    preview: z
      .object({
        local: z.string().max(5_000),
        documentTail: z.string().max(20_000)
      })
      .strict(),
    editCandidate: writeInlineCompletionEditCandidateSchema.optional(),
    recentEdits: z.array(writeInlineEditRecentEditSchema).max(12).optional(),
    model: optionalTrimmedString(128)
  })
  .strict()

export const shellOpenExternalUrlSchema = trimmedString(MAX_URL_LENGTH).refine(
  isSafeOpenExternalUrl,
  { message: 'Only http, https, and mailto URLs are allowed.' }
)

export const notificationPayloadSchema = z
  .object({
    threadId: optionalTrimmedString(MAX_ID_LENGTH),
    title: trimmedString(MAX_NOTIFICATION_TITLE_LENGTH),
    body: trimmedString(MAX_NOTIFICATION_BODY_LENGTH)
  })
  .strict()

export const guiUpdateChannelSchema = z.enum(GUI_UPDATE_CHANNELS).optional()

export const desktopCommandSchema = z.enum(DESKTOP_COMMANDS)


export const logErrorPayloadSchema = z
  .object({
    category: trimmedString(128),
    message: trimmedString(2_000),
    detail: z.unknown().optional()
  })
  .strict()

export const clawMirrorPayloadSchema = z
  .object({
    threadId: trimmedString(MAX_ID_LENGTH),
    text: z.string().trim().min(1).max(MAX_CHANNEL_TEXT_LENGTH),
    direction: z.enum(['user', 'assistant'])
  })
  .strict()

export const clawTaskFromTextPayloadSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_CHANNEL_TEXT_LENGTH),
    channelId: z.string().trim().min(1).max(MAX_ID_LENGTH).nullable().optional(),
    modelHint: z.string().trim().min(1).max(128).nullable().optional(),
    mode: z.enum(['agent', 'plan']).nullable().optional()
  })
  .strict()

export const scheduleTaskFromTextPayloadSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_CHANNEL_TEXT_LENGTH),
    workspaceRoot: defaultPathSchema,
    modelHint: z.string().trim().min(1).max(128).nullable().optional(),
    mode: z.enum(['agent', 'plan']).nullable().optional()
  })
  .strict()

export const clawImInstallPollPayloadSchema = z
  .object({
    provider: clawImProviderSchema,
    deviceCode: trimmedString(MAX_DEVICE_CODE_LENGTH)
  })
  .strict()

export const sseStartPayloadSchema = z
  .object({
    threadId: trimmedString(MAX_ID_LENGTH),
    sinceSeq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    streamId: optionalTrimmedString(MAX_ID_LENGTH)
  })
  .strict()

export const streamIdSchema = trimmedString(MAX_ID_LENGTH)

export const terminalSpawnPayloadSchema = z
  .object({
    cwd: optionalTrimmedString(MAX_PATH_LENGTH),
    cols: z.number().int().min(10).max(500).optional(),
    rows: z.number().int().min(4).max(200).optional()
  })
  .strict()

export const terminalWritePayloadSchema = z
  .object({
    sessionId: streamIdSchema,
    data: z.string().max(10_000)
  })
  .strict()

export const terminalResizePayloadSchema = z
  .object({
    sessionId: streamIdSchema,
    cols: z.number().int().min(10).max(500),
    rows: z.number().int().min(4).max(200)
  })
  .strict()

export const terminalSessionIdSchema = z
  .object({
    sessionId: streamIdSchema
  })
  .strict()

export const terminalAgentExecObservedPayloadSchema = z
  .object({
    threadId: optionalTrimmedString(MAX_ID_LENGTH),
    turnId: optionalTrimmedString(MAX_ID_LENGTH),
    toolName: optionalTrimmedString(128),
    toolKind: optionalTrimmedString(128),
    summary: z.string().trim().max(2000).optional(),
    outputTruncated: z.string().trim().max(10000).optional(),
    exitCode: z.number().int().optional()
  })
  .strict()

export const hooksStatePayloadSchema = z
  .object({
    workspaceRoot: z.string().trim().max(MAX_PATH_LENGTH).optional()
  })
  .strict()

export const hookApprovePayloadSchema = z
  .object({
    hookId: trimmedString(MAX_ID_LENGTH),
    workspaceRoot: z.string().trim().max(MAX_PATH_LENGTH).optional()
  })
  .strict()

export const hookRevokePayloadSchema = z
  .object({
    hookId: trimmedString(MAX_ID_LENGTH)
  })
  .strict()

export const hookSourcePayloadSchema = z
  .object({
    hookId: trimmedString(MAX_ID_LENGTH),
    workspaceRoot: z.string().trim().max(MAX_PATH_LENGTH).optional()
  })
  .strict()

export const hooksKillSwitchPayloadSchema = z
  .object({
    enabled: z.boolean()
  })
  .strict()

export const remoteRunnerExecPayloadSchema = z
  .object({
    hostId: z.string().trim().min(1).max(MAX_ID_LENGTH),
    command: z.string().trim().min(1).max(MAX_CHANNEL_TEXT_LENGTH),
    cwd: z.string().trim().max(MAX_PATH_LENGTH).optional(),
    timeoutMs: z.number().int().positive().max(86_400_000).optional(),
    maxOutputBytes: z.number().int().positive().max(10_000_000).optional()
  })
  .strict()

export const remoteRunnerStopPayloadSchema = z
  .object({
    hostId: z.string().trim().min(1).max(MAX_ID_LENGTH)
  })
  .strict()

export const remoteRunnerResumePayloadSchema = z
  .object({
    hostId: z.string().trim().min(1).max(MAX_ID_LENGTH)
  })
  .strict()
