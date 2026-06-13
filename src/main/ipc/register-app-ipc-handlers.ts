import { app, dialog, ipcMain, shell, type BrowserWindow, type WebContents } from 'electron'
import { realpathSync, watch, type FSWatcher } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  type AppSettingsPatch,
  type AppSettingsV1,
  type ClawRunResult,
  type ClawTaskFromTextResult,
  type ClawRuntimeStatus,
  type ScheduleRunResult,
  type ScheduleRuntimeStatus,
  type ScheduleTaskFromTextResult
} from '../../shared/app-settings'
import type {
  ClawImInstallPollResult,
  ClawImInstallQrResult,
  DesktopCommand,
  RuntimeRequestResult,
  SystemNotificationResult,
  TurnCompleteNotificationPayload,
  ModelProviderCatalogRefreshResult,
  UpstreamModelsResult,
  WorkspacePickResult
} from '../../shared/ds-gui-api'
import {
  getModelProviderProfile,
  getModelProviderSettings
} from '../../shared/app-settings-provider'
import type { GuiUpdateDownloadResult, GuiUpdateInfo, GuiUpdateInstallResult, GuiUpdateState } from '../../shared/gui-update'
import {
  clawMirrorPayloadSchema,
  clawImInstallPollPayloadSchema,
  clawTaskFromTextPayloadSchema,
  deepseekConfigContentSchema,
  desktopCommandSchema,
  defaultPathSchema,
  gitDiscardPayloadSchema,
  gitAuditLogPayloadSchema,
  gitBranchPayloadSchema,
  gitPathListPayloadSchema,
  gitReviewPreparationPayloadSchema,
  guiUpdateChannelSchema,
  logErrorPayloadSchema,
  managedGitWorktreeCreatePayloadSchema,
  managedGitWorktreeHandoffPayloadSchema,
  managedGitWorktreeRemovePayloadSchema,
  modelProviderCatalogPayloadSchema,
  notificationPayloadSchema,
  openEditorPathPayloadSchema,
  phase7DiagnosticsPayloadSchema,
  rootPathSchema,
  runtimeRequestPayloadSchema,
  scheduleTaskFromTextPayloadSchema,
  shellOpenExternalUrlSchema,
  terminalSpawnPayloadSchema,
  terminalWritePayloadSchema,
  terminalResizePayloadSchema,
  terminalSessionIdSchema,
  terminalAgentExecObservedPayloadSchema,
  skillListPayloadSchema,
  skillSaveFilePayloadSchema,
  settingsPatchSchema,
  streamIdSchema,
  userAgentStackImportPayloadSchema,
  workspaceDirectoryCreatePayloadSchema,
  workspaceClipboardImageSavePayloadSchema,
  workspaceDirectoryTargetPayloadSchema,
  workspaceEntryDeletePayloadSchema,
  workspaceEntryRenamePayloadSchema,
  workspaceFileCreatePayloadSchema,
  workspaceFileTargetPayloadSchema,
  workspaceFileWatchPayloadSchema,
  workspaceFileWritePayloadSchema,
  writeExportPayloadSchema,
  writeRichClipboardPayloadSchema,
  writeInlineCompletionPayloadSchema,
  workspaceRootSchema,
  hooksStatePayloadSchema,
  hookApprovePayloadSchema,
  hookRevokePayloadSchema,
  hookSourcePayloadSchema,
  hooksKillSwitchPayloadSchema,
  remoteRunnerExecPayloadSchema,
  mobileAccessDeviceIdSchema,
  mobileAccessEnabledSchema
} from './app-ipc-schemas'
import {
  MAX_BODY_BYTES,
  MAX_URL_LENGTH
} from './app-ipc-schemas'
import {
  approveHook,
  autoRevokeChangedHooks,
  discoverAllHooks,
  readHookSource,
  revokeHook,
  setKillSwitch
} from '../services/hook-runner-service'
import { RemoteRunnerService, type RemoteRunnerHandle } from '../services/remote-runner-service'
import { getKunRuntimeSettings, applyKunRuntimePatch, type KunHookSettingsV1 } from '../../shared/app-settings'
import type { JsonSettingsStore } from '../settings-store'
import type { ClawRuntime } from '../claw-runtime'
import type { ScheduleRuntime } from '../schedule-runtime'
import {
  createAndSwitchGitBranch,
  createGitWorktreeHandoffSummary,
  createManagedGitWorktree,
  discardGitChanges,
  getGitBranches,
  getGitDiff,
  getGitReviewPreparation,
  listGitAuditEvents,
  listGitWorktrees,
  removeManagedGitWorktree,
  stageGitPaths,
  switchGitBranch
} from '../services/git-service'
import {
  createWorkspaceDirectory,
  createWorkspaceFile,
  deleteWorkspaceEntry,
  expandHomePath,
  listEditorsResult,
  listWorkspaceDirectory,
  normalizeSkillFolderName,
  openEditorPath,
  openPathWithShell,
  readClipboardImage,
  readWorkspaceImage,
  readWorkspaceFile,
  renameWorkspaceEntry,
  resolveWorkspaceFile,
  saveWorkspaceClipboardImage,
  writeWorkspaceFile
} from '../services/workspace-service'
import {
  clearWriteInlineCompletionDebugEntries,
  listWriteInlineCompletionDebugEntries,
  requestWriteInlineCompletion
} from '../services/write-inline-completion-service'
import { copyWriteDocumentAsRichText, exportWriteDocument } from '../services/write-export-service'
import { listGuiSkills } from '../services/skill-service'
import { getPhase7Diagnostics } from '../services/phase7-diagnostics-service'
import { discoverUserAgentStackProfile } from '../services/user-agent-stack-service'
import { fetchModelProviderCatalog } from '../upstream-models'
import { TerminalService, type TerminalSessionInfo, type TerminalAuditEvent } from '../services/terminal-service'
import { MobilePairingService } from '../services/mobile-pairing-service'
import { MobileTlsListener } from '../services/mobile-tls-listener'
import { STORED_ENCRYPTED_MARKER } from '../../shared/app-settings-types'

function maskApiKeyForRenderer(key: string): string {
  if (!key || key === STORED_ENCRYPTED_MARKER) return ''
  if (key.length <= 12) return '••••••••'
  const prefix = key.slice(0, 5)
  const suffix = key.slice(-4)
  return `${prefix}…${suffix}`
}

type GuiUpdaterModule = typeof import('../gui-updater')

type WorkspaceFileWatchRecord = {
  watcher: FSWatcher
  sender: WebContents
  path: string
  workspaceRoot: string
  timer: ReturnType<typeof setTimeout> | null
}

type RegisterAppIpcHandlersOptions = {
  store: JsonSettingsStore
  credentialStore?: import('../services/credential-store').CredentialStore | null
  getMainWindow: () => BrowserWindow | null
  applySettingsPatch: (partial: AppSettingsPatch) => Promise<AppSettingsV1>
  runtimeRequest: (
    path: string,
    method?: string,
    body?: string
  ) => Promise<RuntimeRequestResult>
  fetchUpstreamModels: () => Promise<UpstreamModelsResult>
  getClawRuntime: () => ClawRuntime | null
  getScheduleRuntime: () => ScheduleRuntime | null
  startFeishuInstallQrcode: (isLark: boolean) => Promise<ClawImInstallQrResult>
  pollFeishuInstall: (deviceCode: string) => Promise<ClawImInstallPollResult>
  startWeixinInstallQrcode: (weixinBridgeUrl?: string) => Promise<ClawImInstallQrResult>
  pollWeixinInstall: (deviceCode: string, weixinBridgeUrl?: string) => Promise<ClawImInstallPollResult>
  resolveKunConfigPath: () => string
  onKunMcpConfigWritten?: (path: string, content: string) => Promise<void> | void
  showTurnCompleteNotification: (
    payload: TurnCompleteNotificationPayload
  ) => Promise<SystemNotificationResult>
  getAppVersion: () => string
  readGuiUpdateState: () => Promise<GuiUpdateState>
  loadGuiUpdaterModule: () => Promise<GuiUpdaterModule>
  resolveLogDirectory: () => string
  logError: (category: string, message: string, detail?: unknown) => void
  getTerminalService: () => TerminalService | null
  getRemoteRunnerService: () => RemoteRunnerService | null
  getActiveProjectDir: () => Promise<string>
  getMobilePairingService: () => MobilePairingService | null
  getMobileAccessListener: () => MobileTlsListener | null
  setMobileAccessListener: (listener: MobileTlsListener | null) => void
}

function parseIpcPayload<T>(channel: string, schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload)
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  throw new Error(`Invalid payload for ${channel}: ${issue?.message ?? 'Bad request.'}`)
}

/**
 * Returns true when `candidate` resolves to a path inside or equal to `root`.
 *
 * Two-phase verification:
 * 1. Quick string-based check rejects obviously malicious paths (../ escapes).
 * 2. realpath-based containment resolves symlinks so a symlink inside the
 *    project pointing outside is hard-blocked before any PTY is spawned.
 *
 * Renderer input is untrusted — this function is the single gate for PTY cwd containment.
 */
function isPathWithinRoot(candidate: string, root: string): boolean {
  if (!candidate || !root) return false

  // Phase 1 — string-path containment (fast, catches most escapes)
  const normalizedRoot = join(root, '.').replace(/\\/g, '/')
  const normalizedCandidate = candidate.replace(/\\/g, '/')
  const resolvedCandidate = normalizedCandidate.startsWith('/')
    ? join(normalizedCandidate, '.').replace(/\\/g, '/')
    : join(normalizedRoot, normalizedCandidate).replace(/\\/g, '/')
  if (resolvedCandidate === normalizedRoot) return true
  const rel = relative(normalizedRoot, resolvedCandidate)
  if (rel === '' || rel.startsWith('..') || rel === resolvedCandidate) return false

  // Phase 2 — realpath containment (blocks symlink escapes)
  try {
    const realRoot = realpathSync(normalizedRoot)
    const realCandidate = realpathSync(resolvedCandidate)
    // After resolving symlinks, candidate must still be inside root
    const realRel = relative(realRoot, realCandidate)
    return realRel !== '' && !realRel.startsWith('..') && realRel !== realCandidate
  } catch {
    // realpathSync failed for one or both paths (non-existent, permission, etc.)
    // Fall closed: if we cannot verify containment with real paths, reject.
    return false
  }
}

function validateMcpConfigContent(content: string): void {
  const trimmed = content.trim()
  if (!trimmed) return
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`MCP config must be JSON: ${message}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MCP config must be a JSON object.')
  }
}

function mergeProviderModelIds(current: readonly string[], next: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const id of [...current, ...next]) {
    const trimmed = id.trim()
    if (trimmed) ids.add(trimmed)
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function runDesktopCommand(
  command: DesktopCommand,
  sender: WebContents,
  getMainWindow: () => BrowserWindow | null
): void {
  const mainWindow = getMainWindow()
  const contents = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : sender

  switch (command) {
    case 'undo':
      contents.undo()
      return
    case 'redo':
      contents.redo()
      return
    case 'cut':
      contents.cut()
      return
    case 'copy':
      contents.copy()
      return
    case 'paste':
      contents.paste()
      return
    case 'selectAll':
      contents.selectAll()
      return
    case 'reload':
      contents.reload()
      return
    case 'zoomIn':
      contents.setZoomLevel(contents.getZoomLevel() + 1)
      return
    case 'zoomOut':
      contents.setZoomLevel(contents.getZoomLevel() - 1)
      return
    case 'resetZoom':
      contents.setZoomLevel(0)
      return
    case 'toggleDevTools':
      contents.toggleDevTools()
      return
    case 'minimize':
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
      return
    case 'toggleMaximize':
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
      return
    case 'close':
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
      return
    case 'quit':
      app.quit()
      return
  }
}

export function registerAppIpcHandlers(options: RegisterAppIpcHandlersOptions): void {
  const {
    store,
    credentialStore,
    getMainWindow,
    applySettingsPatch,
    runtimeRequest,
    fetchUpstreamModels,
    getClawRuntime,
    getScheduleRuntime,
    startFeishuInstallQrcode,
    pollFeishuInstall,
    startWeixinInstallQrcode,
    pollWeixinInstall,
    resolveKunConfigPath,
    onKunMcpConfigWritten,
    showTurnCompleteNotification,
    getAppVersion,
    readGuiUpdateState,
    loadGuiUpdaterModule,
    resolveLogDirectory,
    logError,
    getTerminalService,
    getRemoteRunnerService,
    getActiveProjectDir,
    getMobilePairingService,
    getMobileAccessListener,
    setMobileAccessListener
  } = options
  const workspaceFileWatchers = new Map<string, WorkspaceFileWatchRecord>()

  const disposeWorkspaceFileWatch = (watchId: string): boolean => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return false
    if (record.timer) clearTimeout(record.timer)
    try {
      record.watcher.close()
    } catch (error) {
      logError('workspace-watch', 'Failed to close workspace file watcher', {
        watchId,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    workspaceFileWatchers.delete(watchId)
    return true
  }

  const disposeWorkspaceFileWatchesForSender = (sender: WebContents): void => {
    for (const [watchId, record] of workspaceFileWatchers) {
      if (record.sender.id === sender.id) {
        disposeWorkspaceFileWatch(watchId)
      }
    }
  }

  const emitWorkspaceFileChange = async (watchId: string): Promise<void> => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return
    const changedAt = new Date().toISOString()
    try {
      const result = await readWorkspaceFile({
        path: record.path,
        workspaceRoot: record.workspaceRoot
      })
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest || latest.sender.isDestroyed()) return
      if (result.ok) {
        latest.sender.send('file:workspace-changed', {
          ok: true,
          watchId,
          workspaceRoot: latest.workspaceRoot,
          path: result.path,
          content: result.content,
          size: result.size,
          truncated: result.truncated,
          changedAt
        })
        return
      }
      latest.sender.send('file:workspace-changed', {
        ok: false,
        watchId,
        workspaceRoot: latest.workspaceRoot,
        path: latest.path,
        message: result.message,
        changedAt
      })
    } catch (error) {
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest || latest.sender.isDestroyed()) return
      latest.sender.send('file:workspace-changed', {
        ok: false,
        watchId,
        workspaceRoot: latest.workspaceRoot,
        path: latest.path,
        message: error instanceof Error ? error.message : String(error),
        changedAt
      })
    }
  }

  const scheduleWorkspaceFileChange = (watchId: string): void => {
    const record = workspaceFileWatchers.get(watchId)
    if (!record) return
    if (record.timer) clearTimeout(record.timer)
    record.timer = setTimeout(() => {
      const latest = workspaceFileWatchers.get(watchId)
      if (!latest) return
      latest.timer = null
      void emitWorkspaceFileChange(watchId)
    }, 90)
  }

  ipcMain.handle('settings:get', async () => {
    const settings = await store.load()
    // Mask provider API keys — renderer must never see plaintext keys
    return {
      ...settings,
      provider: {
        ...settings.provider,
        apiKey: maskApiKeyForRenderer(settings.provider.apiKey),
        providers: settings.provider.providers.map((p) => ({
          ...p,
          apiKey: maskApiKeyForRenderer(p.apiKey)
        }))
      }
    }
  })
  ipcMain.handle('settings:set', async (_, partial: unknown) =>
    applySettingsPatch(
      parseIpcPayload('settings:set', settingsPatchSchema, partial) as AppSettingsPatch
    )
  )

  ipcMain.handle('runtime:request', async (_, payload: unknown) => {
    const request = parseIpcPayload('runtime:request', runtimeRequestPayloadSchema, payload)
    return runtimeRequest(request.path, request.method, request.body)
  })

  ipcMain.handle('upstream:models', async () => fetchUpstreamModels())
  ipcMain.handle('model-provider:catalog:refresh', async (_event, payload: unknown): Promise<ModelProviderCatalogRefreshResult> => {
    const request = parseIpcPayload(
      'model-provider:catalog:refresh',
      modelProviderCatalogPayloadSchema,
      payload
    )
    const settings = await store.load()
    const providerSettings = getModelProviderSettings(settings)
    const provider = getModelProviderProfile(settings, request.providerId)
    // Resolve the actual key from credential store (not from settings)
    const apiKey = credentialStore?.getKeySync(provider.id) ?? provider.apiKey
    const result = await fetchModelProviderCatalog({ provider: { ...provider, apiKey } })
    if (!result.ok) {
      return { ok: false, message: result.message }
    }
    const catalogModelIds = result.catalogModels.map((model) => model.id)
    const providers = providerSettings.providers.map((profile) =>
      profile.id === provider.id
        ? {
            ...profile,
            models: mergeProviderModelIds(profile.models, catalogModelIds),
            catalogUpdatedAt: result.catalogUpdatedAt,
            catalogError: '',
            catalogModels: result.catalogModels
          }
        : profile
    )
    const nextSettings = await applySettingsPatch({
      provider: {
        apiKey: providerSettings.apiKey,
        baseUrl: providerSettings.baseUrl,
        providers
      }
    })
    // Sanitize: mask all provider API keys before returning to renderer
    const nextProvider = getModelProviderProfile(nextSettings, provider.id)
    return {
      ok: true,
      provider: {
        ...nextProvider,
        apiKey: maskApiKeyForRenderer(nextProvider.apiKey)
      },
      catalogModels: nextProvider.catalogModels,
      settings: {
        ...nextSettings,
        provider: {
          ...nextSettings.provider,
          apiKey: maskApiKeyForRenderer(nextSettings.provider.apiKey),
          providers: nextSettings.provider.providers.map((p) => ({
            ...p,
            apiKey: maskApiKeyForRenderer(p.apiKey)
          }))
        }
      }
    }
  })

  // Provider OAuth PKCE (OpenRouter sign-in)
  // Key is stored in credentialStore inside main; renderer receives only masked metadata.
  ipcMain.handle('provider:oauth:start', async (): Promise<import('../../shared/ds-gui-api').ProviderOAuthResult> => {
    if (!credentialStore) {
      return { ok: false, message: 'Credential store is not available.' }
    }
    const { startOAuthFlow } = await import('../services/oauth-pkce-service')
    const result = await startOAuthFlow(credentialStore)
    return result
  })

  // BYOK key validation
  ipcMain.handle('provider:validate-key', async (_event, payload: unknown): Promise<import('../../shared/ds-gui-api').ProviderKeyValidationResult> => {
    const request = parseIpcPayload('provider:validate-key', z.object({
      providerId: z.string().trim().min(1).max(64),
      key: z.string().trim().min(1).max(MAX_BODY_BYTES),
      baseUrl: z.string().trim().max(MAX_URL_LENGTH).optional(),
      endpointFormat: z.string().trim().max(32).optional()
    }).strict(), payload)
    const { validateProviderKey } = await import('../services/provider-validation-service')
    return validateProviderKey(request.providerId, request.key, request.baseUrl ?? 'https://api.deepseek.com', request.endpointFormat as import('../../../kun/src/contracts/model-endpoint-format').ModelEndpointFormat | undefined)
  })

  // Per-key model catalog discovery
  ipcMain.handle('provider:discover-models', async (_event, payload: unknown): Promise<import('../../shared/ds-gui-api').ProviderModelDiscoveryResult> => {
    const request = parseIpcPayload('provider:discover-models', z.object({
      providerId: z.string().trim().min(1).max(64)
    }).strict(), payload)
    const settings = await store.load()
    const provider = getModelProviderProfile(settings, request.providerId)
    // Resolve the actual key from credential store
    const apiKey = credentialStore?.getKeySync(provider.id) ?? provider.apiKey
    const { discoverModels } = await import('../services/provider-validation-service')
    const result = await discoverModels({ ...provider, apiKey })
    if (!result.ok) {
      return { ok: false, message: result.message }
    }
    const catalogModelIds = result.catalogModels.map((model) => model.id)
    const providerSettings = getModelProviderSettings(settings)
    const providers = providerSettings.providers.map((profile) =>
      profile.id === provider.id
        ? {
            ...profile,
            models: mergeProviderModelIds(profile.models, catalogModelIds),
            catalogUpdatedAt: new Date().toISOString(),
            catalogError: '',
            catalogModels: result.catalogModels
          }
        : profile
    )
    const nextSettings = await applySettingsPatch({
      provider: { apiKey: providerSettings.apiKey, baseUrl: providerSettings.baseUrl, providers }
    })
    const nextProvider = getModelProviderProfile(nextSettings, provider.id)
    // Sanitize: mask all provider API keys before returning to renderer
    return {
      ok: true,
      catalogModels: result.catalogModels,
      provider: {
        ...nextProvider,
        apiKey: maskApiKeyForRenderer(nextProvider.apiKey)
      },
      settings: {
        ...nextSettings,
        provider: {
          ...nextSettings.provider,
          apiKey: maskApiKeyForRenderer(nextSettings.provider.apiKey),
          providers: nextSettings.provider.providers.map((p) => ({
            ...p,
            apiKey: maskApiKeyForRenderer(p.apiKey)
          }))
        }
      }
    }
  })

  // Save an encrypted key
  ipcMain.handle('provider:save-key', async (_event, providerId: unknown, key: unknown): Promise<import('../../shared/ds-gui-api').ProviderKeySaveResult> => {
    const id = typeof providerId === 'string' ? providerId.trim() : ''
    const k = typeof key === 'string' ? key.trim() : ''
    if (!id) return { ok: false, message: 'Provider ID is required.' }
    if (!k) return { ok: false, message: 'API key is required.' }
    if (!credentialStore) return { ok: false, message: 'Credential store is not available.' }
    const persisted = credentialStore.isAvailable()
    await credentialStore.setKey(id, k)
    return { ok: true, providerId: id, maskedPreview: credentialStore.maskKey(id), persisted }
  })

  // Delete a stored key
  ipcMain.handle('provider:delete-key', async (_event, providerId: unknown): Promise<import('../../shared/ds-gui-api').ProviderKeyDeleteResult> => {
    const id = typeof providerId === 'string' ? providerId.trim() : ''
    if (!id) return { ok: false, message: 'Provider ID is required.' }
    if (!credentialStore) return { ok: false, message: 'Credential store is not available.' }
    await credentialStore.deleteKey(id)
    return { ok: true, providerId: id }
  })

  // Get masked key preview
  ipcMain.handle('provider:masked-key', async (_event, providerId: unknown): Promise<import('../../shared/ds-gui-api').ProviderMaskedKeyResult> => {
    const id = typeof providerId === 'string' ? providerId.trim() : ''
    if (!id) return { ok: false, message: 'Provider ID is required.' }
    if (!credentialStore) return { ok: false, message: 'Credential store is not available.' }
    const hasKey = credentialStore.hasKey(id)
    return {
      ok: true,
      providerId: id,
      maskedPreview: hasKey ? credentialStore.maskKey(id) : '',
      hasKey
    }
  })

  ipcMain.handle('claw:status', async (): Promise<ClawRuntimeStatus> =>
    getClawRuntime()?.status() ?? {
      imServerRunning: false,
      imUrl: '',
      runningTaskIds: []
    }
  )

  ipcMain.handle('claw:task:run', async (_, taskId: unknown): Promise<ClawRunResult> => {
    const normalizedTaskId = parseIpcPayload('claw:task:run', streamIdSchema, taskId)
    const scheduleRuntime = getScheduleRuntime()
    if (!scheduleRuntime) return { ok: false, message: 'Schedule runtime is not initialized.' }
    return scheduleRuntime.runTask(normalizedTaskId)
  })

  ipcMain.handle('schedule:status', async (): Promise<ScheduleRuntimeStatus> =>
    getScheduleRuntime()?.status() ?? {
      internalServerRunning: false,
      internalUrl: '',
      runningTaskIds: [],
      powerSaveBlockerActive: false
    }
  )

  ipcMain.handle('schedule:task:run', async (_, taskId: unknown): Promise<ScheduleRunResult> => {
    const normalizedTaskId = parseIpcPayload('schedule:task:run', streamIdSchema, taskId)
    const scheduleRuntime = getScheduleRuntime()
    if (!scheduleRuntime) return { ok: false, message: 'Schedule runtime is not initialized.' }
    return scheduleRuntime.runTask(normalizedTaskId)
  })

  ipcMain.handle(
    'claw:channel:mirror',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('claw:channel:mirror', clawMirrorPayloadSchema, payload)
      const clawRuntime = getClawRuntime()
      if (!clawRuntime) return { ok: false as const, message: 'Claw runtime is not initialized.' }
      return clawRuntime.mirrorThreadMessageToIm(
        request.threadId,
        request.text,
        request.direction
      )
    }
  )

  ipcMain.handle(
    'claw:channel:mirror-to-feishu',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('claw:channel:mirror-to-feishu', clawMirrorPayloadSchema, payload)
      const clawRuntime = getClawRuntime()
      if (!clawRuntime) return { ok: false as const, message: 'Claw runtime is not initialized.' }
      return clawRuntime.mirrorThreadMessageToIm(
        request.threadId,
        request.text,
        request.direction
      )
    }
  )

  ipcMain.handle(
    'claw:task:create-from-text',
    async (_, payload: unknown): Promise<ClawTaskFromTextResult> => {
      const request = parseIpcPayload(
        'claw:task:create-from-text',
        clawTaskFromTextPayloadSchema,
        payload
      )
      const scheduleRuntime = getScheduleRuntime()
      if (!scheduleRuntime) return { kind: 'error', message: 'Schedule runtime is not initialized.' }
      const settings = await store.load()
      const channel = request.channelId
        ? settings.claw.channels.find((item) => item.id === request.channelId)
        : undefined
      return scheduleRuntime.createScheduledTaskFromText(request.text, {
        workspaceRoot: channel?.workspaceRoot || settings.schedule.defaultWorkspaceRoot || settings.workspaceRoot,
        modelHint: request.modelHint,
        mode: request.mode
      })
    }
  )

  ipcMain.handle(
    'schedule:task:create-from-text',
    async (_, payload: unknown): Promise<ScheduleTaskFromTextResult> => {
      const request = parseIpcPayload(
        'schedule:task:create-from-text',
        scheduleTaskFromTextPayloadSchema,
        payload
      )
      const scheduleRuntime = getScheduleRuntime()
      if (!scheduleRuntime) return { kind: 'error', message: 'Schedule runtime is not initialized.' }
      return scheduleRuntime.createScheduledTaskFromText(request.text, {
        workspaceRoot: request.workspaceRoot,
        modelHint: request.modelHint,
        mode: request.mode
      })
    }
  )

  ipcMain.handle(
    'claw:im-install:qrcode',
    async (_, payload: unknown) => {
      const request = parseIpcPayload(
        'claw:im-install:qrcode',
        z.object({ provider: z.enum(['feishu', 'weixin']), isLark: z.boolean().optional() }).strict(),
        payload
      )
      if (request.provider === 'weixin') {
        return startWeixinInstallQrcode()
      }
      return startFeishuInstallQrcode(request.isLark === true)
    }
  )

  ipcMain.handle(
    'claw:im-install:poll',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('claw:im-install:poll', clawImInstallPollPayloadSchema, payload)
      if (request.provider === 'weixin') {
        return pollWeixinInstall(request.deviceCode)
      }
      return pollFeishuInstall(request.deviceCode)
    }
  )

  ipcMain.handle('workspace:pick-directory', async (_, defaultPath: unknown): Promise<WorkspacePickResult> => {
    const normalizedDefaultPath = parseIpcPayload(
      'workspace:pick-directory',
      z.object({ defaultPath: defaultPathSchema }).strict(),
      { defaultPath }
    ).defaultPath
    const options: Electron.OpenDialogOptions = {
      title: 'Select working directory',
      defaultPath: normalizedDefaultPath,
      properties: ['openDirectory', 'createDirectory', 'dontAddToRecent']
    }
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    return {
      canceled: result.canceled,
      path: result.canceled ? null : (result.filePaths[0] ?? null)
    }
  })

  ipcMain.handle(
    'skill:save-file',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('skill:save-file', skillSaveFilePayloadSchema, payload)
      try {
        const rootPath = expandHomePath(request.rootPath)
        if (!rootPath) {
          return { ok: false as const, message: 'Skill directory is required.' }
        }
        const skillName = normalizeSkillFolderName(request.skillName)
        const skillDir = join(rootPath, skillName)
        const filePath = join(skillDir, 'SKILL.md')
        await mkdir(skillDir, { recursive: true })
        await writeFile(filePath, request.content, 'utf8')
        return { ok: true as const, path: filePath }
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle('skill:list', async (_, payload: unknown) => {
    const request = parseIpcPayload('skill:list', skillListPayloadSchema, payload)
    const settings = await store.load()
    return listGuiSkills(settings, request.workspaceRoot)
  })

  ipcMain.handle('phase7:diagnostics', async (_, payload: unknown) => {
    const request = parseIpcPayload('phase7:diagnostics', phase7DiagnosticsPayloadSchema, payload ?? {})
    const settings = await store.load()
    return getPhase7Diagnostics(settings, {
      workspaceRoot: request.workspaceRoot || settings.workspaceRoot
    })
  })

  ipcMain.handle('skill:open-root', async (_, rootPath: unknown) => {
    const normalizedRootPath = parseIpcPayload('skill:open-root', rootPathSchema, rootPath)
    try {
      const target = expandHomePath(normalizedRootPath)
      if (!target) {
        return { ok: false as const, message: 'Skill directory is required.' }
      }
      await mkdir(target, { recursive: true })
      return openPathWithShell(target)
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('deepseek:config:read', async () => {
    const path = resolveKunConfigPath()
    try {
      const content = await readFile(path, 'utf8')
      return { path, content, exists: true as const }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { path, content: '', exists: false as const }
      }
      throw error
    }
  })

  ipcMain.handle('deepseek:config:write', async (_, content: unknown) => {
    const validatedContent = parseIpcPayload(
      'deepseek:config:write',
      deepseekConfigContentSchema,
      content
    )
    const path = resolveKunConfigPath()
    validateMcpConfigContent(validatedContent)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, validatedContent, 'utf8')
    try {
      await onKunMcpConfigWritten?.(path, validatedContent)
    } catch (error: unknown) {
      logError('mcp-config', 'Failed to apply MCP config change after write', {
        path,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    return { ok: true as const, path }
  })

  ipcMain.handle('deepseek:config:open-dir', async () => {
    try {
      const path = resolveKunConfigPath()
      const dirPath = dirname(path)
      await mkdir(dirPath, { recursive: true })
      return openPathWithShell(dirPath)
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('user-agent-stack:preview', async (_, payload: unknown) => {
    try {
      const request = parseIpcPayload(
        'user-agent-stack:preview',
        userAgentStackImportPayloadSchema,
        payload ?? {}
      )
      const settings = await store.load()
      const profile = await discoverUserAgentStackProfile({
        workspaceRoot: request.workspaceRoot || settings.workspaceRoot
      })
      return { ok: true as const, profile }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('user-agent-stack:import', async (_, payload: unknown) => {
    try {
      const request = parseIpcPayload(
        'user-agent-stack:import',
        userAgentStackImportPayloadSchema,
        payload ?? {}
      )
      const settings = await store.load()
      const profile = await discoverUserAgentStackProfile({
        workspaceRoot: request.workspaceRoot || settings.workspaceRoot
      })
      const nextSettings = await applySettingsPatch({
        agents: {
          kun: {
            userAgentStack: profile
          }
        }
      })
      return { ok: true as const, profile, settings: nextSettings }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('git:branches', async (_, workspaceRoot: unknown) =>
    getGitBranches(parseIpcPayload('git:branches', workspaceRootSchema, workspaceRoot))
  )
  ipcMain.handle(
    'git:switch-branch',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('git:switch-branch', gitBranchPayloadSchema, payload)
      return switchGitBranch(request.workspaceRoot, request.branch)
    }
  )
  ipcMain.handle(
    'git:create-and-switch-branch',
    async (_, payload: unknown) => {
      const request = parseIpcPayload(
        'git:create-and-switch-branch',
        gitBranchPayloadSchema,
        payload
      )
      return createAndSwitchGitBranch(request.workspaceRoot, request.branch)
    }
  )
  ipcMain.handle('git:worktrees', async (_, workspaceRoot: unknown) =>
    listGitWorktrees(parseIpcPayload('git:worktrees', workspaceRootSchema, workspaceRoot))
  )
  ipcMain.handle(
    'git:worktree:create-managed',
    async (_, payload: unknown) => {
      const request = parseIpcPayload(
        'git:worktree:create-managed',
        managedGitWorktreeCreatePayloadSchema,
        payload
      )
      return createManagedGitWorktree(request.workspaceRoot, {
        branch: request.branch,
        baseBranch: request.baseBranch,
        worktreeParent: request.worktreeParent
      })
    }
  )
  ipcMain.handle(
    'git:worktree:remove-managed',
    async (_, payload: unknown) => {
      const request = parseIpcPayload(
        'git:worktree:remove-managed',
        managedGitWorktreeRemovePayloadSchema,
        payload
      )
      return removeManagedGitWorktree(request.workspaceRoot, request.path, {
        confirmation: request.confirmation,
        snapshotParent: request.snapshotParent
      })
    }
  )
  ipcMain.handle(
    'git:worktree:handoff',
    async (_, payload: unknown) => {
      const request = parseIpcPayload(
        'git:worktree:handoff',
        managedGitWorktreeHandoffPayloadSchema,
        payload
      )
      return createGitWorktreeHandoffSummary(request.workspaceRoot, request.path, {
        threadId: request.threadId,
        goal: request.goal
      })
    }
  )
  ipcMain.handle('git:diff', async (_, workspaceRoot: unknown) =>
    getGitDiff(parseIpcPayload('git:diff', workspaceRootSchema, workspaceRoot))
  )
  ipcMain.handle(
    'git:review-preparation',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('git:review-preparation', gitReviewPreparationPayloadSchema, payload)
      return getGitReviewPreparation(request.workspaceRoot, {
        commitMessage: request.commitMessage,
        remote: request.remote,
        baseBranch: request.baseBranch
      })
    }
  )
  ipcMain.handle(
    'git:audit-log',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('git:audit-log', gitAuditLogPayloadSchema, payload)
      return listGitAuditEvents(request.workspaceRoot, {
        limit: request.limit
      })
    }
  )
  ipcMain.handle(
    'git:stage-paths',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('git:stage-paths', gitPathListPayloadSchema, payload)
      return stageGitPaths(request.workspaceRoot, request.paths)
    }
  )
  ipcMain.handle(
    'git:discard-changes',
    async (_, payload: unknown) => {
      const request = parseIpcPayload('git:discard-changes', gitDiscardPayloadSchema, payload)
      return discardGitChanges(request.workspaceRoot, request.paths, {
        confirmation: request.confirmation
      })
    }
  )

  ipcMain.handle('editor:list', async () => listEditorsResult())
  ipcMain.handle('editor:open-path', async (_, payload: unknown) =>
    openEditorPath(parseIpcPayload('editor:open-path', openEditorPathPayloadSchema, payload))
  )

  ipcMain.handle('file:resolve-workspace', async (_, payload: unknown) =>
    resolveWorkspaceFile(
      parseIpcPayload('file:resolve-workspace', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:list-workspace-directory', async (_, payload: unknown) =>
    listWorkspaceDirectory(
      parseIpcPayload('file:list-workspace-directory', workspaceDirectoryTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:read-workspace', async (_, payload: unknown) =>
    readWorkspaceFile(
      parseIpcPayload('file:read-workspace', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:read-workspace-image', async (_, payload: unknown) =>
    readWorkspaceImage(
      parseIpcPayload('file:read-workspace-image', workspaceFileTargetPayloadSchema, payload)
    )
  )
  ipcMain.handle('file:write-workspace', async (_, payload: unknown) =>
    writeWorkspaceFile(
      parseIpcPayload('file:write-workspace', workspaceFileWritePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:create-workspace', async (_, payload: unknown) =>
    createWorkspaceFile(
      parseIpcPayload('file:create-workspace', workspaceFileCreatePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:create-workspace-directory', async (_, payload: unknown) =>
    createWorkspaceDirectory(
      parseIpcPayload('file:create-workspace-directory', workspaceDirectoryCreatePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:save-workspace-clipboard-image', async (_, payload: unknown) =>
    saveWorkspaceClipboardImage(
      parseIpcPayload(
        'file:save-workspace-clipboard-image',
        workspaceClipboardImageSavePayloadSchema,
        payload
      )
    )
  )
  ipcMain.handle('clipboard:read-image', async () => readClipboardImage())
  ipcMain.handle('file:rename-workspace-entry', async (_, payload: unknown) =>
    renameWorkspaceEntry(
      parseIpcPayload('file:rename-workspace-entry', workspaceEntryRenamePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:delete-workspace-entry', async (_, payload: unknown) =>
    deleteWorkspaceEntry(
      parseIpcPayload('file:delete-workspace-entry', workspaceEntryDeletePayloadSchema, payload)
    )
  )
  ipcMain.handle('file:watch-workspace', async (event, payload: unknown) => {
    const request = parseIpcPayload('file:watch-workspace', workspaceFileWatchPayloadSchema, payload)
    const initial = await readWorkspaceFile(request)
    let watchedPath: string
    let initialContent: string
    let initialSize: number
    let initialTruncated: boolean
    if (initial.ok) {
      watchedPath = initial.path
      initialContent = initial.content
      initialSize = initial.size
      initialTruncated = initial.truncated
    } else {
      const initialImage = await readWorkspaceImage(request)
      if (!initialImage.ok) return initial
      watchedPath = initialImage.path
      initialContent = ''
      initialSize = initialImage.size
      initialTruncated = false
    }

    const watchId = randomUUID()
    try {
      const watcher = watch(watchedPath, { persistent: false }, () => {
        scheduleWorkspaceFileChange(watchId)
      })
      workspaceFileWatchers.set(watchId, {
        watcher,
        sender: event.sender,
        path: watchedPath,
        workspaceRoot: request.workspaceRoot,
        timer: null
      })
      event.sender.once('destroyed', () => disposeWorkspaceFileWatchesForSender(event.sender))
      return {
        ok: true as const,
        watchId,
        path: watchedPath,
        content: initialContent,
        size: initialSize,
        truncated: initialTruncated,
        startedAt: new Date().toISOString()
      }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  })
  ipcMain.handle('file:unwatch-workspace', async (_, watchId: unknown) =>
    disposeWorkspaceFileWatch(parseIpcPayload('file:unwatch-workspace', streamIdSchema, watchId))
  )
  ipcMain.handle('write:export', async (_, payload: unknown) =>
    exportWriteDocument(
      parseIpcPayload('write:export', writeExportPayloadSchema, payload),
      { parentWindow: getMainWindow() }
    )
  )
  ipcMain.handle('write:copy-rich-text', async (_, payload: unknown) =>
    copyWriteDocumentAsRichText(
      parseIpcPayload('write:copy-rich-text', writeRichClipboardPayloadSchema, payload)
    )
  )
  ipcMain.handle('write:inline-completion', async (_, payload: unknown) =>
    requestWriteInlineCompletion(
      await store.load(),
      parseIpcPayload('write:inline-completion', writeInlineCompletionPayloadSchema, payload)
    )
  )
  ipcMain.handle('write:inline-completion-debug:list', async () => listWriteInlineCompletionDebugEntries())
  ipcMain.handle('write:inline-completion-debug:clear', async () => {
    clearWriteInlineCompletionDebugEntries()
    return true
  })
  ipcMain.handle('desktop:command', async (event, command: unknown) => {
    runDesktopCommand(
      parseIpcPayload('desktop:command', desktopCommandSchema, command),
      event.sender,
      getMainWindow
    )
  })
  ipcMain.handle('shell:open-external', async (_, url: unknown) => {
    const validatedUrl = parseIpcPayload('shell:open-external', shellOpenExternalUrlSchema, url)
    await shell.openExternal(validatedUrl)
  })
  ipcMain.handle('notification:turn-complete', async (_, payload: unknown) =>
    showTurnCompleteNotification(
      parseIpcPayload('notification:turn-complete', notificationPayloadSchema, payload)
    )
  )
  ipcMain.handle('app:version', async () => getAppVersion())
  ipcMain.handle('gui:update-state', async () => readGuiUpdateState())
  ipcMain.handle('gui:update-check', async (_, channel: unknown): Promise<GuiUpdateInfo> => {
    const module = await loadGuiUpdaterModule()
    return module.checkGuiUpdate(
      parseIpcPayload(
        'gui:update-check',
        z.object({ channel: guiUpdateChannelSchema }).strict(),
        { channel }
      ).channel
    )
  })
  ipcMain.handle('gui:update-download', async (_, channel: unknown): Promise<GuiUpdateDownloadResult> => {
    const module = await loadGuiUpdaterModule()
    return module.downloadGuiUpdate(
      parseIpcPayload(
        'gui:update-download',
        z.object({ channel: guiUpdateChannelSchema }).strict(),
        { channel }
      ).channel
    )
  })
  ipcMain.handle('gui:update-install', async (): Promise<GuiUpdateInstallResult> => {
    const module = await loadGuiUpdaterModule()
    return module.installGuiUpdate()
  })

  ipcMain.handle('log:error', async (_, payload: unknown) => {
    const request = parseIpcPayload('log:error', logErrorPayloadSchema, payload)
    logError(request.category, request.message, request.detail)
  })
  ipcMain.handle('log:get-path', async () => resolveLogDirectory())
  ipcMain.handle('log:open-dir', async () => {
    const dir = resolveLogDirectory()
    try {
      await mkdir(dir, { recursive: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, message }
    }
    const error = await shell.openPath(dir)
    if (error) return { ok: false, message: error }
    return { ok: true }
  })

  // Terminal PTY handlers

  // Track terminal sessions per sender WebContents for cleanup on destroy
  const terminalSenderSessions = new Map<number, Set<string>>()

  const trackTerminalSession = (sender: WebContents, sessionId: string): void => {
    const senderId = sender.id
    let sessions = terminalSenderSessions.get(senderId)
    if (!sessions) {
      sessions = new Set()
      terminalSenderSessions.set(senderId, sessions)
      sender.once('destroyed', () => {
        const svc = getTerminalService()
        const ids = terminalSenderSessions.get(senderId)
        if (ids && svc) {
          for (const id of ids) {
            svc.kill(id)
          }
        }
        terminalSenderSessions.delete(senderId)
      })
    }
    sessions.add(sessionId)
  }

  const untrackTerminalSession = (sender: WebContents, sessionId: string): void => {
    const sessions = terminalSenderSessions.get(sender.id)
    if (sessions) {
      sessions.delete(sessionId)
      if (sessions.size === 0) {
        terminalSenderSessions.delete(sender.id)
      }
    }
  }

  ipcMain.handle('terminal:settings', async () => {
    const settings = await store.load()
    const svc = getTerminalService()
    if (!svc) return { enabled: false }
    return { enabled: svc.isEnabled(settings) }
  })

  ipcMain.handle('terminal:spawn', async (event, payload: unknown) => {
    const svc = getTerminalService()
    if (!svc) return { ok: false as const, message: 'Terminal service is not available.' }
    const settings = await store.load()
    if (!svc.isEnabled(settings)) return { ok: false as const, message: 'Terminal is disabled in settings.' }
    const request = parseIpcPayload('terminal:spawn', terminalSpawnPayloadSchema, payload)
    const projectDir = (await getActiveProjectDir()) || process.cwd()

    // Enforce cwd containment: renderer-provided cwd is untrusted.
    // PTYs must spawn inside the active project directory.
    const effectiveCwd = request.cwd?.trim() || projectDir
    if (!isPathWithinRoot(effectiveCwd, projectDir)) {
      return {
        ok: false as const,
        message: `PTY cwd "${effectiveCwd}" is outside the active project directory "${projectDir}".`
      }
    }
    const cols = request.cols ?? 80
    const rows = request.rows ?? 24

    const { id, pty } = svc.spawn(effectiveCwd, cols, rows)

    // Forward PTY output to the renderer
    const sender = event.sender
    trackTerminalSession(sender, id)

    pty.onData((data: string) => {
      if (!sender.isDestroyed()) {
        sender.send('terminal:data', { sessionId: id, data })
      }
    })

    return {
      ok: true as const,
      sessionId: id,
      cwd: effectiveCwd,
      cols,
      rows
    }
  })

  ipcMain.handle('terminal:list', async (): Promise<TerminalSessionInfo[]> => {
    const svc = getTerminalService()
    return svc?.list() ?? []
  })

  ipcMain.handle('terminal:write', async (_event, payload: unknown) => {
    const svc = getTerminalService()
    if (!svc) return { ok: false as const, message: 'Terminal service is not available.' }
    const request = parseIpcPayload('terminal:write', terminalWritePayloadSchema, payload)
    const result = svc.write(request.sessionId, request.data)
    return { ok: result as true | false }
  })

  ipcMain.handle('terminal:resize', async (_event, payload: unknown) => {
    const svc = getTerminalService()
    if (!svc) return { ok: false as const, message: 'Terminal service is not available.' }
    const request = parseIpcPayload('terminal:resize', terminalResizePayloadSchema, payload)
    const result = svc.resize(request.sessionId, request.cols, request.rows)
    return { ok: result as true | false }
  })

  ipcMain.handle('terminal:kill', async (event, payload: unknown) => {
    const svc = getTerminalService()
    if (!svc) return { ok: false as const, message: 'Terminal service is not available.' }
    const request = parseIpcPayload('terminal:kill', terminalSessionIdSchema, payload)
    const result = svc.kill(request.sessionId)
    if (result) {
      untrackTerminalSession(event.sender, request.sessionId)
    }
    return { ok: result as true | false }
  })

  ipcMain.handle('terminal:audit-events', async (): Promise<readonly TerminalAuditEvent[]> => {
    const svc = getTerminalService()
    return svc?.getAuditEvents() ?? []
  })

  ipcMain.handle('terminal:agent-exec-observed', async (_event, payload: unknown) => {
    const svc = getTerminalService()
    if (!svc) return { ok: false as const, message: 'Terminal service is not available.' }
    const request = parseIpcPayload(
      'terminal:agent-exec-observed',
      terminalAgentExecObservedPayloadSchema,
      payload
    )
    const detailParts: string[] = []
    if (request.toolName) detailParts.push(`tool=${request.toolName}`)
    if (request.toolKind) detailParts.push(`kind=${request.toolKind}`)
    if (request.exitCode !== undefined) detailParts.push(`exit_code=${request.exitCode}`)
    if (request.threadId) detailParts.push(`thread=${request.threadId}`)
    if (request.turnId) detailParts.push(`turn=${request.turnId}`)
    const detail = detailParts.length > 0 ? detailParts.join(' ') : undefined
    const summary = request.summary?.trim()
    svc.agentExecObserved({
      toolName: request.toolName,
      toolKind: request.toolKind,
      summary,
      outputTruncated: request.outputTruncated,
      exitCode: request.exitCode,
      threadId: request.threadId,
      detail
    })
    return { ok: true as const }
  })

  // -----------------------------------------------------------------------
  // Hooks IPC handlers
  // -----------------------------------------------------------------------

  /**
   * Push current hook settings from the app settings store to the running
   * Kun runtime via the POST /v1/runtime/hooks/reload endpoint. Best-effort
   * — silently ignores errors when Kun is not running.
   */
  async function pushHookSettingsToKun(): Promise<void> {
    try {
      const settings = await store.load()
      const hooksSettings = getKunRuntimeSettings(settings).hooks
      const body = JSON.stringify(hooksSettings)
      await runtimeRequest('/v1/runtime/hooks/reload', 'POST', body)
    } catch {
      // Kun may not be running; best-effort push
    }
  }

  ipcMain.handle('hooks:state', async (_event, payload: unknown) => {
    const settings = await store.load()
    const request = parseIpcPayload('hooks:state', hooksStatePayloadSchema, payload)
    const workspaceRoot = request.workspaceRoot || settings.workspaceRoot
    const hooksSettings = getKunRuntimeSettings(settings).hooks

    // Auto-revoke changed hooks
    const discovered = discoverAllHooks(workspaceRoot)
    const { settings: updatedSettings, revoked } = autoRevokeChangedHooks(discovered, hooksSettings)
    if (revoked.length > 0) {
      // Persist the auto-revocation
      await applySettingsPatch({ agents: { kun: { hooks: { trustedHooks: updatedSettings.trustedHooks } } } })
      // Push revoked state to running Kun if alive
      await pushHookSettingsToKun()
    }

    const effective = revoked.length > 0 ? updatedSettings : hooksSettings
    const hooks = discovered.map((hook) => {
      const entry = effective.trustedHooks[hook.id]
      const hashMatches = entry ? entry.contentHash === hook.contentHash : false
      return {
        id: hook.id,
        scriptPath: hook.scriptPath,
        scope: hook.scope,
        phase: hook.phase,
        trusted: entry?.trusted === true && hashMatches,
        approvedAt: entry?.approvedAt,
        contentHash: hook.contentHash,
        hashMatches
      }
    })

    return {
      killSwitchEnabled: effective.enabled,
      hooks,
      auditLog: effective.auditLog
    }
  })

  ipcMain.handle('hooks:approve', async (_event, payload: unknown) => {
    const settings = await store.load()
    const request = parseIpcPayload('hooks:approve', hookApprovePayloadSchema, payload)
    const workspaceRoot = request.workspaceRoot || settings.workspaceRoot
    const hooksSettings = getKunRuntimeSettings(settings).hooks

    const discovered = discoverAllHooks(workspaceRoot)
    const hook = discovered.find((h) => h.id === request.hookId)
    if (!hook) {
      return { ok: false as const, message: `Hook not found: ${request.hookId}` }
    }

    const { settings: nextHookSettings, entry } = approveHook(hook, hooksSettings)
    await applySettingsPatch({ agents: { kun: { hooks: nextHookSettings } } })
    // Push approved trust state to running Kun if alive
    await pushHookSettingsToKun()

    return { ok: true as const, entry: { id: entry.id, trusted: entry.trusted, approvedAt: entry.approvedAt } }
  })

  ipcMain.handle('hooks:revoke', async (_event, payload: unknown) => {
    const settings = await store.load()
    const request = parseIpcPayload('hooks:revoke', hookRevokePayloadSchema, payload)
    const hooksSettings = getKunRuntimeSettings(settings).hooks
    const nextHookSettings = revokeHook(request.hookId, hooksSettings)
    await applySettingsPatch({ agents: { kun: { hooks: nextHookSettings } } })
    // Push revoked state to running Kun if alive
    await pushHookSettingsToKun()
    return { ok: true as const, entry: { id: request.hookId, trusted: false, approvedAt: undefined } }
  })

  ipcMain.handle('hooks:read-source', async (_event, payload: unknown) => {
    const settings = await store.load()
    const request = parseIpcPayload('hooks:read-source', hookSourcePayloadSchema, payload)
    const workspaceRoot = request.workspaceRoot || settings.workspaceRoot

    const discovered = discoverAllHooks(workspaceRoot)
    const hook = discovered.find((h) => h.id === request.hookId)
    if (!hook) {
      return { ok: false as const, message: `Hook not found: ${request.hookId}` }
    }

    const result = readHookSource(hook.scriptPath)
    if (!result.ok) {
      return { ok: false as const, message: result.error }
    }
    return { ok: true as const, content: result.content, scriptPath: hook.scriptPath }
  })

  ipcMain.handle('hooks:kill-switch', async (_event, payload: unknown) => {
    const settings = await store.load()
    const request = parseIpcPayload('hooks:kill-switch', hooksKillSwitchPayloadSchema, payload)
    const hooksSettings = getKunRuntimeSettings(settings).hooks
    const nextHookSettings = setKillSwitch(request.enabled, hooksSettings)
    await applySettingsPatch({ agents: { kun: { hooks: nextHookSettings } } })
    // Push kill-switch state to running Kun if alive
    await pushHookSettingsToKun()
    return { ok: true as const }
  })

  /* ------------------------------------------------------------------ */
  /*  Remote Runner IPC handlers                                        */
  /* ------------------------------------------------------------------ */

  const zHostId = z.string().trim().min(1).max(256)
  const zRemoteRunnerTrustPath = z.object({
    hostId: zHostId,
    path: z.string().trim().min(1),
    label: z.string().trim().min(1).max(200)
  }).strict()
  const zRemoteRunnerRevokeTrust = z.object({
    hostId: zHostId,
    path: z.string().trim().min(1)
  }).strict()

  function requireRemoteRunner(): RemoteRunnerService {
    const svc = getRemoteRunnerService()
    if (!svc) throw new Error('Remote runner service is not available.')
    return svc
  }

  ipcMain.handle('remote-runner:status', async () => {
    const settings = await store.load()
    const rrSettings = getKunRuntimeSettings(settings).remoteRunners
    const svc = getRemoteRunnerService()
    const liveHandles: RemoteRunnerHandle[] = svc?.getAllHandles() ?? []
    const liveIds = new Set(liveHandles.map((h) => h.id))

    // Map live (registered) handles with current runtime state.
    const liveHosts = liveHandles.map((h) => ({
      id: h.id,
      label: h.label,
      enabled: h.hostConfig.enabled,
      connectionStatus: h.status,
      lastHandshake: h.lastHandshake ? {
        issuedAt: h.lastHandshake.issuedAt,
        shell: { os: h.lastHandshake.shell.os, shell: h.lastHandshake.shell.shell },
        gitAvailable: h.lastHandshake.git.available,
        toolPolicy: h.lastHandshake.toolPolicy as Record<string, string>
      } : null,
      lastError: h.lastError,
      trustedPaths: h.trustedPaths
    }))

    // Include configured hosts that haven't been registered yet (H10:
    // status must list configured hosts even before first connect).
    const configuredHosts = rrSettings.hosts
      .filter((h) => !liveIds.has(h.id))
      .map((h) => ({
        id: h.id,
        label: h.label,
        enabled: h.enabled,
        connectionStatus: 'disconnected' as const,
        lastHandshake: null,
        lastError: null,
        trustedPaths: h.trustedPaths
      }))

    const hosts = [...liveHosts, ...configuredHosts]

    // Read audit log from the live service so connect/trust/exec events appear immediately.
    // Only metadata fields are returned — no raw secrets.
    const serviceAuditLog = svc?.getAuditLog() ?? rrSettings.auditLog
    return {
      hosts,
      enabled: rrSettings.enabled,
      auditLog: serviceAuditLog.slice(-50).map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        runnerId: entry.runnerId,
        action: entry.action,
        outcome: entry.outcome,
        reason: entry.reason
      }))
    }
  })

  ipcMain.handle('remote-runner:connect', async (_event, hostId: unknown) => {
    const id = parseIpcPayload('remote-runner:connect', zHostId, hostId)
    const svc = requireRemoteRunner()
    const settings = await store.load()
    const rrSettings = getKunRuntimeSettings(settings).remoteRunners
    const hostConfig = rrSettings.hosts.find((h) => h.id === id)
    if (!hostConfig) return { ok: false as const, message: `Host not found: ${id}` }
    svc.registerHost(hostConfig)
    try {
      await svc.connectHost(id)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('remote-runner:disconnect', async (_event, hostId: unknown) => {
    const id = parseIpcPayload('remote-runner:disconnect', zHostId, hostId)
    const svc = requireRemoteRunner()
    try {
      await svc.disconnectHost(id)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('remote-runner:reconnect', async (_event, hostId: unknown) => {
    const id = parseIpcPayload('remote-runner:reconnect', zHostId, hostId)
    const svc = requireRemoteRunner()
    try {
      await svc.reconnectHost(id)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('remote-runner:handshake', async (_event, hostId: unknown) => {
    const id = parseIpcPayload('remote-runner:handshake', zHostId, hostId)
    const svc = requireRemoteRunner()
    try {
      await svc.handshakeHost(id)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('remote-runner:trust-path', async (_event, payload: unknown) => {
    const request = parseIpcPayload('remote-runner:trust-path', zRemoteRunnerTrustPath, payload)
    const svc = requireRemoteRunner()
    try {
      svc.trustPath(request.hostId, request.path, request.label)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('remote-runner:revoke-trust', async (_event, payload: unknown) => {
    const request = parseIpcPayload('remote-runner:revoke-trust', zRemoteRunnerRevokeTrust, payload)
    const svc = requireRemoteRunner()
    try {
      svc.revokeTrustPath(request.hostId, request.path)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('remote-runner:audit-log', async () => {
    const svc = getRemoteRunnerService()
    const settings = await store.load()
    const rrSettings = getKunRuntimeSettings(settings).remoteRunners
    const serviceAuditLog = svc?.getAuditLog() ?? rrSettings.auditLog
    return serviceAuditLog.slice(-50).map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      runnerId: entry.runnerId,
      action: entry.action,
      outcome: entry.outcome,
      reason: entry.reason
    }))
  })

  /* ---- Remote exec / stop / resume ---- */

  ipcMain.handle('remote-runner:exec', async (_event, payload: unknown) => {
    const request = parseIpcPayload('remote-runner:exec', remoteRunnerExecPayloadSchema, payload)
    const svc = requireRemoteRunner()
    const settings = await store.load()
    const rrSettings = getKunRuntimeSettings(settings).remoteRunners
    const hostConfig = rrSettings.hosts.find((h) => h.id === request.hostId)
    if (!hostConfig) return { ok: false as const, message: `Host not found: ${request.hostId}` }
    // Ensure host is registered and connected
    svc.registerHost(hostConfig)
    const handle = svc.getHandle(request.hostId)
    if (!handle || handle.status !== 'connected') {
      try {
        await svc.connectHost(request.hostId)
      } catch (err) {
        return { ok: false as const, message: `Cannot connect to host: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    try {
      const runId = await svc.execCommand(request.hostId, request.command, {
        cwd: request.cwd,
        timeoutMs: request.timeoutMs,
        maxOutputBytes: request.maxOutputBytes
      })
      const activeRun = svc.getActiveRun(runId)
      return {
        ok: true as const,
        runId,
        output: activeRun?.output ?? '',
        exitCode: activeRun?.exitCode ?? null
      }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('remote-runner:stop', async (_event, hostId: unknown) => {
    const id = parseIpcPayload('remote-runner:stop', zHostId, hostId)
    const svc = requireRemoteRunner()
    const handle = svc.getHandle(id)
    const wasRunning = handle?.activeRunId !== null
    try {
      await svc.stopRun(id)
      return { ok: true as const, hostId: id, wasRunning }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('remote-runner:resume', async (_event, hostId: unknown) => {
    const id = parseIpcPayload('remote-runner:resume', zHostId, hostId)
    const svc = requireRemoteRunner()
    try {
      const runId = await svc.resumeRun(id)
      return { ok: true as const, hostId: id, runId, restored: runId !== null }
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) }
    }
  })

  /* ------------------------------------------------------------------ */
  /*  Mobile Access IPC handlers                                        */
  /* ------------------------------------------------------------------ */

  function requireMobilePairing(): MobilePairingService {
    const svc = getMobilePairingService()
    if (!svc) throw new Error('Mobile pairing service is not available.')
    return svc
  }

  /**
   * Generate a QR pairing payload: one-time code, cert fingerprint,
   * real LAN host candidates, and expiry. Called from renderer.
   */
  ipcMain.handle('mobile-access:qr-payload', async () => {
    const pairing = requireMobilePairing()
    const listener = getMobileAccessListener()

    if (!pairing.isEnabled()) {
      return { ok: false as const, message: 'Mobile access is disabled.' }
    }

    const { code, expiresAt } = pairing.generatePairingCode()
    const certFingerprint = listener?.getCertFingerprint() ?? null
    const hostCandidates = listener?.getHostCandidates() ?? [{ host: 'localhost', port: 19443 }]

    return {
      ok: true as const,
      pairingCode: code,
      expiresAt: new Date(expiresAt).toISOString(),
      certFingerprint,
      hostCandidates
    }
  })

  /**
   * Enable or disable mobile access. Starts/stops the TLS listener
   * and persists the setting.
   */
  ipcMain.handle('mobile-access:set-enabled', async (_event, enabled: unknown) => {
    const flag = parseIpcPayload('mobile-access:set-enabled', mobileAccessEnabledSchema, enabled)
    const pairing = requireMobilePairing()
    const listener = getMobileAccessListener()

    // Persist the setting
    const settings = await store.load()
    const mobileAccess = settings.agents?.kun?.mobileAccess
    await applySettingsPatch({
      agents: { kun: { mobileAccess: { enabled: flag } as any } }
    })

    if (flag) {
      // Create listener if none exists
      if (!listener) {
        const newListener = new MobileTlsListener({
          pairingService: pairing,
          port: mobileAccess?.port ?? 19443,
          host: mobileAccess?.host ?? '0.0.0.0',
          certDir: join(app.getPath('userData'), 'mobile-certs'),
          runtimeRequest: async (path, init) => {
            return runtimeRequest(path, init.method, init.body)
          },
          onAudit: (entry) => {
            // Append audit event to settings
            store.load().then((s) => {
              const ma = s.agents?.kun?.mobileAccess
              const auditLog = [entry, ...(ma?.auditLog ?? [])].slice(0, ma?.maxAuditEntries ?? 500)
              applySettingsPatch({ agents: { kun: { mobileAccess: { auditLog } as any } } }).catch(() => {})
            }).catch(() => {})
          }
        })
        try {
          await newListener.start()
          setMobileAccessListener(newListener)
        } catch (err) {
          return { ok: false as const, message: `Failed to start TLS listener: ${err instanceof Error ? err.message : String(err)}` }
        }
      } else if (!listener.isRunning()) {
        try {
          await listener.start()
        } catch (err) {
          return { ok: false as const, message: `Failed to start TLS listener: ${err instanceof Error ? err.message : String(err)}` }
        }
      }
    } else {
      // Disable — stop the listener
      if (listener && listener.isRunning()) {
        try {
          await listener.stop()
        } catch (err) {
          logError('mobile-access', 'Failed to stop TLS listener', { message: err instanceof Error ? err.message : String(err) })
        }
      }
    }

    return { ok: true as const }
  })

  /**
   * Revoke a specific paired device using the pairing service.
   */
  ipcMain.handle('mobile-access:revoke-device', async (_event, deviceId: unknown) => {
    const id = parseIpcPayload('mobile-access:revoke-device', mobileAccessDeviceIdSchema, deviceId)
    const pairing = requireMobilePairing()
    const ok = pairing.revokeDevice(id)
    if (!ok) return { ok: false as const, deviceId: id }
    return { ok: true as const, deviceId: id }
  })

  /**
   * Revoke all paired devices using the pairing service.
   */
  ipcMain.handle('mobile-access:revoke-all', async () => {
    const pairing = requireMobilePairing()
    const count = pairing.revokeAllDevices()
    return { ok: true as const, count }
  })

  /**
   * Get live mobile access status: listener state, devices, audit log.
   */
  ipcMain.handle('mobile-access:status', async () => {
    const pairing = getMobilePairingService()
    const listener = getMobileAccessListener()
    const settings = await store.load()
    const mobileAccess = settings.agents?.kun?.mobileAccess

    return {
      listenerRunning: listener?.isRunning() ?? false,
      enabled: mobileAccess?.enabled ?? false,
      port: mobileAccess?.port ?? 19443,
      host: mobileAccess?.host ?? '0.0.0.0',
      certFingerprint: listener?.getCertFingerprint() ?? null,
      hostCandidates: listener?.getHostCandidates() ?? [],
      devices: (mobileAccess?.devices ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt
      })),
      auditLog: (mobileAccess?.auditLog ?? []).map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        actor: e.actor,
        deviceId: e.deviceId,
        deviceName: e.deviceName,
        action: e.action,
        details: e.details
      }))
    }
  })
}
