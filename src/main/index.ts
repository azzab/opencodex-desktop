import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, powerSaveBlocker, Tray } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  JsonSettingsStore,
  devServerHintUrl
} from './settings-store'
import opencodexLogoPng from '../asset/img/opencodex.png?url'
import opencodexTrayPng from '../asset/img/opencodex_tray.png?url'
import { createAppIcon, pickTrayIcon } from './app-icon'
import { configureLinuxWaylandImeSwitches } from './app-command-line'
import { configureAppIdentity } from './app-identity'
import { buildLoginItemSettings, shouldSyncLoginItemSettings } from './login-item-settings'
import {
  applyKunRuntimePatch,
  kunSettingsEnvelope,
  getActiveAgentApiKey,
  getKunRuntimeSettings,
  mergeKunRuntimeSettings,
  mergeClawSettings,
  mergeModelProviderSettings,
  mergeScheduleSettings,
  mergeWriteSettings,
  normalizeAppSettings,
  normalizeAppBehaviorSettings,
  normalizeKeyboardShortcuts,
  resolveKunRuntimeSettings,
  type AppBehaviorConfigV1,
  type AppSettingsPatch,
  type AppSettingsV1
} from '../shared/app-settings'
import { CredentialStore } from './services/credential-store'
import { STORED_ENCRYPTED_MARKER } from '../shared/app-settings-types'
import { parseRuntimeErrorBody, runtimeErrorToError, type RuntimeErrorCode } from '../shared/runtime-error'
import type { GuiUpdateState } from '../shared/gui-update'
import { isAllowedDevPreviewUrl } from '../shared/dev-preview-url'
import { fetchUpstreamModelIds } from './upstream-models'
import {
  kunRuntimeAdapter,
  getRuntimeBaseUrlForSettings,
  runtimeAuthHeaders,
  runtimeRequestViaHost
} from './runtime/kun-adapter'
import { waitForRuntimeTurnsIdle } from './runtime/managed-runtime-idle'
import { configureLogger, logError, logWarn, pruneOnStartup } from './logger'
import {
  createReleaseSmokeController,
  resolveReleaseSmokeConfig,
  type ReleaseSmokeController
} from './release-smoke'
import { createClawRuntime, type ClawRuntime } from './claw-runtime'
import { createScheduleRuntime, type ScheduleRuntime } from './schedule-runtime'
import { runClawScheduleMcpServerFromArgv } from './claw-schedule-mcp-server'
import {
  clawScheduleMcpSettingsChanged,
  resolveKunMcpJsonPath,
  syncClawScheduleMcpConfig,
  type ClawScheduleMcpLaunchConfig
} from './claw-schedule-mcp-config'
import { registerAppIpcHandlers } from './ipc/register-app-ipc-handlers'
import {
  configureManagedWeixinBridgeUrlResolver,
  pollFeishuInstall,
  pollWeixinInstall,
  startFeishuInstallQrcode,
  startWeixinInstallQrcode
} from './claw-platform-install'
import { registerRuntimeSseIpc } from './runtime-sse-ipc'
import {
  configureWeixinBridgeRuntimeContextProvider,
  ensureWeixinBridgeRpcUrl,
  sendWeixinBridgeMessage,
  stopWeixinBridgeRuntime
} from './weixin-bridge-runtime'
import { webhookUrl } from './claw-runtime-helpers'
import { isKunHealthResponseBody } from './kun-health'
import { getTerminalService, resetTerminalService } from './services/terminal-service'
import { RemoteRunnerService } from './services/remote-runner-service'
import { MobilePairingService } from './services/mobile-pairing-service'
import { MobileTlsListener } from './services/mobile-tls-listener'
import {
  localizedApprovalTitle,
  localizedApprovalMessage,
  localizedApprovalDetail,
  localizedApprovalButtons,
  resolveAppLocale
} from '../shared/remote-approval-locale'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_USER_MODEL_ID = 'app.opencodex.desktop'
const HIDDEN_START_ARG = '--hidden'
const startupTraceEnabled = process.env.DEEPSEEK_GUI_STARTUP_TRACE === '1'
const startupTraceStart = Date.now()

function traceStartup(label: string, detail?: unknown): void {
  if (!startupTraceEnabled) return
  const elapsed = String(Date.now() - startupTraceStart).padStart(6, ' ')
  if (detail === undefined) {
    console.info(`[startup +${elapsed}ms] ${label}`)
  } else {
    console.info(`[startup +${elapsed}ms] ${label}`, detail)
  }
}

function shouldStartWeixinBridgeRuntime(settings: AppSettingsV1): boolean {
  return settings.claw.enabled &&
    settings.claw.im.enabled &&
    settings.claw.channels.some((channel) => channel.enabled && channel.provider === 'weixin')
}

function syncWeixinBridgeRuntime(settings: AppSettingsV1): void {
  if (!shouldStartWeixinBridgeRuntime(settings)) return
  void ensureWeixinBridgeRpcUrl().catch((error) => {
    logWarn('weixin-bridge', 'Failed to start managed WeChat bridge.', {
      message: error instanceof Error ? error.message : String(error)
    })
  })
}

const runningClawScheduleMcpServer =
  process.argv.includes('--gui-schedule-mcp-server') || process.argv.includes('--claw-schedule-mcp-server')

function resolveLogDirectory(): string {
  return join(app.getPath('userData'), 'logs')
}

function resolvePreloadPath(): string {
  const cjsPath = join(__dirname, '../preload/index.cjs')
  if (existsSync(cjsPath)) return cjsPath
  return join(__dirname, '../preload/index.mjs')
}

function getClawScheduleMcpLaunchConfig(): ClawScheduleMcpLaunchConfig {
  return {
    appPath: app.getAppPath(),
    execPath: process.execPath,
    isPackaged: app.isPackaged
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function runtimeFailure(code: string, message: string, status = 0, details?: unknown) {
  return {
    ok: false as const,
    status,
    body: JSON.stringify({ code, message, ...(details !== undefined ? { details } : {}) })
  }
}

function resolveConfiguredApiKey(settings: AppSettingsV1): string {
  const fromSettings = getActiveAgentApiKey(settings)
  // If the key is encrypted, resolve from credential store
  if (fromSettings === STORED_ENCRYPTED_MARKER || !fromSettings) {
    const providerId = getKunRuntimeSettings(settings).providerId || 'deepseek'
    const stored = credentialStore?.getKeySync(providerId)
    if (stored) return stored
  }
  const fromEnv = process.env.DEEPSEEK_API_KEY?.trim() ?? ''
  return fromSettings !== STORED_ENCRYPTED_MARKER ? fromSettings : fromEnv
}

function runtimeJsonError(code: string, message: string): Error {
  return runtimeErrorToError({ code: code as RuntimeErrorCode, message })
}

traceStartup('main module evaluated')

if (runningClawScheduleMcpServer && process.platform === 'darwin') {
  app.dock?.hide()
}

// 在最早的阶段把 app 名称、AppUserModelId 都设好。
// Windows 任务栏 / 系统托盘 / 通知中心看到的应用名都来自这里;
// 设得太晚的话 BrowserWindow title、托盘、IPC 启动时拿到的还是旧的。
// 抽到 app-identity.ts 是为了让测试可以直接 import,不被 main 的
// whenReady 副作用污染。
configureAppIdentity()
configureLinuxWaylandImeSwitches()

const releaseSmokeConfig = resolveReleaseSmokeConfig()
if (releaseSmokeConfig.enabled && releaseSmokeConfig.userDataDir) {
  try {
    app.setPath('userData', releaseSmokeConfig.userDataDir)
  } catch (error) {
    console.error('[release-smoke] fail user_data_path', error)
    process.exit(1)
  }
}

if (!runningClawScheduleMcpServer && process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
}

let mainWindow: BrowserWindow | null = null
let store: JsonSettingsStore
let credentialStore: CredentialStore | null = null
let logDir = ''
let clawRuntime: ClawRuntime | null = null
let scheduleRuntime: ScheduleRuntime | null = null
let managedRuntimesStoppedForQuit = false
let managedRuntimesStopPromise: Promise<void> | null = null
let appBehavior: AppBehaviorConfigV1 = normalizeAppBehaviorSettings()
let tray: Tray | null = null
let isQuitting = false
let remoteRunnerService: RemoteRunnerService | null = null
let mobilePairingService: MobilePairingService | null = null
let mobileAccessListener: MobileTlsListener | null = null

type GuiUpdaterModule = typeof import('./gui-updater')

let guiUpdaterModulePromise: Promise<GuiUpdaterModule> | null = null
let guiUpdaterInitialized = false
let releaseSmokeController: ReleaseSmokeController | null = null

function emitClawChannelActivity(payload: { channelId: string; threadId: string }): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('claw:channel-activity', payload)
}

async function stopManagedRuntimesForQuit(): Promise<void> {
  if (managedRuntimesStoppedForQuit) return
  await stopManagedRuntimes()
  managedRuntimesStoppedForQuit = true
}

function getReleaseSmokeController(): ReleaseSmokeController {
  if (!releaseSmokeController) {
    releaseSmokeController = createReleaseSmokeController(releaseSmokeConfig, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
      logInfo: console.info,
      logError: console.error,
      exit: (code) => {
        void stopManagedRuntimesForQuit()
          .catch((error) => {
            console.warn('[release-smoke] failed to stop managed runtimes:', error)
          })
          .finally(() => {
            app.exit(code)
          })
      }
    })
  }
  return releaseSmokeController
}

async function stopManagedRuntimes(): Promise<void> {
  if (!managedRuntimesStopPromise) {
    managedRuntimesStopPromise = (async () => {
      scheduleRuntime?.stop()
      clawRuntime?.stop()
      stopWeixinBridgeRuntime()
      await kunRuntimeAdapter.stopAndWait()
    })().finally(() => {
      managedRuntimesStopPromise = null
    })
  }
  return managedRuntimesStopPromise
}

async function loadGuiUpdaterModule(): Promise<GuiUpdaterModule> {
  if (!guiUpdaterModulePromise) {
    guiUpdaterModulePromise = import('./gui-updater')
      .then((module) => {
        if (!guiUpdaterInitialized) {
          module.initializeGuiUpdater(
            () => mainWindow,
            async () => (await store.load()).guiUpdate.channel,
            stopManagedRuntimesForQuit
          )
          guiUpdaterInitialized = true
        }
        return module
      })
      .catch((error) => {
        guiUpdaterModulePromise = null
        throw error
      })
  }
  return guiUpdaterModulePromise
}

async function readGuiUpdateState(): Promise<GuiUpdateState> {
  if (!guiUpdaterModulePromise) return { status: 'idle' }
  try {
    const module = await loadGuiUpdaterModule()
    return module.getGuiUpdateState()
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      code: 'unknown'
    }
  }
}


function installDevPreviewWebviewGuards(): void {
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      const src = typeof params.src === 'string' ? params.src : ''
      if (!isAllowedDevPreviewUrl(src)) {
        event.preventDefault()
        return
      }

      delete webPreferences.preload
      delete (webPreferences as { preloadURL?: string }).preloadURL
      webPreferences.nodeIntegration = false
      webPreferences.contextIsolation = true
      webPreferences.sandbox = true
      webPreferences.webSecurity = true
      webPreferences.allowRunningInsecureContent = false
    })

    contents.on('will-navigate', (event, navigationUrl) => {
      if (contents.getType() !== 'webview') return
      if (!isAllowedDevPreviewUrl(navigationUrl)) event.preventDefault()
    })

    contents.setWindowOpenHandler(({ url }) => {
      if (contents.getType() !== 'webview') return { action: 'allow' }
      return isAllowedDevPreviewUrl(url) ? { action: 'allow' } : { action: 'deny' }
    })
  })
}


const appIcon = createAppIcon(opencodexLogoPng)
const trayIcon = createAppIcon(opencodexTrayPng)
traceStartup('app icon loaded', { source: opencodexLogoPng.startsWith('data:') ? 'data-url' : 'path' })
const gotSingleInstanceLock = runningClawScheduleMcpServer || app.requestSingleInstanceLock()
traceStartup('single instance lock checked', {
  gotSingleInstanceLock,
  skippedForClawScheduleMcpServer: runningClawScheduleMcpServer
})

function trayLabels(locale: AppSettingsV1['locale']): { show: string; quit: string; tooltip: string } {
  if (locale === 'zh') {
    return {
      show: '显示 OpenCodex Desktop',
      quit: '退出',
      tooltip: 'OpenCodex Desktop'
    }
  }
  return {
    show: 'Show OpenCodex Desktop',
    quit: 'Quit',
    tooltip: 'OpenCodex Desktop'
  }
}

function shouldStartHidden(settings: AppSettingsV1): boolean {
  return (
    process.platform === 'win32' &&
    settings.appBehavior.openAtLogin &&
    settings.appBehavior.startMinimized &&
    process.argv.includes(HIDDEN_START_ARG)
  )
}

function syncLoginItemSettings(settings: AppSettingsV1): void {
  if (!shouldSyncLoginItemSettings(process.platform, app.isPackaged)) return
  const behavior = settings.appBehavior
  try {
    app.setLoginItemSettings(buildLoginItemSettings(process.platform, behavior, HIDDEN_START_ARG))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[opencodex-desktop] failed to update login item settings:', error)
    logWarn('desktop-behavior', 'Failed to update login item settings.', { message })
  }
}

function revealMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function syncTray(settings: AppSettingsV1): void {
  appBehavior = settings.appBehavior
  if (!appBehavior.closeToTray) {
    if (tray) {
      tray.destroy()
      tray = null
    }
    return
  }

  if (!tray) {
    // Tray 优先用专门的托盘图(在 16x16/24x24 任务栏尺寸下更清晰的剪影);
    // 托盘图加载失败时回退到主应用图,这样不会看到 electron 默认占位。
    const traySource = pickTrayIcon(trayIcon, appIcon)
    tray = new Tray(traySource.isEmpty() ? nativeImage.createEmpty() : traySource)
    tray.on('click', revealMainWindow)
    tray.on('double-click', revealMainWindow)
  }

  const labels = trayLabels(settings.locale)
  tray.setToolTip(labels.tooltip)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: labels.show, click: revealMainWindow },
      { type: 'separator' },
      {
        label: labels.quit,
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

function normalizeNotificationText(raw: string | undefined, fallback: string, maxLength: number): string {
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : fallback
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

type TurnCompleteNotificationPayload = {
  threadId?: string
  title?: string
  body?: string
}

async function showTurnCompleteNotification(
  payload: TurnCompleteNotificationPayload
): Promise<{ ok: true; shown: boolean; reason?: string } | { ok: false; message: string }> {
  const settings = await store.load()
  if (!settings.notifications.turnComplete) {
    return { ok: true, shown: false, reason: 'disabled' }
  }
  if (!Notification.isSupported()) {
    return { ok: true, shown: false, reason: 'unsupported' }
  }

  const title = normalizeNotificationText(payload.title, 'OpenCodex Desktop', 80)
  const body = normalizeNotificationText(payload.body, 'Conversation complete.', 180)

  try {
    const notification = new Notification({
      title,
      body,
      icon: appIcon.isEmpty() ? undefined : appIcon
    })
    notification.on('click', () => {
      revealMainWindow()
    })
    notification.show()
    return { ok: true, shown: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logError('notification', 'Failed to show turn completion notification', {
      message,
      threadId: payload.threadId
    })
    return { ok: false, message }
  }
}

async function probeThreadApi(settings: AppSettingsV1): Promise<
  | { ok: true }
  | { ok: false; error: string; message: string }
> {
  const base = getRuntimeBaseUrlForSettings(settings)
  const headers = runtimeAuthHeaders(settings)
  headers.set('Accept', 'application/json')

  try {
    const res = await fetch(`${base}/v1/threads?limit=1`, {
      headers,
      signal: AbortSignal.timeout(2_000)
    })
    if (res.ok) return { ok: true }
    const info = parseRuntimeErrorBody(
      await res.text(),
      'The local runtime returned an unexpected error.'
    )
    if (res.status === 401 && /bearer token required/i.test(info.message)) {
      return {
        ok: false,
        error: 'runtime_auth_required',
        message: 'The local runtime requires a bearer token for thread APIs.'
      }
    }
    return {
      ok: false,
      error: info.code === 'unknown' ? 'runtime_request_failed' : info.code,
      message: info.message
    }
  } catch (e) {
    return {
      ok: false,
      error: 'fetch_failed',
      message: e instanceof Error ? e.message : String(e)
    }
  }
}

async function waitForKunHealth(settings: AppSettingsV1, timeoutMs: number): Promise<boolean> {
  const base = getRuntimeBaseUrlForSettings(settings)
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    try {
      const remaining = Math.max(1, deadline - Date.now())
      const res = await fetch(`${base}/health`, {
        headers: runtimeAuthHeaders(settings),
        signal: AbortSignal.timeout(Math.max(250, Math.min(1_000, remaining)))
      })
      if (res.ok && isKunHealthResponseBody(await res.text())) return true
    } catch {
      /* retry until the deadline */
    }
    await sleep(150)
  }

  return false
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

let runtimeEnsurePromise: Promise<void> | null = null
let runtimeEnsureFingerprint: string | null = null
let runtimeSettingsApplyPromise: Promise<void> | null = null
let lastAppliedSettings: AppSettingsV1 | null = null

function queueRuntimeSettingsApply(prev: AppSettingsV1, next: AppSettingsV1): void {
  // Always update the prev/next anchor so a later task diffs against
  // the settings that were actually applied last, not against the
  // original `prev` captured when this call was queued.
  const anchor = lastAppliedSettings ?? prev
  lastAppliedSettings = next
  const startupConfigChanged = runtimeStartupConfigChanged(anchor, next)
  if (!startupConfigChanged) return

  const previousTask = runtimeSettingsApplyPromise ?? Promise.resolve()
  const task = previousTask
    .catch(() => undefined)
    .then(async () => {
      const current = lastAppliedSettings ?? next
      await restartManagedRuntimeForSettingsChange(anchor, current)
    })
    .catch((error: unknown) => {
      logWarn('settings-apply', 'Failed to apply Kun runtime settings in background', {
        message: error instanceof Error ? error.message : String(error)
      })
    })
    .finally(() => {
      if (runtimeSettingsApplyPromise === task) {
        runtimeSettingsApplyPromise = null
      }
    })

  runtimeSettingsApplyPromise = task
}

function queueRuntimeMcpConfigApply(settings: AppSettingsV1): void {
  lastAppliedSettings = settings

  const previousTask = runtimeSettingsApplyPromise ?? Promise.resolve()
  const task = previousTask
    .catch(() => undefined)
    .then(async () => {
      const current = lastAppliedSettings ?? settings
      await restartManagedRuntimeForMcpConfigChange(current)
    })
    .catch((error: unknown) => {
      logWarn('mcp-config', 'Failed to apply Kun MCP config change in background', {
        message: error instanceof Error ? error.message : String(error)
      })
    })
    .finally(() => {
      if (runtimeSettingsApplyPromise === task) {
        runtimeSettingsApplyPromise = null
      }
    })

  runtimeSettingsApplyPromise = task
}

async function waitForQueuedRuntimeSettingsApply(): Promise<void> {
  if (!runtimeSettingsApplyPromise) return
  await runtimeSettingsApplyPromise
}

/**
 * Build a stable fingerprint of the settings that affect the
 * Kun runtime so that `ensureRuntime` can debounce on real
 * state instead of on a single in-flight promise. Without this,
 * a fresh call that arrives while a failing ensure is still pending
 * would re-throw the old error.
 */
function runtimeFingerprint(settings: AppSettingsV1): string {
  return stableSettingsStringify(resolveKunRuntimeSettings(settings))
}

async function ensureRuntime(settings: AppSettingsV1): Promise<void> {
  const fingerprint = runtimeFingerprint(settings)
  const pending = runtimeEnsurePromise
  if (pending) {
    // Wait for the in-flight ensure, then re-evaluate against the
    // fingerprint so callers don't inherit a stale result.
    try {
      await pending
    } catch {
      /* fall through to retry with the current settings */
    }
    if (runtimeEnsureFingerprint === fingerprint) return
  }
  const task = ensureRuntimeOnce(settings)
  runtimeEnsurePromise = task.finally(() => {
    if (runtimeEnsurePromise === task) {
      runtimeEnsurePromise = null
      runtimeEnsureFingerprint = null
    }
  })
  runtimeEnsureFingerprint = fingerprint
  try {
    return await task
  } finally {
    /* cleanup runs via the .finally above */
  }
}

async function ensureRuntimeOnce(settings: AppSettingsV1): Promise<void> {
  await waitForQueuedRuntimeSettingsApply()
  await ensureKunRuntime(settings)
}

async function ensureKunRuntime(settings: AppSettingsV1): Promise<void> {
  const runtime = getKunRuntimeSettings(settings)
  const hasApiKey = Boolean(resolveConfiguredApiKey(settings))

  const healthy = await waitForKunHealth(settings, 2_000)
  if (healthy) {
    const threadApi = await probeThreadApi(settings)
    if (threadApi.ok) return
    throw runtimeJsonError(threadApi.error, threadApi.message)
  }

  if (!hasApiKey) {
    throw runtimeJsonError(
      'missing_api_key',
      'DeepSeek API Key is required before the GUI can start Kun.'
    )
  }
  if (!runtime.autoStart) {
    throw runtimeJsonError(
      'runtime_offline',
      'Kun is offline. Enable automatic startup in Settings, or start `kun serve` manually.'
    )
  }

  const adapter = kunRuntimeAdapter
  const reclaim = await adapter.reclaimPort(runtime.port)
  if (!reclaim.ok) {
    throw runtimeJsonError('runtime_port_conflict', reclaim.message)
  }
  try {
    await adapter.ensureRunning(settings, { credentialStore })
  } catch (e) {
    console.error('[opencodex-desktop] failed to start kun:', e)
    throw e
  }
  const started = await waitForKunHealth(settings, 20_000)
  if (!started) {
    throw runtimeJsonError(
      'runtime_unhealthy',
      'Kun did not become healthy after launch.'
    )
  }

  const threadApi = await probeThreadApi(settings)
  if (!threadApi.ok) {
    throw runtimeJsonError(threadApi.error, threadApi.message)
  }
}

function createWindow(options: { suppressInitialShow?: boolean } = {}): void {
  traceStartup('createWindow:start')
  const releaseSmoke = getReleaseSmokeController()
  const preloadPath = resolvePreloadPath()
  const usesDesktopTitleBar = process.platform === 'win32' || process.platform === 'linux'
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    icon: appIcon.isEmpty() ? undefined : appIcon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : usesDesktopTitleBar ? 'hidden' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 31, y: 22 } : undefined,
    autoHideMenuBar: usesDesktopTitleBar,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true
    }
  })
  if (usesDesktopTitleBar) {
    mainWindow.setMenu(null)
    mainWindow.setMenuBarVisibility(false)
  }
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[opencodex-desktop] failed to load preload ${preloadPath}:`, error)
    logError('preload', 'Failed to load preload script', { preloadPath, message })
    releaseSmoke.finish({ ok: false, stage: 'preload_error', message })
  })
  mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    releaseSmoke.finish({
      ok: false,
      stage: 'renderer_load_failed',
      message: `${errorCode} ${errorDescription}${validatedURL ? ` ${validatedURL}` : ''}`
    })
  })
  mainWindow.webContents.once('render-process-gone', (_event, details) => {
    releaseSmoke.finish({
      ok: false,
      stage: 'renderer_process_gone',
      message: details.reason
    })
  })
  const showWindow = (): void => {
    if (options.suppressInitialShow || releaseSmoke.enabled) return
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return
    mainWindow.show()
  }
  mainWindow.on('close', (event) => {
    if (isQuitting || !appBehavior.closeToTray) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  const devUrl = devServerHintUrl()
  traceStartup('createWindow:load', { devUrl: devUrl ?? 'file' })
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  mainWindow.once('ready-to-show', () => {
    traceStartup('window:ready-to-show')
    showWindow()
  })
  mainWindow.webContents.once('did-finish-load', () => {
    traceStartup('window:did-finish-load')
    showWindow()
    releaseSmoke.finish({ ok: true, stage: 'renderer_loaded' })
  })
  setTimeout(() => {
    traceStartup('window:fallback-show-timeout')
    showWindow()
  }, 1500)
}

/**
 * Stable equality for the Kun runtime settings. Most fields are flat,
 * but GUI-managed capability options can be nested, so compare values
 * structurally while still surviving future field additions.
 */
function kunRuntimeConfigChanged(prev: AppSettingsV1, next: AppSettingsV1): boolean {
  const a = resolveKunRuntimeSettings(prev)
  const b = resolveKunRuntimeSettings(next)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as Array<keyof typeof a>)
  for (const key of keys) {
    if (!stableSettingsValueEqual(a[key], b[key])) return true
  }
  return false
}

function stableSettingsValueEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return stableSettingsStringify(a) === stableSettingsStringify(b)
}

function stableSettingsStringify(value: unknown): string {
  return JSON.stringify(canonicalSettingsValue(value))
}

function canonicalSettingsValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSettingsValue)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalSettingsValue((value as Record<string, unknown>)[key])
  }
  return out
}

function runtimeStartupConfigChanged(prev: AppSettingsV1, next: AppSettingsV1): boolean {
  return kunRuntimeConfigChanged(prev, next) || clawScheduleMcpSettingsChanged(prev, next)
}

async function restartManagedRuntimeForSettingsChange(
  prev: AppSettingsV1,
  next: AppSettingsV1
): Promise<void> {
  if (!runtimeStartupConfigChanged(prev, next)) return

  const runtime = resolveKunRuntimeSettings(next)
  const adapter = kunRuntimeAdapter
  const wasRunning = adapter.isChildRunning()

  if (!wasRunning) return
  if (wasRunning) {
    await waitForManagedRuntimeReadyBeforeStop(prev, 'settings-apply')
    await adapter.stopAndWait()
  }
  if (!resolveConfiguredApiKey(next) || !runtime.autoStart) return

  try {
    await adapter.ensureRunning(next, { credentialStore })
    const healthy = await waitForKunHealth(next, 20_000)
    if (!healthy) {
      console.warn('[opencodex-desktop] Kun restart did not become healthy after settings change')
    }
  } catch (e) {
    console.warn('[opencodex-desktop] Kun restart failed after settings change:', e)
  }
}

async function restartManagedRuntimeForMcpConfigChange(settings: AppSettingsV1): Promise<void> {
  const runtime = resolveKunRuntimeSettings(settings)
  const adapter = kunRuntimeAdapter
  const wasRunning = adapter.isChildRunning()

  if (!wasRunning) return
  await waitForManagedRuntimeReadyBeforeStop(settings, 'mcp-config')
  await adapter.stopAndWait()
  if (!resolveConfiguredApiKey(settings) || !runtime.autoStart) return

  try {
    await adapter.ensureRunning(settings, { credentialStore })
    const healthy = await waitForKunHealth(settings, 20_000)
    if (!healthy) {
      console.warn('[opencodex-desktop] Kun restart did not become healthy after MCP config change')
    }
  } catch (e) {
    console.warn('[opencodex-desktop] Kun restart failed after MCP config change:', e)
  }
}

async function waitForManagedRuntimeReadyBeforeStop(
  settings: AppSettingsV1,
  source: string
): Promise<void> {
  const healthy = await waitForKunHealth(settings, 20_000)
  if (!healthy) {
    logWarn(source, 'Kun did not become healthy before a managed restart; stopping it anyway')
    return
  }
  const idle = await waitForRuntimeTurnsIdle({ settings })
  if (idle === 'timeout') {
    logWarn(source, 'Kun still has running turns after waiting; stopping it anyway')
  } else if (idle === 'unavailable') {
    logWarn(source, 'Could not verify Kun turn idleness before a managed restart; stopping it anyway')
  }
}

async function runtimeRequest(
  settings: AppSettingsV1,
  pathAndQuery: string,
  init: { method?: string; body?: string; headers?: Record<string, string> }
): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    return await runtimeRequestViaHost(settings, pathAndQuery, init, ensureRuntime)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logError('runtime-request', `HTTP request to ${pathAndQuery} failed`, { message })
    const parsed = parseRuntimeErrorBody(message, message)
    if (parsed.code !== 'unknown' || parsed.message !== message) {
      return runtimeFailure(parsed.code, parsed.message, 0, parsed.details)
    }
    return runtimeFailure('fetch_failed', message)
  }
}

if (runningClawScheduleMcpServer) {
  void runClawScheduleMcpServerFromArgv(process.argv).catch((error) => {
    console.error('[claw-schedule-mcp] server failed:', error)
    process.exit(1)
  })
} else {
app.whenReady().then(async () => {
  traceStartup('app.whenReady:start')
  const releaseSmoke = getReleaseSmokeController()
  releaseSmoke.startTimeout()
  if (!gotSingleInstanceLock) return

  traceStartup('install webview guards:start')
  installDevPreviewWebviewGuards()
  traceStartup('install webview guards:done')

  if (process.platform === 'darwin' && !appIcon.isEmpty()) {
    app.dock?.setIcon(appIcon)
  }

  store = new JsonSettingsStore(app.getPath('userData'))

  // Initialize encrypted credential store and migrate plaintext keys
  credentialStore = new CredentialStore(app.getPath('userData'))
  await credentialStore.init()

  traceStartup('settings load:start')
  const initial = await store.load()
  traceStartup('settings load:done')

  // Migrate any plaintext keys to encrypted storage, scrub from settings.
  // In ephemeral mode (safeStorage unavailable), keys are ingested into the
  // in-memory cache for the current session but are NOT persisted and the
  // settings marker must NOT claim durable encryption.
  const migrated = await credentialStore.migrateFromSettings(initial.provider.providers)
  const credentialAvailable = credentialStore.isAvailable()
  if (migrated) {
    const scrubbed = {
      ...initial,
      provider: {
        ...initial.provider,
        providers: initial.provider.providers.map((p) => {
          const inStore = credentialStore!.hasKey(p.id)
          if (!inStore) return p
          if (credentialAvailable) {
            return { ...p, apiKey: STORED_ENCRYPTED_MARKER }
          }
          // Ephemeral: key is only in memory.  Scrub plaintext from disk and
          // mark as unvalidated so the UI doesn't mislead about durable storage.
          return {
            ...p,
            apiKey: '',
            credentialStatus: 'unvalidated' as const
          }
        })
      }
    }
    await store.save(scrubbed)
    if (credentialAvailable) {
      console.info('[opencodex-desktop] Migrated plaintext API keys to encrypted credential store')
    } else {
      console.info('[opencodex-desktop] Credential store unavailable — keys loaded for this session only (ephemeral)')
    }
  }

  appBehavior = initial.appBehavior
  syncLoginItemSettings(initial)
  syncTray(initial)
  await syncClawScheduleMcpConfig(initial, getClawScheduleMcpLaunchConfig()).catch((error) => {
    console.error('[claw-schedule-mcp] failed to sync config on startup:', error)
  })

  logDir = resolveLogDirectory()
  configureLogger({
    dir: logDir,
    enabled: initial.log.enabled,
    retentionDays: initial.log.retentionDays
  })
  traceStartup('logger configured')
  scheduleRuntime = createScheduleRuntime({ store, runtimeRequest, logError, powerSaveBlocker })
  scheduleRuntime.sync(initial)
  clawRuntime = createClawRuntime({
    store,
    runtimeRequest,
    logError,
    notifyChannelActivity: emitClawChannelActivity,
    sendWeixinBridgeMessage,
    createScheduledTaskFromText: (text, options) =>
      scheduleRuntime?.createScheduledTaskFromText(text, options) ?? Promise.resolve({ kind: 'noop' })
  })
  clawRuntime.sync(initial)
  configureWeixinBridgeRuntimeContextProvider(async () => {
    const settings = await store.load()
    const channel = settings.claw.channels.find((item) => item.enabled && item.provider === 'weixin')
    return {
      webhookUrl: webhookUrl(settings),
      webhookSecret: settings.claw.im.secret,
      channelId: channel?.id ?? ''
    }
  })
  configureManagedWeixinBridgeUrlResolver(ensureWeixinBridgeRpcUrl)
  syncWeixinBridgeRuntime(initial)

  traceStartup('ipc registration:start')
  const applySettingsPatch = async (partial: AppSettingsPatch): Promise<AppSettingsV1> => {
    const prev = await store.load()
    const { agents: agentsPatch, provider: providerPatch, ...restPatch } = partial

    // Store any plaintext keys in the credential store before merging.
    // When safeStorage is available the settings marker signals durable
    // encryption; when unavailable we scrub the key to empty and mark
    // the provider as unvalidated so the UI doesn't mislead.
    const credAvailable = credentialStore?.isAvailable() ?? false
    if (providerPatch?.providers && credentialStore) {
      for (const p of providerPatch.providers) {
        if (p.id && p.apiKey && p.apiKey !== STORED_ENCRYPTED_MARKER) {
          await credentialStore.setKey(p.id, p.apiKey)
          p.apiKey = credAvailable ? STORED_ENCRYPTED_MARKER : ''
          if (!credAvailable) {
            p.credentialStatus = 'unvalidated' as const
          }
        }
      }
    }
    if (providerPatch?.apiKey && providerPatch.apiKey !== STORED_ENCRYPTED_MARKER && credentialStore) {
      await credentialStore.setKey('deepseek', providerPatch.apiKey)
      providerPatch.apiKey = credAvailable ? STORED_ENCRYPTED_MARKER : ''
    }

    const next = normalizeAppSettings({
      ...applyKunRuntimePatch(prev, agentsPatch?.kun),
      ...restPatch,
      provider: mergeModelProviderSettings(prev.provider, providerPatch),
      log: { ...prev.log, ...(partial.log ?? {}) },
      notifications: { ...prev.notifications, ...(partial.notifications ?? {}) },
      appBehavior: normalizeAppBehaviorSettings({
        ...prev.appBehavior,
        ...(partial.appBehavior ?? {})
      }),
      keyboardShortcuts: normalizeKeyboardShortcuts({
        bindings: {
          ...prev.keyboardShortcuts.bindings,
          ...(partial.keyboardShortcuts?.bindings ?? {})
        }
      }),
      write: mergeWriteSettings(prev.write, partial.write),
      claw: mergeClawSettings(prev.claw, partial.claw),
      schedule: mergeScheduleSettings(prev.schedule, partial.schedule),
      guiUpdate: { ...prev.guiUpdate, ...(partial.guiUpdate ?? {}) }
    })
    if (prev.log.enabled !== next.log.enabled || prev.log.retentionDays !== next.log.retentionDays) {
      configureLogger({ enabled: next.log.enabled, retentionDays: next.log.retentionDays })
    }
    const saved = await store.patch(partial)
    cachedMobileAccessSettings = getKunRuntimeSettings(saved).mobileAccess
    await syncClawScheduleMcpConfig(saved, getClawScheduleMcpLaunchConfig()).catch((error) => {
      console.error('[claw-schedule-mcp] failed to sync config after settings change:', error)
    })
    if (prev.guiUpdate.channel !== saved.guiUpdate.channel && guiUpdaterModulePromise) {
      void guiUpdaterModulePromise.then((module) => module.setGuiUpdateChannel(saved.guiUpdate.channel))
    }
    queueRuntimeSettingsApply(prev, saved)
    scheduleRuntime?.sync(saved)
    clawRuntime?.sync(saved)
    if (remoteRunnerService) {
      remoteRunnerService.updateSettings(getKunRuntimeSettings(saved).remoteRunners)
    }
    syncWeixinBridgeRuntime(saved)
    syncLoginItemSettings(saved)
    syncTray(saved)
    return saved
  }

  const fetchModels = async () => {
    const settings = await store.load()
    const key = resolveConfiguredApiKey(settings)
    return fetchUpstreamModelIds(settings, key)
  }

  // Ensure terminal service is initialized before IPC handlers register it
  getTerminalService()

  // Initialize remote runner service from current settings.
  // Approval callback uses a localized native dialog as the visible approval surface.
  // The renderer also receives the approval event for future React-based UI.
  const initRemoteRunner = () => {
    const rrSettings = getKunRuntimeSettings(initial).remoteRunners

    remoteRunnerService = new RemoteRunnerService(rrSettings, {
      onApprovalRequired: async (request) => {
        const win = mainWindow

        // Forward to renderer for future React-based approval UI
        if (win && !win.isDestroyed()) {
          win.webContents.send('remote-runner:approval-required', {
            approvalId: request.approvalId,
            runnerId: request.runnerId,
            hostLabel: request.hostLabel,
            command: request.command,
            cwd: request.cwd,
            requestedAt: request.requestedAt,
            requireRemoteLabel: request.requireRemoteLabel
          })
        }

        // Read the current locale for every approval prompt so it reflects
        // the latest persisted setting, not a stale snapshot.
        const currentLocale = resolveAppLocale((await store.load()).locale)
        const hostIdentity = request.hostLabel || request.runnerId
        const [denyLabel, allowLabel] = localizedApprovalButtons(currentLocale)

        const dialogResult = await dialog.showMessageBox({
          type: 'warning',
          title: localizedApprovalTitle(currentLocale),
          message: localizedApprovalMessage(currentLocale, hostIdentity),
          detail: localizedApprovalDetail(currentLocale, {
            host: hostIdentity,
            hostId: request.runnerId,
            command: request.command,
            cwd: request.cwd,
            time: request.requestedAt
          }),
          buttons: [denyLabel, allowLabel],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        })

        const decision = dialogResult.response === 1 ? 'allow' : 'deny'

        // Notify renderer of decision for any pending UI state
        if (win && !win.isDestroyed()) {
          win.webContents.send('remote-runner:approval-decision', {
            approvalId: request.approvalId,
            runnerId: request.runnerId,
            decision
          })
        }

        return decision
      },
      onAudit: () => {
        // Audit entries are stored in-memory by the service and surfaced
        // through svc.getAuditLog() via the IPC status/audit-log handlers.
      },
      onEgressPolicyViolation: () => {}
    })
  }
  void initRemoteRunner()

  // Initialize mobile pairing service — needed by IPC handlers
  const mobileDataDir = join(app.getPath('userData'), 'mobile-access')
  try { mkdirSync(mobileDataDir, { recursive: true }) } catch { /* ok */ }

  // Cached reference updated on each settings load/apply
  let cachedMobileAccessSettings = getKunRuntimeSettings(initial).mobileAccess

  mobilePairingService = new MobilePairingService({
    dataDir: mobileDataDir,
    getSettings: () => cachedMobileAccessSettings,
    saveSettings: async (ma) => {
      cachedMobileAccessSettings = ma
      await applySettingsPatch({ agents: { kun: { mobileAccess: ma } } })
    }
  })

  // If mobile access is enabled on startup, start the TLS listener
  const initialMa = getKunRuntimeSettings(initial).mobileAccess
  if (initialMa.enabled) {
    try {
      const certDir = join(app.getPath('userData'), 'mobile-certs')
      const newListener = new MobileTlsListener({
        pairingService: mobilePairingService!,
        port: initialMa.port,
        host: initialMa.host,
        certDir,
        runtimeRequest: async (path, init) => {
          const s = await store.load()
          return runtimeRequest(s, path, init)
        },
        onAudit: (entry) => {
          const currentMa = cachedMobileAccessSettings
          const auditLog = [entry, ...currentMa.auditLog].slice(0, currentMa.maxAuditEntries)
          cachedMobileAccessSettings = { ...cachedMobileAccessSettings, auditLog }
          applySettingsPatch({ agents: { kun: { mobileAccess: { auditLog } as any } } }).catch(() => {})
        }
      })
      await newListener.start()
      mobileAccessListener = newListener
      console.info('[opencodex-desktop] Mobile access TLS listener started on port', initialMa.port)
    } catch (err) {
      console.warn('[opencodex-desktop] Failed to start mobile access listener on startup:', err)
    }
  }

  registerAppIpcHandlers({
    store,
    credentialStore,
    getMainWindow: () => mainWindow,
    applySettingsPatch,
    runtimeRequest: async (path, method, body) => {
      const settings = await store.load()
      return runtimeRequest(settings, path, { method, body })
    },
    fetchUpstreamModels: fetchModels,
    getClawRuntime: () => clawRuntime,
    getScheduleRuntime: () => scheduleRuntime,
    startFeishuInstallQrcode,
    pollFeishuInstall,
    startWeixinInstallQrcode,
    pollWeixinInstall,
    resolveKunConfigPath: resolveKunMcpJsonPath,
    onKunMcpConfigWritten: async () => {
      const settings = await store.load()
      queueRuntimeMcpConfigApply(settings)
    },
    showTurnCompleteNotification,
    getAppVersion: () => app.getVersion(),
    readGuiUpdateState,
    loadGuiUpdaterModule,
    resolveLogDirectory,
    logError,
    getTerminalService: () => getTerminalService(),
    getRemoteRunnerService: () => remoteRunnerService,
    getMobilePairingService: () => mobilePairingService,
    getMobileAccessListener: () => mobileAccessListener,
    setMobileAccessListener: (listener) => { mobileAccessListener = listener },
    getActiveProjectDir: async () => {
      const settings = await store.load()
      const workspaceRoot = settings.workspaceRoot?.trim()
      if (workspaceRoot) return workspaceRoot
      // Fallback: read write workspace or default workspace from settings
      const writeRoot = settings.write?.defaultWorkspaceRoot?.trim() || settings.write?.activeWorkspaceRoot?.trim()
      if (writeRoot) return writeRoot
      // Last resort: process.cwd() — documented as an unavoidable boundary
      // when the renderer has never set a workspace and the main process
      // has no trusted project context.
      return process.cwd()
    }
  })

  void loadGuiUpdaterModule().catch((error) => {
    console.warn('[opencodex-desktop updater] failed to initialize on startup:', error)
  })

  registerRuntimeSseIpc({ ipcMain, store, ensureRuntime, logError })
  traceStartup('ipc registration:done')

  createWindow({ suppressInitialShow: shouldStartHidden(initial) || releaseSmoke.enabled })
  traceStartup('createWindow:returned')

  void pruneOnStartup().catch((err) => {
    console.warn('[opencodex-desktop] prune logs:', err)
  })

  if (resolveConfiguredApiKey(initial)) {
    setTimeout(() => {
      void kunRuntimeAdapter.resolveExecutable(initial).catch((err) => {
        console.warn('[opencodex-desktop] prewarm Kun binary:', err)
      })
    }, 1500)
  }

  app.on('second-instance', () => {
    revealMainWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else revealMainWindow()
  })
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('[opencodex-desktop] startup failed:', error)
  if (releaseSmokeConfig.enabled) {
    getReleaseSmokeController().finish({ ok: false, stage: 'startup_failed', message })
    return
  }
  dialog.showErrorBox('OpenCodex Desktop failed to start', message)
  app.quit()
})
}

app.on('window-all-closed', () => {
  resetTerminalService()
  void stopManagedRuntimes().catch((error) => {
    console.warn('[opencodex-desktop] failed to stop Kun runtime:', error)
  })
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  isQuitting = true
  resetTerminalService()
  if (managedRuntimesStoppedForQuit) return
  event.preventDefault()
  void stopManagedRuntimesForQuit()
    .catch((error) => {
      console.warn('[opencodex-desktop] failed to stop Kun runtime:', error)
      managedRuntimesStoppedForQuit = true
    })
    .finally(() => {
      app.quit()
    })
})
