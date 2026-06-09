import {
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_KUN_DATA_DIR,
  DEFAULT_KUN_MODEL,
  DEFAULT_KUN_PORT,
  DEFAULT_SANDBOX_MODE,
  type AppSettingsV1,
  type KunContextCompactionSettingsV1,
  type KunHistoryHygieneSettingsV1,
  type KunMcpSearchSettingsV1,
  type KunRuntimeTuningSettingsV1,
  type KunRuntimeSettingsPatchV1,
  type KunRuntimeSettingsV1,
  type KunSettingsEnvelopePatchV1,
  type KunSettingsEnvelopeV1,
  type KunAutomationAuditLogSettingsV1,
  type KunAutomationPermissionModeV1,
  type KunAutomationPermissionsV1,
  type KunAutomationSettingsV1,
  type KunStorageSettingsV1,
  type KunSubagentSettingsV1,
  type KunSubagentWorkflowPresetIdV1,
  type KunSubagentWorkflowPresetSettingsV1,
  type KunTokenEconomySettingsV1,
  type UserAgentStackCliStatusV1,
  type UserAgentStackMcpServerV1,
  type UserAgentStackProfileV1,
  type UserAgentStackSkillRootV1,
  type UserAgentStackValidationErrorV1,
  type ModelProviderSettingsV1,
  type ApprovalPolicy,
  type SandboxMode
} from './app-settings-types'
import {
  normalizeModelProviderSettings,
  resolveKunRuntimeSettings
} from './app-settings-provider'
import { compactStrings } from './app-settings-normalizers'

const LEGACY_COREAGENT_DATA_DIR = '~/.deepseekgui/coreagent'
const LEGACY_KUN_DATA_DIR = '~/.deepseekgui/kun'
const LEGACY_KUN_DEFAULT_MODEL = 'deepseek-chat'
const LEGACY_LOCAL_HTTP_DEFAULT_PORT = 7878
const DEFAULT_KUN_CHILD_MODEL = 'deepseek-v4-flash'
const DEFAULT_KUN_AUTOMATION_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1']
const SUBAGENT_WORKFLOW_PRESET_IDS = [
  'review_swarm',
  'implementation_split',
  'research_split',
  'audit_split'
] as const

type LegacyLocalHttpRuntimeSettingsV1 = {
  binaryPath: string
  port: number
  autoStart: boolean
  apiKey: string
  baseUrl: string
  runtimeToken: string
  extraCorsOrigins: string[]
  approvalPolicy: ApprovalPolicy
  sandboxMode: SandboxMode
}

type LegacyReasoningEffort = 'low' | 'medium' | 'high' | 'max'
type LegacyReasoningEditMode = 'review' | 'auto' | 'yolo' | 'plan'

type LegacyReasoningRuntimeSettingsV1 = {
  binaryPath: string
  autoStart: boolean
  apiKey: string
  baseUrl: string
  model: string
  reasoningEffort: LegacyReasoningEffort
  editMode: LegacyReasoningEditMode
}

/**
 * Kun runtime settings. Mirrors the `kun serve` CLI
 * options. It is the only active agent settings object the GUI
 * stores after legacy settings have been migrated.
 */
function legacyLocalHttpRuntimeDefaults(port = 7878): LegacyLocalHttpRuntimeSettingsV1 {
  return {
    binaryPath: '',
    port,
    autoStart: true,
    apiKey: '',
    baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    runtimeToken: '',
    extraCorsOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    sandboxMode: 'workspace-write'
  }
}

function legacyReasoningRuntimeDefaults(): LegacyReasoningRuntimeSettingsV1 {
  return {
    binaryPath: '',
    autoStart: true,
    apiKey: '',
    baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    model: LEGACY_KUN_DEFAULT_MODEL,
    reasoningEffort: 'medium',
    editMode: 'auto'
  }
}

export function defaultKunRuntimeSettings(
  port = DEFAULT_KUN_PORT
): KunRuntimeSettingsV1 {
  return {
    binaryPath: '',
    port,
    autoStart: true,
    apiKey: '',
    baseUrl: '',
    providerId: '',
    runtimeToken: '',
    dataDir: DEFAULT_KUN_DATA_DIR,
    model: DEFAULT_KUN_MODEL,
    approvalPolicy: DEFAULT_APPROVAL_POLICY,
    sandboxMode: DEFAULT_SANDBOX_MODE,
    tokenEconomyMode: false,
    tokenEconomy: defaultKunTokenEconomySettings(),
    insecure: false,
    mcpSearch: defaultKunMcpSearchSettings(),
    storage: defaultKunStorageSettings(),
    contextCompaction: defaultKunContextCompactionSettings(),
    runtimeTuning: defaultKunRuntimeTuningSettings(),
    userAgentStack: defaultUserAgentStackProfile(),
    subagents: defaultKunSubagentSettings(),
    automation: defaultKunAutomationSettings()
  }
}

export function defaultKunAutomationSettings(): KunAutomationSettingsV1 {
  return {
    enabled: false,
    browserWorkbenchEnabled: true,
    localDevOnly: true,
    allowedHosts: [...DEFAULT_KUN_AUTOMATION_ALLOWED_HOSTS],
    permissions: {
      browserNavigation: 'ask',
      browserInteraction: 'ask',
      screenshots: 'ask',
      localFileAccess: 'deny',
      appControl: 'deny'
    },
    auditLog: {
      enabled: true,
      maxEntries: 500
    }
  }
}

export function defaultKunSubagentSettings(): KunSubagentSettingsV1 {
  return {
    enabled: false,
    defaultModel: DEFAULT_KUN_CHILD_MODEL,
    defaultPreset: 'research_split',
    maxParallel: 2,
    maxChildRuns: 4,
    maxTotalChildTokens: 50_000,
    maxChildCostUsd: 1,
    perAgentTimeoutMs: 120_000,
    workflowPresets: {
      review_swarm: {
        id: 'review_swarm',
        enabled: true,
        label: 'Review swarm',
        defaultModel: DEFAULT_KUN_CHILD_MODEL,
        maxParallel: 4,
        maxChildRuns: 8,
        maxTotalChildTokens: 80_000,
        maxChildCostUsd: 1,
        perAgentTimeoutMs: 90_000
      },
      implementation_split: {
        id: 'implementation_split',
        enabled: true,
        label: 'Implementation split',
        defaultModel: DEFAULT_KUN_CHILD_MODEL,
        maxParallel: 2,
        maxChildRuns: 4,
        maxTotalChildTokens: 70_000,
        maxChildCostUsd: 1.5,
        perAgentTimeoutMs: 180_000
      },
      research_split: {
        id: 'research_split',
        enabled: true,
        label: 'Research split',
        defaultModel: DEFAULT_KUN_CHILD_MODEL,
        maxParallel: 3,
        maxChildRuns: 6,
        maxTotalChildTokens: 50_000,
        maxChildCostUsd: 1,
        perAgentTimeoutMs: 120_000
      },
      audit_split: {
        id: 'audit_split',
        enabled: true,
        label: 'Audit split',
        defaultModel: DEFAULT_KUN_CHILD_MODEL,
        maxParallel: 3,
        maxChildRuns: 6,
        maxTotalChildTokens: 80_000,
        maxChildCostUsd: 1.5,
        perAgentTimeoutMs: 150_000
      }
    }
  }
}

export function defaultUserAgentStackProfile(): UserAgentStackProfileV1 {
  const profile = {
    enabled: true,
    importedAt: '',
    refreshedAt: '',
    sourcePaths: [],
    skillRoots: [],
    mcpServers: [],
    cli: [],
    redactedPreviewJson: '',
    validationErrors: []
  }
  return {
    ...profile,
    redactedPreviewJson: JSON.stringify(profile, null, 2)
  }
}

export function defaultKunMcpSearchSettings(): KunMcpSearchSettingsV1 {
  return {
    enabled: false,
    mode: 'auto',
    autoThresholdToolCount: 24,
    topKDefault: 5,
    topKMax: 10,
    minScore: 0.15
  }
}

export function defaultKunTokenEconomySettings(): KunTokenEconomySettingsV1 {
  return {
    enabled: false,
    compressToolDescriptions: true,
    compressToolResults: true,
    conciseResponses: true,
    historyHygiene: defaultKunHistoryHygieneSettings()
  }
}

export function defaultKunHistoryHygieneSettings(): KunHistoryHygieneSettingsV1 {
  return {
    maxToolResultLines: 320,
    maxToolResultBytes: 32 * 1024,
    maxToolResultTokens: 8_000,
    maxToolArgumentStringBytes: 8 * 1024,
    maxToolArgumentStringTokens: 2_000,
    maxArrayItems: 80
  }
}

export function defaultKunStorageSettings(): KunStorageSettingsV1 {
  return {
    backend: 'hybrid',
    sqlitePath: ''
  }
}

export function defaultKunContextCompactionSettings(): KunContextCompactionSettingsV1 {
  return {
    defaultSoftThreshold: 16_000,
    defaultHardThreshold: 24_000,
    summaryMode: 'heuristic',
    summaryTimeoutMs: 15_000,
    summaryMaxTokens: 1_200,
    summaryInputMaxBytes: 96 * 1024
  }
}

export function defaultKunRuntimeTuningSettings(): KunRuntimeTuningSettingsV1 {
  return {
    toolStorm: {
      enabled: true,
      windowSize: 8,
      threshold: 3
    },
    toolArgumentRepair: {
      maxStringBytes: 512 * 1024
    }
  }
}

export function getKunRuntimeSettings(
  settings: AppSettingsV1
): KunRuntimeSettingsV1 {
  const raw = (settings as { agents?: { kun?: Partial<KunRuntimeSettingsV1> } }).agents?.kun
  return mergeKunRuntimeSettings(defaultKunRuntimeSettings(), raw)
}

export function kunSettingsEnvelope(
  kun: KunRuntimeSettingsV1
): KunSettingsEnvelopeV1 {
  return { kun }
}

export function kunSettingsPatch(
  kun: KunRuntimeSettingsPatchV1 | undefined
): KunSettingsEnvelopePatchV1 {
  return kun ? { kun } : {}
}

export function mergeKunRuntimeSettings(
  current: KunRuntimeSettingsV1,
  patch: KunRuntimeSettingsPatchV1 | undefined
): KunRuntimeSettingsV1 {
  const currentMcpSearch = normalizeKunMcpSearchSettings(current.mcpSearch)
  const nextMcpSearch = normalizeKunMcpSearchSettings({
    ...currentMcpSearch,
    ...(patch?.mcpSearch ?? {})
  })
  const currentTokenEconomy = normalizeKunTokenEconomySettings(
    current.tokenEconomy,
    current.tokenEconomyMode
  )
  const patchedTokenEconomy = normalizeKunTokenEconomySettings({
    ...currentTokenEconomy,
    ...(patch?.tokenEconomy ?? {}),
    historyHygiene: {
      ...currentTokenEconomy.historyHygiene,
      ...(patch?.tokenEconomy?.historyHygiene ?? {})
    }
  }, currentTokenEconomy.enabled)
  const tokenEconomyEnabled = typeof patch?.tokenEconomy?.enabled === 'boolean'
    ? patch.tokenEconomy.enabled
    : typeof patch?.tokenEconomyMode === 'boolean'
      ? patch.tokenEconomyMode
      : patchedTokenEconomy.enabled
  const nextTokenEconomy = {
    ...patchedTokenEconomy,
    enabled: tokenEconomyEnabled
  }
  const currentStorage = normalizeKunStorageSettings(current.storage)
  const nextStorage = normalizeKunStorageSettings({
    ...currentStorage,
    ...(patch?.storage ?? {})
  })
  const currentContextCompaction = normalizeKunContextCompactionSettings(current.contextCompaction)
  const nextContextCompaction = normalizeKunContextCompactionSettings({
    ...currentContextCompaction,
    ...(patch?.contextCompaction ?? {})
  })
  const currentRuntimeTuning = normalizeKunRuntimeTuningSettings(current.runtimeTuning)
  const nextRuntimeTuning = normalizeKunRuntimeTuningSettings({
    ...currentRuntimeTuning,
    ...(patch?.runtimeTuning
      ? {
          toolStorm: {
            ...currentRuntimeTuning.toolStorm,
            ...(patch.runtimeTuning.toolStorm ?? {})
          },
          toolArgumentRepair: {
            ...currentRuntimeTuning.toolArgumentRepair,
            ...(patch.runtimeTuning.toolArgumentRepair ?? {})
          }
        }
      : {})
  })
  const currentUserAgentStack = normalizeUserAgentStackProfile(current.userAgentStack)
  const nextUserAgentStack = normalizeUserAgentStackProfile({
    ...currentUserAgentStack,
    ...(patch?.userAgentStack ?? {})
  })
  const currentSubagents = normalizeKunSubagentSettings(current.subagents)
  const mergedSubagentWorkflowPresets = {} as Record<KunSubagentWorkflowPresetIdV1, KunSubagentWorkflowPresetSettingsV1>
  for (const id of SUBAGENT_WORKFLOW_PRESET_IDS) {
    mergedSubagentWorkflowPresets[id] = {
      ...currentSubagents.workflowPresets[id],
      ...(patch?.subagents?.workflowPresets?.[id] ?? {})
    }
  }
  const nextSubagents = normalizeKunSubagentSettings({
    ...currentSubagents,
    ...(patch?.subagents ?? {}),
    workflowPresets: mergedSubagentWorkflowPresets
  })
  const currentAutomation = normalizeKunAutomationSettings(current.automation)
  const nextAutomation = normalizeKunAutomationSettings({
    ...currentAutomation,
    ...(patch?.automation ?? {}),
    permissions: {
      ...currentAutomation.permissions,
      ...(patch?.automation?.permissions ?? {})
    },
    auditLog: {
      ...currentAutomation.auditLog,
      ...(patch?.automation?.auditLog ?? {})
    }
  })
  return {
    ...current,
    ...(patch ?? {}),
    tokenEconomyMode: nextTokenEconomy.enabled,
    tokenEconomy: nextTokenEconomy,
    mcpSearch: nextMcpSearch,
    storage: nextStorage,
    contextCompaction: nextContextCompaction,
    runtimeTuning: nextRuntimeTuning,
    userAgentStack: nextUserAgentStack,
    subagents: nextSubagents,
    automation: nextAutomation
  }
}

function normalizeKunAutomationSettings(
  input: Partial<KunAutomationSettingsV1> | undefined
): KunAutomationSettingsV1 {
  const defaults = defaultKunAutomationSettings()
  return {
    enabled: input?.enabled === true,
    browserWorkbenchEnabled: input?.browserWorkbenchEnabled !== false,
    localDevOnly: input?.localDevOnly !== false,
    allowedHosts: normalizeAutomationAllowedHosts(input?.allowedHosts),
    permissions: normalizeAutomationPermissions(input?.permissions),
    auditLog: normalizeAutomationAuditLogSettings(input?.auditLog)
  }
}

function normalizeAutomationPermissions(
  input: Partial<KunAutomationPermissionsV1> | undefined
): KunAutomationPermissionsV1 {
  const defaults = defaultKunAutomationSettings().permissions
  return {
    browserNavigation: normalizeAutomationPermissionMode(input?.browserNavigation, defaults.browserNavigation),
    browserInteraction: normalizeAutomationPermissionMode(input?.browserInteraction, defaults.browserInteraction),
    screenshots: normalizeAutomationPermissionMode(input?.screenshots, defaults.screenshots),
    localFileAccess: normalizeAutomationPermissionMode(input?.localFileAccess, defaults.localFileAccess),
    appControl: normalizeAutomationPermissionMode(input?.appControl, defaults.appControl)
  }
}

function normalizeAutomationAuditLogSettings(
  input: Partial<KunAutomationAuditLogSettingsV1> | undefined
): KunAutomationAuditLogSettingsV1 {
  const defaults = defaultKunAutomationSettings().auditLog
  return {
    enabled: input?.enabled !== false,
    maxEntries: boundedPositiveInt(input?.maxEntries, defaults.maxEntries, 10_000)
  }
}

function normalizeAutomationPermissionMode(
  value: unknown,
  fallback: KunAutomationPermissionModeV1
): KunAutomationPermissionModeV1 {
  return value === 'deny' || value === 'ask' || value === 'allow' ? value : fallback
}

function normalizeAutomationAllowedHosts(values: unknown): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const rawValues = Array.isArray(values) && values.length > 0
    ? values
    : DEFAULT_KUN_AUTOMATION_ALLOWED_HOSTS
  for (const value of rawValues) {
    if (typeof value !== 'string') continue
    const host = value.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
    if (!host || seen.has(host)) continue
    seen.add(host)
    out.push(host)
    if (out.length >= 128) break
  }
  return out.length > 0 ? out : [...DEFAULT_KUN_AUTOMATION_ALLOWED_HOSTS]
}

function normalizeKunSubagentSettings(
  input: Partial<KunSubagentSettingsV1> | undefined
): KunSubagentSettingsV1 {
  const defaults = defaultKunSubagentSettings()
  const defaultPreset = isSubagentPresetId(input?.defaultPreset)
    ? input.defaultPreset
    : defaults.defaultPreset
  const workflowPresets = {} as Record<KunSubagentWorkflowPresetIdV1, KunSubagentWorkflowPresetSettingsV1>
  for (const id of SUBAGENT_WORKFLOW_PRESET_IDS) {
    workflowPresets[id] = normalizeKunSubagentPreset(id, input?.workflowPresets?.[id], defaults.workflowPresets[id])
  }
  return {
    enabled: input?.enabled === true,
    defaultModel: nonEmptyTrimmedString(input?.defaultModel, defaults.defaultModel),
    defaultPreset,
    maxParallel: boundedPositiveIntClampZero(input?.maxParallel, defaults.maxParallel, 64),
    maxChildRuns: boundedPositiveInt(input?.maxChildRuns, defaults.maxChildRuns, 1_000),
    maxTotalChildTokens: boundedPositiveInt(input?.maxTotalChildTokens, defaults.maxTotalChildTokens, 10_000_000),
    maxChildCostUsd: boundedNonNegativeNumber(input?.maxChildCostUsd, defaults.maxChildCostUsd, 10_000),
    perAgentTimeoutMs: boundedPositiveInt(input?.perAgentTimeoutMs, defaults.perAgentTimeoutMs, 600_000),
    workflowPresets
  }
}

function normalizeKunSubagentPreset(
  id: KunSubagentWorkflowPresetIdV1,
  input: Partial<KunSubagentWorkflowPresetSettingsV1> | undefined,
  defaults: KunSubagentWorkflowPresetSettingsV1
): KunSubagentWorkflowPresetSettingsV1 {
  return {
    id,
    enabled: input?.enabled !== false,
    label: nonEmptyTrimmedString(input?.label, defaults.label),
    defaultModel: nonEmptyTrimmedString(input?.defaultModel, defaults.defaultModel),
    maxParallel: boundedPositiveIntClampZero(input?.maxParallel, defaults.maxParallel, 64),
    maxChildRuns: boundedPositiveInt(input?.maxChildRuns, defaults.maxChildRuns, 1_000),
    maxTotalChildTokens: boundedPositiveInt(input?.maxTotalChildTokens, defaults.maxTotalChildTokens, 10_000_000),
    maxChildCostUsd: boundedNonNegativeNumber(input?.maxChildCostUsd, defaults.maxChildCostUsd, 10_000),
    perAgentTimeoutMs: boundedPositiveInt(input?.perAgentTimeoutMs, defaults.perAgentTimeoutMs, 600_000)
  }
}

function isSubagentPresetId(value: unknown): value is KunSubagentWorkflowPresetIdV1 {
  return typeof value === 'string' && (SUBAGENT_WORKFLOW_PRESET_IDS as readonly string[]).includes(value)
}

function nonEmptyTrimmedString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeUserAgentStackProfile(
  input: Partial<UserAgentStackProfileV1> | undefined
): UserAgentStackProfileV1 {
  const defaults = defaultUserAgentStackProfile()
  const skillRoots = Array.isArray(input?.skillRoots)
    ? input.skillRoots.map(normalizeUserAgentStackSkillRoot).filter((item): item is UserAgentStackSkillRootV1 => item !== null)
    : defaults.skillRoots
  const mcpServers = Array.isArray(input?.mcpServers)
    ? input.mcpServers.map(normalizeUserAgentStackMcpServer).filter((item): item is UserAgentStackMcpServerV1 => item !== null)
    : defaults.mcpServers
  const cli = Array.isArray(input?.cli)
    ? input.cli.map(normalizeUserAgentStackCliStatus).filter((item): item is UserAgentStackCliStatusV1 => item !== null)
    : defaults.cli
  const validationErrors = Array.isArray(input?.validationErrors)
    ? input.validationErrors
      .map(normalizeUserAgentStackValidationError)
      .filter((item): item is UserAgentStackValidationErrorV1 => item !== null)
    : defaults.validationErrors
  const sourcePaths = compactStrings(input?.sourcePaths)
  const profile: UserAgentStackProfileV1 = {
    enabled: input?.enabled !== false,
    importedAt: typeof input?.importedAt === 'string' ? input.importedAt : defaults.importedAt,
    refreshedAt: typeof input?.refreshedAt === 'string' ? input.refreshedAt : defaults.refreshedAt,
    sourcePaths,
    skillRoots,
    mcpServers,
    cli,
    redactedPreviewJson: typeof input?.redactedPreviewJson === 'string'
      ? input.redactedPreviewJson
      : defaults.redactedPreviewJson,
    validationErrors
  }
  if (!profile.redactedPreviewJson.trim()) {
    profile.redactedPreviewJson = JSON.stringify({
      sourcePaths: profile.sourcePaths,
      skillRoots: profile.skillRoots,
      mcpServers: profile.mcpServers,
      cli: profile.cli,
      validationErrors: profile.validationErrors
    }, null, 2)
  }
  return profile
}

function normalizeUserAgentStackSkillRoot(value: unknown): UserAgentStackSkillRootV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<UserAgentStackSkillRootV1>
  const path = typeof raw.path === 'string' ? raw.path.trim() : ''
  if (!path) return null
  return {
    path,
    scope: raw.scope === 'project' || raw.scope === 'plugin' || raw.scope === 'user'
      ? raw.scope
      : 'user',
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : 'imported',
    available: raw.available !== false
  }
}

function normalizeUserAgentStackMcpServer(value: unknown): UserAgentStackMcpServerV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<UserAgentStackMcpServerV1>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const transport = raw.transport === 'stdio' || raw.transport === 'streamable-http' || raw.transport === 'sse'
    ? raw.transport
    : undefined
  if (!id || !transport) return null
  return {
    id,
    enabled: raw.enabled !== false,
    transport,
    ...(typeof raw.command === 'string' && raw.command.trim() ? { command: raw.command.trim() } : {}),
    args: compactStrings(raw.args),
    ...(typeof raw.url === 'string' && raw.url.trim() ? { url: raw.url.trim() } : {}),
    headers: stringRecord(raw.headers),
    env: stringRecord(raw.env),
    trustScope: raw.trustScope === 'workspace' ? 'workspace' : 'user',
    trustedWorkspaceRoots: compactStrings(raw.trustedWorkspaceRoots),
    ...(typeof raw.timeoutMs === 'number' && Number.isInteger(raw.timeoutMs) && raw.timeoutMs > 0
      ? { timeoutMs: raw.timeoutMs }
      : {}),
    ...(typeof raw.sourcePath === 'string' && raw.sourcePath.trim() ? { sourcePath: raw.sourcePath.trim() } : {})
  }
}

function normalizeUserAgentStackCliStatus(value: unknown): UserAgentStackCliStatusV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<UserAgentStackCliStatusV1>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  return {
    name,
    available: raw.available === true,
    ...(typeof raw.path === 'string' && raw.path.trim() ? { path: raw.path.trim() } : {}),
    ...(typeof raw.version === 'string' && raw.version.trim() ? { version: raw.version.trim() } : {}),
    ...(typeof raw.message === 'string' && raw.message.trim() ? { message: raw.message.trim() } : {})
  }
}

function normalizeUserAgentStackValidationError(value: unknown): UserAgentStackValidationErrorV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<UserAgentStackValidationErrorV1>
  const source = typeof raw.source === 'string' ? raw.source.trim() : ''
  const message = typeof raw.message === 'string' ? raw.message.trim() : ''
  return source && message ? { source, message } : null
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') out[key] = item
  }
  return out
}

function normalizeKunTokenEconomySettings(
  input: Partial<KunTokenEconomySettingsV1> | undefined,
  enabledFallback = false
): KunTokenEconomySettingsV1 {
  return {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : enabledFallback,
    compressToolDescriptions: input?.compressToolDescriptions !== false,
    compressToolResults: input?.compressToolResults !== false,
    conciseResponses: input?.conciseResponses !== false,
    historyHygiene: normalizeKunHistoryHygieneSettings(input?.historyHygiene)
  }
}

function normalizeKunHistoryHygieneSettings(
  input: Partial<KunHistoryHygieneSettingsV1> | undefined
): KunHistoryHygieneSettingsV1 {
  const defaults = defaultKunHistoryHygieneSettings()
  return {
    maxToolResultLines: boundedPositiveInt(input?.maxToolResultLines, defaults.maxToolResultLines, 100_000),
    maxToolResultBytes: boundedPositiveInt(input?.maxToolResultBytes, defaults.maxToolResultBytes, 8 * 1024 * 1024),
    maxToolResultTokens: boundedPositiveInt(input?.maxToolResultTokens, defaults.maxToolResultTokens, 256_000),
    maxToolArgumentStringBytes: boundedPositiveInt(
      input?.maxToolArgumentStringBytes,
      defaults.maxToolArgumentStringBytes,
      8 * 1024 * 1024
    ),
    maxToolArgumentStringTokens: boundedPositiveInt(
      input?.maxToolArgumentStringTokens,
      defaults.maxToolArgumentStringTokens,
      64_000
    ),
    maxArrayItems: boundedPositiveInt(input?.maxArrayItems, defaults.maxArrayItems, 10_000)
  }
}

function normalizeKunMcpSearchSettings(
  input: Partial<KunMcpSearchSettingsV1> | undefined
): KunMcpSearchSettingsV1 {
  const defaults = defaultKunMcpSearchSettings()
  const topKMax = positiveInt(input?.topKMax, defaults.topKMax)
  const topKDefault = Math.min(positiveInt(input?.topKDefault, defaults.topKDefault), topKMax)
  return {
    enabled: input?.enabled === true,
    mode: input?.mode === 'direct' || input?.mode === 'search' || input?.mode === 'auto'
      ? input.mode
      : defaults.mode,
    autoThresholdToolCount: positiveInt(input?.autoThresholdToolCount, defaults.autoThresholdToolCount),
    topKDefault,
    topKMax,
    minScore: nonNegativeNumber(input?.minScore, defaults.minScore)
  }
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

function boundedNonNegativeNumber(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return Math.min(value, max)
}

function boundedPositiveInt(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), max)
}

function boundedPositiveIntClampZero(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (value === 0) return 1
  return boundedPositiveInt(value, fallback, max)
}

function normalizeKunStorageSettings(
  input: Partial<KunStorageSettingsV1> | undefined
): KunStorageSettingsV1 {
  const defaults = defaultKunStorageSettings()
  return {
    backend: input?.backend === 'file' || input?.backend === 'hybrid'
      ? input.backend
      : defaults.backend,
    sqlitePath: typeof input?.sqlitePath === 'string' ? input.sqlitePath.trim() : defaults.sqlitePath
  }
}

function normalizeKunContextCompactionSettings(
  input: Partial<KunContextCompactionSettingsV1> | undefined
): KunContextCompactionSettingsV1 {
  const defaults = defaultKunContextCompactionSettings()
  const defaultSoftThreshold = boundedPositiveInt(input?.defaultSoftThreshold, defaults.defaultSoftThreshold)
  const requestedHardThreshold = boundedPositiveInt(input?.defaultHardThreshold, defaults.defaultHardThreshold)
  return {
    defaultSoftThreshold,
    defaultHardThreshold: Math.max(defaultSoftThreshold, requestedHardThreshold),
    summaryMode: input?.summaryMode === 'model' || input?.summaryMode === 'heuristic'
      ? input.summaryMode
      : defaults.summaryMode,
    summaryTimeoutMs: boundedPositiveInt(input?.summaryTimeoutMs, defaults.summaryTimeoutMs, 120_000),
    summaryMaxTokens: boundedPositiveInt(input?.summaryMaxTokens, defaults.summaryMaxTokens, 16_000),
    summaryInputMaxBytes: boundedPositiveInt(input?.summaryInputMaxBytes, defaults.summaryInputMaxBytes, 8 * 1024 * 1024)
  }
}

function normalizeKunRuntimeTuningSettings(
  input: Partial<KunRuntimeTuningSettingsV1> | undefined
): KunRuntimeTuningSettingsV1 {
  const defaults = defaultKunRuntimeTuningSettings()
  return {
    toolStorm: {
      enabled: input?.toolStorm?.enabled !== false,
      windowSize: boundedPositiveInt(input?.toolStorm?.windowSize, defaults.toolStorm.windowSize, 128),
      threshold: Math.max(2, boundedPositiveInt(input?.toolStorm?.threshold, defaults.toolStorm.threshold, 128))
    },
    toolArgumentRepair: {
      maxStringBytes: boundedPositiveInt(
        input?.toolArgumentRepair?.maxStringBytes,
        defaults.toolArgumentRepair.maxStringBytes,
        16 * 1024 * 1024
      )
    }
  }
}

export function withKunRuntimeSettings(
  settings: AppSettingsV1,
  kun: KunRuntimeSettingsV1
): AppSettingsV1 {
  return {
    ...settings,
    agents: kunSettingsEnvelope(kun)
  }
}

export function applyKunRuntimePatch(
  settings: AppSettingsV1,
  patch: KunRuntimeSettingsPatchV1 | undefined
): AppSettingsV1 {
  return withKunRuntimeSettings(
    settings,
    mergeKunRuntimeSettings(getKunRuntimeSettings(settings), patch)
  )
}

export function isKunRuntimeInsecure(runtime: Pick<KunRuntimeSettingsV1, 'insecure' | 'runtimeToken'>): boolean {
  return runtime.insecure || !runtime.runtimeToken.trim()
}

export function getActiveAgentApiKey(settings: AppSettingsV1): string {
  return resolveKunRuntimeSettings(settings).apiKey?.trim() ?? ''
}

export function mergeAgentRuntimeSettings(
  defaults: KunSettingsEnvelopeV1,
  patch: KunSettingsEnvelopePatchV1 | undefined
): KunSettingsEnvelopeV1 {
  return kunSettingsEnvelope(
    mergeKunRuntimeSettings(defaults.kun, patch?.kun)
  )
}

type LegacyAgentsSettingsShape = {
  kun?: Partial<KunRuntimeSettingsV1>
  codewhale?: Partial<LegacyLocalHttpRuntimeSettingsV1>
  reasonix?: Partial<LegacyReasoningRuntimeSettingsV1>
}

type LegacyAppSettingsShape = Partial<Omit<AppSettingsV1, 'agents' | 'provider'>> & {
  agents?: LegacyAgentsSettingsShape
  provider?: Partial<ModelProviderSettingsV1>
  deepseek?: Partial<LegacyLocalHttpRuntimeSettingsV1>
  /** Legacy single-provider discriminator. Read only inside migration. */
  agentProvider?: unknown
}

function nonEmptyStringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function upgradeLegacyKunDefaultDataDir(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_KUN_DATA_DIR
  const trimmed = value.trim()
  const normalized = trimmed.replace(/\\/g, '/').toLowerCase()
  if (
    !trimmed ||
    normalized === LEGACY_COREAGENT_DATA_DIR ||
    normalized === LEGACY_KUN_DATA_DIR ||
    normalized.endsWith('/.deepseekgui/coreagent') ||
    normalized.endsWith('/.deepseekgui/kun')
  ) {
    return DEFAULT_KUN_DATA_DIR
  }
  return trimmed
}

function upgradeLegacyKunDefaultModel(value: unknown, fallback: string): string {
  const model = nonEmptyStringOrFallback(value, fallback).trim()
  return model === LEGACY_KUN_DEFAULT_MODEL ? DEFAULT_KUN_MODEL : model
}

function upgradeLegacyKunDefaultPort(value: unknown, fallback: number): number {
  return value === LEGACY_LOCAL_HTTP_DEFAULT_PORT ? DEFAULT_KUN_PORT : fallback
}

export function migrateLegacyAppSettings(parsed: LegacyAppSettingsShape): Partial<AppSettingsV1> {
  const rawAgentProvider = parsed.agentProvider
  const isReasoningLegacy = rawAgentProvider === 'reasonix'
  const hasProviderSettings = typeof parsed.provider === 'object' && parsed.provider !== null
  const defaults = legacyLocalHttpRuntimeDefaults()
  const kunDefaults = defaultKunRuntimeSettings()
  const legacyDeepseek = parsed.deepseek ?? {}
  const legacyLocalHttp = {
    ...defaults,
    ...(parsed.agents?.codewhale ?? {}),
    ...legacyDeepseek
  }
  const legacyReasoning = {
    ...legacyReasoningRuntimeDefaults(),
    ...(parsed.agents?.reasonix ?? {})
  }
  const explicitKun: Partial<KunRuntimeSettingsV1> = parsed.agents?.kun ?? {}
  const legacySource = isReasoningLegacy ? legacyReasoning : legacyLocalHttp
  const legacySeed = {
    binaryPath: kunDefaults.binaryPath,
    port: isReasoningLegacy
      ? kunDefaults.port
      : upgradeLegacyKunDefaultPort(legacyLocalHttp.port, legacyLocalHttp.port),
    autoStart: isReasoningLegacy ? legacyReasoning.autoStart : legacyLocalHttp.autoStart,
    apiKey: legacySource.apiKey,
    baseUrl: legacySource.baseUrl,
    providerId: '',
    runtimeToken: isReasoningLegacy ? kunDefaults.runtimeToken : legacyLocalHttp.runtimeToken,
    model: isReasoningLegacy ? legacyReasoning.model : kunDefaults.model,
    approvalPolicy: isReasoningLegacy ? kunDefaults.approvalPolicy : legacyLocalHttp.approvalPolicy,
    sandboxMode: isReasoningLegacy ? kunDefaults.sandboxMode : legacyLocalHttp.sandboxMode
  }
  const provider = normalizeModelProviderSettings({
    apiKey: hasProviderSettings
      ? parsed.provider?.apiKey
      : nonEmptyStringOrFallback(explicitKun.apiKey, legacySeed.apiKey),
    baseUrl: hasProviderSettings
      ? parsed.provider?.baseUrl
      : nonEmptyStringOrFallback(explicitKun.baseUrl, legacySeed.baseUrl)
  })
  const kun = {
    ...kunDefaults,
    ...legacySeed,
    ...explicitKun,
    apiKey: hasProviderSettings ? explicitKun.apiKey ?? '' : '',
    baseUrl: hasProviderSettings ? explicitKun.baseUrl ?? '' : '',
    runtimeToken: nonEmptyStringOrFallback(explicitKun.runtimeToken, legacySeed.runtimeToken),
    dataDir: upgradeLegacyKunDefaultDataDir(explicitKun.dataDir),
    model: upgradeLegacyKunDefaultModel(explicitKun.model, legacySeed.model),
    tokenEconomyMode: typeof explicitKun.tokenEconomy?.enabled === 'boolean'
      ? explicitKun.tokenEconomy.enabled
      : explicitKun.tokenEconomyMode ?? kunDefaults.tokenEconomyMode,
    tokenEconomy: normalizeKunTokenEconomySettings(
      explicitKun.tokenEconomy,
      explicitKun.tokenEconomyMode ?? kunDefaults.tokenEconomyMode
    ),
    mcpSearch: normalizeKunMcpSearchSettings(explicitKun.mcpSearch),
    storage: normalizeKunStorageSettings(explicitKun.storage),
    contextCompaction: normalizeKunContextCompactionSettings(explicitKun.contextCompaction),
    runtimeTuning: normalizeKunRuntimeTuningSettings(explicitKun.runtimeTuning)
  }
  // Strip the legacy `agentProvider` discriminator and the legacy
  // per-provider settings from the surfaced migration result. The
  // runtime now has a single agent (Kun) and we no longer
  // round-trip the legacy value into the new settings shape.
  const { deepseek: _legacyDeepseek, agents: _agents, agentProvider: _agentProvider, ...rest } = parsed
  void _legacyDeepseek
  void _agents
  void _agentProvider
  return {
    ...rest,
    provider,
    agents: {
      kun
    }
  }
}
