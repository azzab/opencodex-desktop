import type {
  AppSettingsPatch,
  AppSettingsV1,
  ClawRunResult,
  ClawTaskFromTextResult,
  ClawRuntimeStatus,
  ScheduleRunResult,
  ScheduleRuntimeStatus,
  ScheduleTaskFromTextResult,
  ModelProviderCatalogModelV1,
  ModelProviderProfileV1,
  UserAgentStackProfileV1
} from './app-settings'
import type { EditorListResult, EditorOpenResult, OpenEditorPathOptions } from './editor'
import type {
  GitBranchesResult,
  GitAuditLogOptions,
  GitAuditLogResult,
  GitDiffResult,
  GitReviewPreparationOptions,
  GitReviewPreparationResult,
  GitWorktreeHandoffOptions,
  GitWorktreeHandoffResult,
  GitWorktreeListResult,
  GitPathMutationResult,
  ManagedGitWorktreeCreateResult,
  ManagedGitWorktreeOptions,
  ManagedGitWorktreeRemoveOptions,
  ManagedGitWorktreeRemoveResult
} from './git-branches'
import type {
  GuiUpdateChannel,
  GuiUpdateDownloadResult,
  GuiUpdateInfo,
  GuiUpdateInstallResult,
  GuiUpdateState
} from './gui-update'
import type { Phase7DiagnosticsResult } from './phase7-diagnostics'
import type {
  ClipboardImageReadResult,
  WorkspaceClipboardImageSavePayload,
  WorkspaceClipboardImageSaveResult,
  WorkspaceFileReadResult,
  WorkspaceImageReadResult,
  WorkspaceDirectoryCreatePayload,
  WorkspaceDirectoryCreateResult,
  WorkspaceDirectoryListResult,
  WorkspaceDirectoryTarget,
  WorkspaceEntryRenamePayload,
  WorkspaceEntryRenameResult,
  WorkspaceEntryDeletePayload,
  WorkspaceEntryDeleteResult,
  WorkspaceFileChangePayload,
  WorkspaceFileCreatePayload,
  WorkspaceFileCreateResult,
  WorkspaceFileResolveResult,
  WorkspaceFileTarget,
  WorkspaceFileWatchPayload,
  WorkspaceFileWatchResult,
  WorkspaceFileWritePayload,
  WorkspaceFileWriteResult
} from './workspace-file'
import type {
  WriteInlineCompletionDebugEntry,
  WriteInlineCompletionRequest,
  WriteInlineCompletionResult
} from './write-inline-completion'
import type {
  WriteExportPayload,
  WriteExportResult,
  WriteRichClipboardPayload,
  WriteRichClipboardResult
} from './write-export'

export type RuntimeRequestResult = { ok: boolean; status: number; body: string }
export type WorkspacePickResult = { canceled: boolean; path: string | null }
export type PathOpenResult = { ok: boolean; message?: string }
export const DESKTOP_COMMANDS = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'selectAll',
  'reload',
  'zoomIn',
  'zoomOut',
  'resetZoom',
  'toggleDevTools',
  'minimize',
  'toggleMaximize',
  'close',
  'quit'
] as const
export type DesktopCommand = typeof DESKTOP_COMMANDS[number]
export type SkillSaveResult = { ok: true; path: string } | { ok: false; message: string }
export type SkillListItem = {
  id: string
  name: string
  description?: string
  root: string
  entryPath: string
  scope: 'project' | 'global'
  legacy: boolean
}
export type SkillListResult =
  | { ok: true; skills: SkillListItem[]; validationErrors: Array<{ root: string; message: string }> }
  | { ok: false; message: string }
export type DeepseekConfigFileResult = { path: string; content: string; exists: boolean }
export type DeepseekConfigSaveResult = { ok: true; path: string }
export type UserAgentStackImportPayload = { workspaceRoot?: string }
export type UserAgentStackPreviewResult =
  | { ok: true; profile: UserAgentStackProfileV1 }
  | { ok: false; message: string }
export type UserAgentStackImportResult =
  | { ok: true; profile: UserAgentStackProfileV1; settings: AppSettingsV1 }
  | { ok: false; message: string }
export type TurnCompleteNotificationPayload = {
  threadId?: string
  title: string
  body: string
}
export type SystemNotificationResult =
  | { ok: true; shown: boolean; reason?: string }
  | { ok: false; message: string }
export type ClawChannelActivityPayload = {
  channelId: string
  threadId: string
}
export type ClawChannelMirrorResult =
  | { ok: true }
  | { ok: false; message: string }
export type UpstreamModelsResult =
  | { ok: true; modelIds: string[]; modelGroups?: ModelProviderModelGroup[]; catalogModels?: ModelProviderCatalogModelV1[] }
  | { ok: false; message: string }
export type ModelProviderCatalogRefreshPayload = { providerId: string }
export type ModelProviderCatalogRefreshResult =
  | {
      ok: true
      provider: ModelProviderProfileV1
      catalogModels: ModelProviderCatalogModelV1[]
      settings: AppSettingsV1
    }
  | { ok: false; message: string }
export type ModelProviderModelGroup = {
  providerId: string
  label: string
  modelIds: string[]
}
export type ClawImInstallQrResult =
  | { ok: true; url: string; deviceCode: string; userCode: string; interval: number; expireIn: number }
  | { ok: false; message: string }
export type ClawImInstallPollResult =
  | { done: true; kind: 'feishu'; appId: string; appSecret: string; domain: string }
  | { done: true; kind: 'weixin'; accountId: string; sessionKey: string }
  | { done: false; error?: string }
export type SseEventPayload = { streamId: string; data: unknown }
export type SseEndPayload = { streamId: string }
export type SseErrorPayload = { streamId: string; status?: number; message?: string }

export type TerminalSpawnResult =
  | { ok: true; sessionId: string; cwd: string; cols: number; rows: number }
  | { ok: false; message: string }
export type TerminalSessionSummary = { id: string; cwd: string; createdAt: number; cols: number; rows: number }
export type TerminalBoolResult = { ok: boolean }
export type TerminalSettingsResult = { enabled: boolean }
export type TerminalAuditEventSummary = { id: string; kind: string; sessionId?: string; cwd?: string; timestamp: string; detail?: string }
export type TerminalDataPayload = { sessionId: string; data: string }
export type TerminalAgentExecObservedPayload = {
  threadId?: string
  turnId?: string
  toolName?: string
  toolKind?: string
  summary?: string
  outputTruncated?: string
  exitCode?: number
}

export type DiscoveredHookInfo = {
  id: string
  scriptPath: string
  scope: 'user' | 'project'
  phase: string
  contentHash: string
  executable: boolean
}

export type HookTrustStateInfo = {
  id: string
  scriptPath: string
  scope: 'user' | 'project'
  phase: string
  trusted: boolean
  approvedAt?: string
  contentHash: string
  hashMatches: boolean
}

export type HooksStateResult = {
  killSwitchEnabled: boolean
  hooks: HookTrustStateInfo[]
  auditLog: Array<{
    hookId: string
    phase: string
    startedAt: string
    durationMs: number
    exitCode: number | null
    signal: string | null
    stdoutBytes: number
    stderrBytes: number
    decision?: 'allow' | 'deny'
    error?: string
  }>
}

export type HookApproveResult =
  | { ok: true; entry: { id: string; trusted: boolean; approvedAt: string } }
  | { ok: false; message: string }

export type HookSourceResult =
  | { ok: true; content: string; scriptPath: string }
  | { ok: false; message: string }

export type RemoteRunnerHostSummary = {
  id: string
  label: string
  enabled: boolean
  connectionStatus: string
  lastHandshake: { issuedAt: string; shell: { os: string; shell: string }; gitAvailable: boolean; toolPolicy: Record<string, string> } | null
  lastError: string | null
  trustedPaths: Array<{ path: string; label: string; trustedAt: string; auditId: string }>
}

export type RemoteRunnerStatusResult = {
  hosts: RemoteRunnerHostSummary[]
  enabled: boolean
  auditLog: Array<{
    id: string
    timestamp: string
    runnerId: string
    action: string
    outcome: string
    reason?: string
  }>
}

export type RemoteRunnerActionResult = { ok: true } | { ok: false; message: string }

export type RemoteRunnerExecPayload = {
  hostId: string
  command: string
  cwd?: string
  timeoutMs?: number
  maxOutputBytes?: number
}

export type RemoteRunnerExecResult =
  | { ok: true; runId: string; output: string; exitCode: number | null }
  | { ok: false; message: string }

export type RemoteRunnerStopResult =
  | { ok: true; hostId: string; wasRunning: boolean }
  | { ok: false; message: string }

export type RemoteRunnerResumeResult =
  | { ok: true; hostId: string; runId: string | null; restored: boolean }
  | { ok: false; message: string }

/** Payload sent to the renderer when a remote command requires operator approval. */
export type RemoteRunnerApprovalRequiredPayload = {
  approvalId: string
  runnerId: string
  hostLabel: string
  command: string
  cwd: string
  requestedAt: string
  requireRemoteLabel: boolean
}

/** Payload sent to the renderer when an approval decision has been made (by any surface). */
export type RemoteRunnerApprovalDecisionPayload = {
  approvalId: string
  runnerId: string
  decision: 'allow' | 'deny'
}

export type DsGuiApi = {
  platform: string
  getSettings: () => Promise<AppSettingsV1>
  setSettings: (partial: AppSettingsPatch) => Promise<AppSettingsV1>
  runtimeRequest: (path: string, method?: string, body?: string) => Promise<RuntimeRequestResult>
  fetchUpstreamModels: () => Promise<UpstreamModelsResult>
  refreshModelProviderCatalog: (
    payload: ModelProviderCatalogRefreshPayload
  ) => Promise<ModelProviderCatalogRefreshResult>
  getClawStatus: () => Promise<ClawRuntimeStatus>
  runClawTask: (taskId: string) => Promise<ClawRunResult>
  getScheduleStatus: () => Promise<ScheduleRuntimeStatus>
  runScheduleTask: (taskId: string) => Promise<ScheduleRunResult>
  startClawImInstallQr: (
    provider: 'feishu' | 'weixin',
    options?: { isLark?: boolean }
  ) => Promise<ClawImInstallQrResult>
  pollClawImInstall: (
    provider: 'feishu' | 'weixin',
    deviceCode: string
  ) => Promise<ClawImInstallPollResult>
  pickWorkspaceDirectory: (defaultPath?: string) => Promise<WorkspacePickResult>
  listSkills: (workspaceRoot?: string) => Promise<SkillListResult>
  getPhase7Diagnostics: (workspaceRoot?: string) => Promise<Phase7DiagnosticsResult>
  saveSkillFile: (rootPath: string, skillName: string, content: string) => Promise<SkillSaveResult>
  openSkillRoot: (rootPath: string) => Promise<PathOpenResult>
  getDeepseekConfigFile: () => Promise<DeepseekConfigFileResult>
  setDeepseekConfigFile: (content: string) => Promise<DeepseekConfigSaveResult>
  openDeepseekConfigDir: () => Promise<PathOpenResult>
  previewUserAgentStackImport: (payload?: UserAgentStackImportPayload) => Promise<UserAgentStackPreviewResult>
  importUserAgentStack: (payload?: UserAgentStackImportPayload) => Promise<UserAgentStackImportResult>
  /** Get full hooks state: discovered hooks + trust + audit log. */
  getHooksState: (workspaceRoot?: string) => Promise<HooksStateResult>
  /** Approve (trust) a hook by id. Pins the current content hash. */
  approveHook: (hookId: string, workspaceRoot?: string) => Promise<HookApproveResult>
  /** Revoke trust for a hook by id. */
  revokeHook: (hookId: string) => Promise<HookApproveResult>
  /** Read a hook's source for review. */
  readHookSource: (hookId: string, workspaceRoot?: string) => Promise<HookSourceResult>
  /** Set the master kill switch. */
  setHooksKillSwitch: (enabled: boolean) => Promise<{ ok: boolean }>
  getGitBranches: (workspaceRoot: string) => Promise<GitBranchesResult>
  switchGitBranch: (workspaceRoot: string, branch: string) => Promise<GitBranchesResult>
  createAndSwitchGitBranch: (workspaceRoot: string, branch: string) => Promise<GitBranchesResult>
  listGitWorktrees: (workspaceRoot: string) => Promise<GitWorktreeListResult>
  createManagedGitWorktree: (
    workspaceRoot: string,
    options: Omit<ManagedGitWorktreeOptions, 'branch'> & { branch: string }
  ) => Promise<ManagedGitWorktreeCreateResult>
  removeManagedGitWorktree: (
    workspaceRoot: string,
    path: string,
    options?: ManagedGitWorktreeRemoveOptions
  ) => Promise<ManagedGitWorktreeRemoveResult>
  createGitWorktreeHandoffSummary: (
    workspaceRoot: string,
    path: string,
    options?: GitWorktreeHandoffOptions
  ) => Promise<GitWorktreeHandoffResult>
  getGitDiff: (workspaceRoot: string) => Promise<GitDiffResult>
  getGitReviewPreparation: (
    workspaceRoot: string,
    options?: GitReviewPreparationOptions
  ) => Promise<GitReviewPreparationResult>
  listGitAuditEvents: (
    workspaceRoot: string,
    options?: GitAuditLogOptions
  ) => Promise<GitAuditLogResult>
  stageGitPaths: (workspaceRoot: string, paths: string[]) => Promise<GitPathMutationResult>
  discardGitChanges: (
    workspaceRoot: string,
    paths: string[],
    options?: { confirmation?: string }
  ) => Promise<GitPathMutationResult>
  listEditors: () => Promise<EditorListResult>
  openEditorPath: (options: OpenEditorPathOptions) => Promise<EditorOpenResult>
  listWorkspaceDirectory: (options: WorkspaceDirectoryTarget) => Promise<WorkspaceDirectoryListResult>
  resolveWorkspaceFile: (options: WorkspaceFileTarget) => Promise<WorkspaceFileResolveResult>
  readWorkspaceFile: (options: WorkspaceFileTarget) => Promise<WorkspaceFileReadResult>
  readWorkspaceImage: (options: WorkspaceFileTarget) => Promise<WorkspaceImageReadResult>
  writeWorkspaceFile: (payload: WorkspaceFileWritePayload) => Promise<WorkspaceFileWriteResult>
  createWorkspaceFile: (payload: WorkspaceFileCreatePayload) => Promise<WorkspaceFileCreateResult>
  createWorkspaceDirectory: (
    payload: WorkspaceDirectoryCreatePayload
  ) => Promise<WorkspaceDirectoryCreateResult>
  saveWorkspaceClipboardImage: (
    payload: WorkspaceClipboardImageSavePayload
  ) => Promise<WorkspaceClipboardImageSaveResult>
  readClipboardImage: () => Promise<ClipboardImageReadResult>
  renameWorkspaceEntry: (
    payload: WorkspaceEntryRenamePayload
  ) => Promise<WorkspaceEntryRenameResult>
  deleteWorkspaceEntry: (
    payload: WorkspaceEntryDeletePayload
  ) => Promise<WorkspaceEntryDeleteResult>
  watchWorkspaceFile: (payload: WorkspaceFileWatchPayload) => Promise<WorkspaceFileWatchResult>
  unwatchWorkspaceFile: (watchId: string) => Promise<boolean>
  onWorkspaceFileChanged: (handler: (payload: WorkspaceFileChangePayload) => void) => () => void
  requestWriteInlineCompletion: (
    payload: WriteInlineCompletionRequest
  ) => Promise<WriteInlineCompletionResult>
  listWriteInlineCompletionDebugEntries: () => Promise<WriteInlineCompletionDebugEntry[]>
  clearWriteInlineCompletionDebugEntries: () => Promise<boolean>
  exportWriteDocument: (payload: WriteExportPayload) => Promise<WriteExportResult>
  copyWriteDocumentAsRichText: (
    payload: WriteRichClipboardPayload
  ) => Promise<WriteRichClipboardResult>
  startSse: (threadId: string, sinceSeq: number, streamId?: string) => Promise<{ streamId: string }>
  stopSse: (streamId: string) => Promise<boolean>
  onSseEvent: (handler: (payload: SseEventPayload) => void) => () => void
  onSseEnd: (handler: (payload: SseEndPayload) => void) => () => void
  onSseError: (handler: (payload: SseErrorPayload) => void) => () => void
  onClawChannelActivity: (handler: (payload: ClawChannelActivityPayload) => void) => () => void
  mirrorClawChannelMessage: (
    threadId: string,
    text: string,
    direction: 'user' | 'assistant'
  ) => Promise<ClawChannelMirrorResult>
  mirrorClawChannelMessageToFeishu: (
    threadId: string,
    text: string,
    direction: 'user' | 'assistant'
  ) => Promise<ClawChannelMirrorResult>
  createClawTaskFromText: (
    text: string,
    options?: { channelId?: string; modelHint?: string; mode?: 'agent' | 'plan' }
  ) => Promise<ClawTaskFromTextResult>
  createScheduleTaskFromText: (
    text: string,
    options?: { workspaceRoot?: string; modelHint?: string; mode?: 'agent' | 'plan' }
  ) => Promise<ScheduleTaskFromTextResult>
  runDesktopCommand: (command: DesktopCommand) => Promise<void>
  openExternal: (url: string) => Promise<void>
  showTurnCompleteNotification: (
    payload: TurnCompleteNotificationPayload
  ) => Promise<SystemNotificationResult>
  getAppVersion: () => Promise<string>
  getGuiUpdateState: () => Promise<GuiUpdateState>
  checkGuiUpdate: (channel?: GuiUpdateChannel) => Promise<GuiUpdateInfo>
  downloadGuiUpdate: (channel?: GuiUpdateChannel) => Promise<GuiUpdateDownloadResult>
  installGuiUpdate: () => Promise<GuiUpdateInstallResult>
  onGuiUpdateState: (handler: (payload: GuiUpdateState) => void) => () => void
  logError: (category: string, message: string, detail?: unknown) => Promise<void>
  getLogPath: () => Promise<string>
  openLogDir: () => Promise<{ ok: boolean; message?: string }>
  getPathForFile: (file: File) => string
  terminalSpawn: (
    cwd: string,
    cols?: number,
    rows?: number
  ) => Promise<TerminalSpawnResult>
  terminalList: () => Promise<TerminalSessionSummary[]>
  terminalWrite: (sessionId: string, data: string) => Promise<TerminalBoolResult>
  terminalResize: (sessionId: string, cols: number, rows: number) => Promise<TerminalBoolResult>
  terminalKill: (sessionId: string) => Promise<TerminalBoolResult>
  terminalGetSettings: () => Promise<TerminalSettingsResult>
  terminalGetAuditEvents: () => Promise<TerminalAuditEventSummary[]>
  terminalAgentExecObserved: (payload: TerminalAgentExecObservedPayload) => Promise<TerminalBoolResult>
  onTerminalData: (handler: (payload: TerminalDataPayload) => void) => () => void
  /** Remote runner host management. */
  remoteRunnerStatus: () => Promise<RemoteRunnerStatusResult>
  remoteRunnerConnect: (hostId: string) => Promise<RemoteRunnerActionResult>
  remoteRunnerDisconnect: (hostId: string) => Promise<RemoteRunnerActionResult>
  remoteRunnerReconnect: (hostId: string) => Promise<RemoteRunnerActionResult>
  remoteRunnerHandshake: (hostId: string) => Promise<RemoteRunnerActionResult>
  remoteRunnerTrustPath: (hostId: string, path: string, label: string) => Promise<RemoteRunnerActionResult>
  remoteRunnerRevokeTrust: (hostId: string, path: string) => Promise<RemoteRunnerActionResult>
  remoteRunnerGetAuditLog: () => Promise<RemoteRunnerStatusResult['auditLog']>
  /** Remote command execution with full policy enforcement (trust, approval, data egress, budget, audit). */
  remoteRunnerExec: (payload: RemoteRunnerExecPayload) => Promise<RemoteRunnerExecResult>
  /** Stop/kill a running remote command. */
  remoteRunnerStop: (hostId: string) => Promise<RemoteRunnerStopResult>
  /** Resume (re-execute) a previously paused remote command. */
  remoteRunnerResume: (hostId: string) => Promise<RemoteRunnerResumeResult>
  /** Listen for remote command approval requests. The renderer MUST display a visible
   *  REMOTE-labeled surface and the operator's allow/deny decision determines execution. */
  onRemoteRunnerApprovalRequired: (
    handler: (payload: RemoteRunnerApprovalRequiredPayload) => void
  ) => () => void
  /** Listen for approval decision notifications (allow/deny from any surface). */
  onRemoteRunnerApprovalDecision: (
    handler: (payload: RemoteRunnerApprovalDecisionPayload) => void
  ) => () => void
}
