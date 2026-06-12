import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DsGuiApi } from '../shared/ds-gui-api'

const api = {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) =>
    ipcRenderer.invoke('settings:set', partial),
  runtimeRequest: (path, method, body) =>
    ipcRenderer.invoke('runtime:request', { path, method, body }),
  fetchUpstreamModels: () => ipcRenderer.invoke('upstream:models'),
  refreshModelProviderCatalog: (payload) =>
    ipcRenderer.invoke('model-provider:catalog:refresh', payload),
  providerOAuthStart: () =>
    ipcRenderer.invoke('provider:oauth:start'),
  providerValidateKey: (payload) =>
    ipcRenderer.invoke('provider:validate-key', payload),
  providerDiscoverModels: (payload) =>
    ipcRenderer.invoke('provider:discover-models', payload),
  providerSaveKey: (providerId, key) =>
    ipcRenderer.invoke('provider:save-key', providerId, key),
  providerDeleteKey: (providerId) =>
    ipcRenderer.invoke('provider:delete-key', providerId),
  providerGetMaskedKey: (providerId) =>
    ipcRenderer.invoke('provider:masked-key', providerId),
  getClawStatus: () => ipcRenderer.invoke('claw:status'),
  runClawTask: (taskId) =>
    ipcRenderer.invoke('claw:task:run', taskId),
  getScheduleStatus: () => ipcRenderer.invoke('schedule:status'),
  runScheduleTask: (taskId) =>
    ipcRenderer.invoke('schedule:task:run', taskId),
  startClawImInstallQr: (provider, options) =>
    ipcRenderer.invoke('claw:im-install:qrcode', { provider, isLark: options?.isLark }),
  pollClawImInstall: (provider, deviceCode) =>
    ipcRenderer.invoke('claw:im-install:poll', { provider, deviceCode }),
  pickWorkspaceDirectory: (defaultPath) =>
    ipcRenderer.invoke('workspace:pick-directory', defaultPath),
  listSkills: (workspaceRoot) =>
    ipcRenderer.invoke('skill:list', { workspaceRoot }),
  getPhase7Diagnostics: (workspaceRoot) =>
    ipcRenderer.invoke('phase7:diagnostics', { workspaceRoot }),
  getHooksState: (workspaceRoot) =>
    ipcRenderer.invoke('hooks:state', { workspaceRoot }),
  approveHook: (hookId, workspaceRoot) =>
    ipcRenderer.invoke('hooks:approve', { hookId, workspaceRoot }),
  revokeHook: (hookId) =>
    ipcRenderer.invoke('hooks:revoke', { hookId }),
  readHookSource: (hookId, workspaceRoot) =>
    ipcRenderer.invoke('hooks:read-source', { hookId, workspaceRoot }),
  setHooksKillSwitch: (enabled) =>
    ipcRenderer.invoke('hooks:kill-switch', { enabled }),
  saveSkillFile: (rootPath, skillName, content) =>
    ipcRenderer.invoke('skill:save-file', { rootPath, skillName, content }),
  openSkillRoot: (rootPath) =>
    ipcRenderer.invoke('skill:open-root', rootPath),
  getDeepseekConfigFile: () =>
    ipcRenderer.invoke('deepseek:config:read'),
  setDeepseekConfigFile: (content) =>
    ipcRenderer.invoke('deepseek:config:write', content),
  openDeepseekConfigDir: () =>
    ipcRenderer.invoke('deepseek:config:open-dir'),
  previewUserAgentStackImport: (payload) =>
    ipcRenderer.invoke('user-agent-stack:preview', payload ?? {}),
  importUserAgentStack: (payload) =>
    ipcRenderer.invoke('user-agent-stack:import', payload ?? {}),
  getGitBranches: (workspaceRoot) =>
    ipcRenderer.invoke('git:branches', workspaceRoot),
  switchGitBranch: (workspaceRoot, branch) =>
    ipcRenderer.invoke('git:switch-branch', { workspaceRoot, branch }),
  createAndSwitchGitBranch: (workspaceRoot, branch) =>
    ipcRenderer.invoke('git:create-and-switch-branch', { workspaceRoot, branch }),
  listGitWorktrees: (workspaceRoot) =>
    ipcRenderer.invoke('git:worktrees', workspaceRoot),
  createManagedGitWorktree: (workspaceRoot, options) =>
    ipcRenderer.invoke('git:worktree:create-managed', { workspaceRoot, ...options }),
  removeManagedGitWorktree: (workspaceRoot, path, options) =>
    ipcRenderer.invoke('git:worktree:remove-managed', { workspaceRoot, path, ...options }),
  createGitWorktreeHandoffSummary: (workspaceRoot, path, options) =>
    ipcRenderer.invoke('git:worktree:handoff', { workspaceRoot, path, ...options }),
  getGitDiff: (workspaceRoot) =>
    ipcRenderer.invoke('git:diff', workspaceRoot),
  getGitReviewPreparation: (workspaceRoot, options) =>
    ipcRenderer.invoke('git:review-preparation', { workspaceRoot, ...options }),
  listGitAuditEvents: (workspaceRoot, options) =>
    ipcRenderer.invoke('git:audit-log', { workspaceRoot, ...options }),
  stageGitPaths: (workspaceRoot, paths) =>
    ipcRenderer.invoke('git:stage-paths', { workspaceRoot, paths }),
  discardGitChanges: (workspaceRoot, paths, options) =>
    ipcRenderer.invoke('git:discard-changes', { workspaceRoot, paths, ...options }),
  listEditors: () => ipcRenderer.invoke('editor:list'),
  openEditorPath: (options) =>
    ipcRenderer.invoke('editor:open-path', options),
  listWorkspaceDirectory: (options) =>
    ipcRenderer.invoke('file:list-workspace-directory', options),
  resolveWorkspaceFile: (options) =>
    ipcRenderer.invoke('file:resolve-workspace', options),
  readWorkspaceFile: (options) =>
    ipcRenderer.invoke('file:read-workspace', options),
  readWorkspaceImage: (options) =>
    ipcRenderer.invoke('file:read-workspace-image', options),
  writeWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:write-workspace', payload),
  createWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:create-workspace', payload),
  createWorkspaceDirectory: (payload) =>
    ipcRenderer.invoke('file:create-workspace-directory', payload),
  saveWorkspaceClipboardImage: (payload) =>
    ipcRenderer.invoke('file:save-workspace-clipboard-image', payload),
  readClipboardImage: () =>
    ipcRenderer.invoke('clipboard:read-image'),
  renameWorkspaceEntry: (payload) =>
    ipcRenderer.invoke('file:rename-workspace-entry', payload),
  deleteWorkspaceEntry: (payload) =>
    ipcRenderer.invoke('file:delete-workspace-entry', payload),
  watchWorkspaceFile: (payload) =>
    ipcRenderer.invoke('file:watch-workspace', payload),
  unwatchWorkspaceFile: (watchId) =>
    ipcRenderer.invoke('file:unwatch-workspace', watchId),
  onWorkspaceFileChanged: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('file:workspace-changed', wrapped)
    return () => ipcRenderer.removeListener('file:workspace-changed', wrapped)
  },
  exportWriteDocument: (payload) =>
    ipcRenderer.invoke('write:export', payload),
  copyWriteDocumentAsRichText: (payload) =>
    ipcRenderer.invoke('write:copy-rich-text', payload),
  requestWriteInlineCompletion: (payload) =>
    ipcRenderer.invoke('write:inline-completion', payload),
  listWriteInlineCompletionDebugEntries: () =>
    ipcRenderer.invoke('write:inline-completion-debug:list'),
  clearWriteInlineCompletionDebugEntries: () =>
    ipcRenderer.invoke('write:inline-completion-debug:clear'),
  startSse: (threadId, sinceSeq, streamId) =>
    ipcRenderer.invoke('runtime:sse:start', { threadId, sinceSeq, streamId }),
  stopSse: (streamId) => ipcRenderer.invoke('runtime:sse:stop', streamId),
  onSseEvent: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-event', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-event', wrapped)
  },
  onSseEnd: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-end', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-end', wrapped)
  },
  onSseError: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('runtime:sse-error', wrapped)
    return () => ipcRenderer.removeListener('runtime:sse-error', wrapped)
  },
  onClawChannelActivity: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('claw:channel-activity', wrapped)
    return () => ipcRenderer.removeListener('claw:channel-activity', wrapped)
  },
  mirrorClawChannelMessage: (threadId, text, direction) =>
    ipcRenderer.invoke('claw:channel:mirror', { threadId, text, direction }),
  mirrorClawChannelMessageToFeishu: (threadId, text, direction) =>
    ipcRenderer.invoke('claw:channel:mirror-to-feishu', { threadId, text, direction }),
  createClawTaskFromText: (text, options) =>
    ipcRenderer.invoke('claw:task:create-from-text', {
      text,
      channelId: options?.channelId,
      modelHint: options?.modelHint,
      mode: options?.mode
    }),
  createScheduleTaskFromText: (text, options) =>
    ipcRenderer.invoke('schedule:task:create-from-text', {
      text,
      workspaceRoot: options?.workspaceRoot,
      modelHint: options?.modelHint,
      mode: options?.mode
    }),
  runDesktopCommand: (command) =>
    ipcRenderer.invoke('desktop:command', command),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  showTurnCompleteNotification: (payload) => ipcRenderer.invoke('notification:turn-complete', payload),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getGuiUpdateState: () => ipcRenderer.invoke('gui:update-state'),
  checkGuiUpdate: (channel) =>
    ipcRenderer.invoke('gui:update-check', channel),
  downloadGuiUpdate: (channel) =>
    ipcRenderer.invoke('gui:update-download', channel),
  installGuiUpdate: () => ipcRenderer.invoke('gui:update-install'),
  onGuiUpdateState: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('gui:update-state', wrapped)
    return () => ipcRenderer.removeListener('gui:update-state', wrapped)
  },
  logError: (category, message, detail) =>
    ipcRenderer.invoke('log:error', { category, message, detail }),
  getLogPath: () => ipcRenderer.invoke('log:get-path'),
  openLogDir: () => ipcRenderer.invoke('log:open-dir'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  terminalSpawn: (cwd, cols?, rows?) =>
    ipcRenderer.invoke('terminal:spawn', { cwd, cols, rows }),
  terminalList: () => ipcRenderer.invoke('terminal:list'),
  terminalWrite: (sessionId, data) =>
    ipcRenderer.invoke('terminal:write', { sessionId, data }),
  terminalResize: (sessionId, cols, rows) =>
    ipcRenderer.invoke('terminal:resize', { sessionId, cols, rows }),
  terminalKill: (sessionId) =>
    ipcRenderer.invoke('terminal:kill', { sessionId }),
  terminalGetSettings: () => ipcRenderer.invoke('terminal:settings'),
  terminalGetAuditEvents: () => ipcRenderer.invoke('terminal:audit-events'),
  terminalAgentExecObserved: (payload) =>
    ipcRenderer.invoke('terminal:agent-exec-observed', payload),
  onTerminalData: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('terminal:data', wrapped)
    return () => ipcRenderer.removeListener('terminal:data', wrapped)
  },
  remoteRunnerStatus: () => ipcRenderer.invoke('remote-runner:status'),
  remoteRunnerConnect: (hostId) => ipcRenderer.invoke('remote-runner:connect', hostId),
  remoteRunnerDisconnect: (hostId) => ipcRenderer.invoke('remote-runner:disconnect', hostId),
  remoteRunnerReconnect: (hostId) => ipcRenderer.invoke('remote-runner:reconnect', hostId),
  remoteRunnerHandshake: (hostId) => ipcRenderer.invoke('remote-runner:handshake', hostId),
  remoteRunnerTrustPath: (hostId, path, label) => ipcRenderer.invoke('remote-runner:trust-path', { hostId, path, label }),
  remoteRunnerRevokeTrust: (hostId, path) => ipcRenderer.invoke('remote-runner:revoke-trust', { hostId, path }),
  remoteRunnerGetAuditLog: () => ipcRenderer.invoke('remote-runner:audit-log'),
  remoteRunnerExec: (payload) => ipcRenderer.invoke('remote-runner:exec', payload),
  remoteRunnerStop: (hostId) => ipcRenderer.invoke('remote-runner:stop', hostId),
  remoteRunnerResume: (hostId) => ipcRenderer.invoke('remote-runner:resume', hostId),
  onRemoteRunnerApprovalRequired: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('remote-runner:approval-required', wrapped)
    return () => ipcRenderer.removeListener('remote-runner:approval-required', wrapped)
  },
  onRemoteRunnerApprovalDecision: (handler) => {
    const wrapped = (
      _: Electron.IpcRendererEvent,
      payload: Parameters<typeof handler>[0]
    ) => handler(payload)
    ipcRenderer.on('remote-runner:approval-decision', wrapped)
    return () => ipcRenderer.removeListener('remote-runner:approval-decision', wrapped)
  }
} satisfies DsGuiApi

contextBridge.exposeInMainWorld('dsGui', api)
