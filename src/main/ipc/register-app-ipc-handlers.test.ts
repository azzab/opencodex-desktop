import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  mergeScheduleSettings,
  mergeKunRuntimeSettings,
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsPatch,
  type AppSettingsV1
} from '../../shared/app-settings'

const handlers = new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>()

vi.mock('electron', () => ({
  app: {
    quit: vi.fn()
  },
  dialog: {},
  shell: {},
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, payload?: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('../services/user-agent-stack-service', () => ({
  discoverUserAgentStackProfile: vi.fn(async () => ({
    enabled: true,
    importedAt: '2026-06-09T00:00:00.000Z',
    refreshedAt: '2026-06-09T00:00:00.000Z',
    sourcePaths: ['/tmp/codex-config.json'],
    skillRoots: [{
      path: '/tmp/workspace/.codex/skills',
      scope: 'project',
      source: 'workspace-codex',
      available: true
    }],
    mcpServers: [{
      id: 'github',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: '<redacted>' },
      trustScope: 'user',
      sourcePath: '/tmp/codex-config.json'
    }],
    cli: [{
      name: 'git',
      available: true,
      path: '/usr/bin/git',
      version: 'git version 2.50.0'
    }],
    redactedPreviewJson: '{\n  "env": {\n    "GITHUB_TOKEN": "<redacted>"\n  }\n}',
    validationErrors: []
  }))
}))

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: defaultModelProviderSettings(),
    agents: {
      kun: defaultKunRuntimeSettings()
    },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: defaultKeyboardShortcuts(),
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' },
    codePromptPrefix: ''
  }
}

function registerOptions(overrides: Partial<Parameters<typeof import('./register-app-ipc-handlers').registerAppIpcHandlers>[0]> = {}) {
  const applySettingsPatch = vi.fn(async () => settings())
  return {
    store: { load: vi.fn(async () => settings()) } as never,
    getMainWindow: () => null,
    applySettingsPatch,
    runtimeRequest: vi.fn() as never,
    fetchUpstreamModels: vi.fn() as never,
    getClawRuntime: () => null,
    getScheduleRuntime: () => null,
    startFeishuInstallQrcode: vi.fn() as never,
    pollFeishuInstall: vi.fn() as never,
    startWeixinInstallQrcode: vi.fn() as never,
    pollWeixinInstall: vi.fn() as never,
    resolveKunConfigPath: () => '/tmp/kun.json',
    showTurnCompleteNotification: vi.fn() as never,
    getAppVersion: () => '0.1.0',
    readGuiUpdateState: vi.fn() as never,
    loadGuiUpdaterModule: vi.fn() as never,
    resolveLogDirectory: () => '/tmp/logs',
    logError: vi.fn(),
    getTerminalService: () => null,
    getActiveProjectDir: async () => process.cwd(),
    ...overrides
  }
}

describe('registerAppIpcHandlers', () => {
  beforeEach(() => {
    handlers.clear()
  })

  it('rejects invalid settings patches at the handler boundary', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const handler = handlers.get('settings:set')
    expect(handler).toBeTypeOf('function')
    await expect(
      handler?.({}, { agents: { kun: { mysteryFlag: true } } })
    ).rejects.toThrow(/Invalid payload for settings:set/)
    expect(applySettingsPatch).not.toHaveBeenCalled()
  })

  it('passes valid settings patches through to applySettingsPatch', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const payload = {
      theme: 'dark' as const,
      agents: {
        kun: {
          port: 9000
        }
      }
    }
    const handler = handlers.get('settings:set')
    await expect(handler?.({}, payload)).resolves.toEqual(settings())
    expect(applySettingsPatch).toHaveBeenCalledWith(payload)
  })

  it('previews the User Agent Stack import without saving settings', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const handler = handlers.get('user-agent-stack:preview')
    await expect(handler?.({}, { workspaceRoot: '/tmp/workspace' })).resolves.toMatchObject({
      ok: true,
      profile: {
        redactedPreviewJson: expect.stringContaining('<redacted>'),
        cli: [expect.objectContaining({ name: 'git', available: true })]
      }
    })
    expect(applySettingsPatch).not.toHaveBeenCalled()
  })

  it('imports the User Agent Stack profile through the Kun settings patch', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async (partial: AppSettingsPatch): Promise<AppSettingsV1> => {
      const current = settings()
      return {
        ...current,
        agents: {
          kun: mergeKunRuntimeSettings(current.agents.kun, partial.agents?.kun)
        }
      }
    })

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const handler = handlers.get('user-agent-stack:import')
    await expect(handler?.({}, { workspaceRoot: '/tmp/workspace' })).resolves.toMatchObject({
      ok: true,
      settings: {
        agents: {
          kun: {
            userAgentStack: {
              redactedPreviewJson: expect.stringContaining('<redacted>')
            }
          }
        }
      }
    })
    expect(applySettingsPatch).toHaveBeenCalledWith({
      agents: {
        kun: {
          userAgentStack: expect.objectContaining({
            redactedPreviewJson: expect.stringContaining('<redacted>')
          })
        }
      }
    })
  })

  it('accepts the full settings snapshot emitted by SettingsView auto-apply', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async () => settings())

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const payload = { ...settings(), locale: 'zh' as const }
    const handler = handlers.get('settings:set')
    await expect(handler?.({}, payload)).resolves.toEqual(settings())
    expect(applySettingsPatch).toHaveBeenCalledWith(payload)
  })

  it('passes schedule settings patches through to applySettingsPatch', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const applySettingsPatch = vi.fn(async (partial: AppSettingsPatch) => ({
      ...settings(),
      schedule: mergeScheduleSettings(settings().schedule, partial.schedule)
    }))

    registerAppIpcHandlers(registerOptions({ applySettingsPatch }))

    const payload = {
      schedule: {
        enabled: true,
        keepAwake: true,
        tasks: [{
          id: 'task-1',
          title: 'Daily',
          enabled: true,
          prompt: 'Run',
          schedule: { kind: 'manual' as const }
        }]
      }
    }
    const handler = handlers.get('settings:set')
    await expect(handler?.({}, payload)).resolves.toMatchObject({
      schedule: {
        enabled: true,
        keepAwake: true,
        tasks: [{ id: 'task-1', prompt: 'Run' }]
      }
    })
    expect(applySettingsPatch).toHaveBeenCalledWith(payload)
  })

  it('writes MCP config JSON and notifies the runtime apply hook', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const tempRoot = mkdtempSync(join(tmpdir(), 'deepseek-gui-ipc-'))
    const configPath = join(tempRoot, 'mcp.json')
    const onKunMcpConfigWritten = vi.fn(async () => undefined)
    const content = `${JSON.stringify({
      servers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/project']
        }
      }
    }, null, 2)}\n`

    try {
      registerAppIpcHandlers(registerOptions({
        resolveKunConfigPath: () => configPath,
        onKunMcpConfigWritten
      }))

      await expect(handlers.get('deepseek:config:write')?.({}, content)).resolves.toEqual({
        ok: true,
        path: configPath
      })
      expect(readFileSync(configPath, 'utf8')).toBe(content)
      expect(onKunMcpConfigWritten).toHaveBeenCalledWith(configPath, content)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects invalid MCP config JSON before writing or applying it', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const tempRoot = mkdtempSync(join(tmpdir(), 'deepseek-gui-ipc-'))
    const configPath = join(tempRoot, 'mcp.json')
    const onKunMcpConfigWritten = vi.fn(async () => undefined)

    try {
      registerAppIpcHandlers(registerOptions({
        resolveKunConfigPath: () => configPath,
        onKunMcpConfigWritten
      }))

      await expect(handlers.get('deepseek:config:write')?.({}, '{')).rejects.toThrow(
        /MCP config must be JSON/
      )
      await expect(handlers.get('deepseek:config:write')?.({}, '[]')).rejects.toThrow(
        /MCP config must be a JSON object/
      )
      expect(existsSync(configPath)).toBe(false)
      expect(onKunMcpConfigWritten).not.toHaveBeenCalled()
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('uses the GUI-managed WeChat bridge for WeChat install handlers', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const configuredSettings = settings()
    configuredSettings.claw.im.weixinBridgeUrl = 'http://127.0.0.1:8787/rpc'
    const store = { load: vi.fn(async () => configuredSettings) }
    const startWeixinInstallQrcode = vi.fn(async () => ({
      ok: false as const,
      message: 'expected test response'
    }))
    const pollWeixinInstall = vi.fn(async () => ({ done: false as const }))

    registerAppIpcHandlers(registerOptions({
      store: store as never,
      startWeixinInstallQrcode,
      pollWeixinInstall
    }))

    await expect(
      handlers.get('claw:im-install:qrcode')?.({}, { provider: 'weixin' })
    ).resolves.toMatchObject({ ok: false })
    await expect(
      handlers.get('claw:im-install:poll')?.({}, { provider: 'weixin', deviceCode: 'device-1' })
    ).resolves.toEqual({ done: false })

    expect(startWeixinInstallQrcode).toHaveBeenCalledWith()
    expect(pollWeixinInstall).toHaveBeenCalledWith('device-1')
  })

  it('routes schedule task IPC calls to the Schedule runtime', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const scheduleRuntime = {
      status: vi.fn(async () => ({
        internalServerRunning: true,
        internalUrl: 'http://127.0.0.1:8788',
        runningTaskIds: ['task-1'],
        powerSaveBlockerActive: true
      })),
      runTask: vi.fn(async (taskId: string) => ({ ok: true as const, taskId, message: 'Started' })),
      createScheduledTaskFromText: vi.fn(async () => ({
        kind: 'created' as const,
        taskId: 'task-2',
        title: 'Reminder',
        scheduleAt: '2026-06-03T09:00:00.000+08:00',
        confirmationText: 'Scheduled.'
      }))
    }
    registerAppIpcHandlers(registerOptions({
      getScheduleRuntime: () => scheduleRuntime as never
    }))

    await expect(handlers.get('schedule:status')?.({})).resolves.toMatchObject({
      internalServerRunning: true,
      runningTaskIds: ['task-1'],
      powerSaveBlockerActive: true
    })
    await expect(handlers.get('schedule:task:run')?.({}, 'task-1')).resolves.toMatchObject({
      ok: true,
      taskId: 'task-1'
    })
    await expect(
      handlers.get('schedule:task:create-from-text')?.({}, {
        text: 'Remind me tomorrow.',
        workspaceRoot: '/tmp/schedule',
        modelHint: 'deepseek-v4-flash',
        mode: 'plan'
      })
    ).resolves.toMatchObject({
      kind: 'created',
      taskId: 'task-2'
    })

    expect(scheduleRuntime.runTask).toHaveBeenCalledWith('task-1')
    expect(scheduleRuntime.createScheduledTaskFromText).toHaveBeenCalledWith('Remind me tomorrow.', {
      workspaceRoot: '/tmp/schedule',
      modelHint: 'deepseek-v4-flash',
      mode: 'plan'
    })
  })

  it('routes desktop command IPC calls to the focused window and web contents', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const webContents = {
      undo: vi.fn(),
      redo: vi.fn(),
      cut: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(),
      selectAll: vi.fn(),
      reload: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
      setZoomLevel: vi.fn(),
      toggleDevTools: vi.fn()
    }
    const mainWindow = {
      isDestroyed: vi.fn(() => false),
      webContents,
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      close: vi.fn()
    }

    registerAppIpcHandlers(registerOptions({
      getMainWindow: () => mainWindow as never
    }))

    const handler = handlers.get('desktop:command')
    await handler?.({ sender: webContents }, 'copy')
    await handler?.({ sender: webContents }, 'zoomIn')
    await handler?.({ sender: webContents }, 'toggleMaximize')
    await handler?.({ sender: webContents }, 'close')

    expect(webContents.copy).toHaveBeenCalledTimes(1)
    expect(webContents.setZoomLevel).toHaveBeenCalledWith(1)
    expect(mainWindow.maximize).toHaveBeenCalledTimes(1)
    expect(mainWindow.close).toHaveBeenCalledTimes(1)
  })

  // Terminal IPC handler tests

  it('terminal:settings returns enabled from TerminalService', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const isEnabled = vi.fn(() => true)
    const mockTerminalService = {
      isEnabled,
      spawn: vi.fn(),
      list: vi.fn(() => []),
      write: vi.fn(() => true),
      resize: vi.fn(() => true),
      kill: vi.fn(() => true),
      getAuditEvents: vi.fn(() => [])
    }

    registerAppIpcHandlers(registerOptions({
      getTerminalService: () => mockTerminalService as never
    }))

    const handler = handlers.get('terminal:settings')
    await expect(handler?.({})).resolves.toEqual({ enabled: true })
    expect(isEnabled).toHaveBeenCalled()
  })

  it('terminal:spawn returns session and forwards PTY output to renderer', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const onDataCallbacks: Array<(data: string) => void> = []
    const mockPty = {
      onData: vi.fn((cb: (data: string) => void) => { onDataCallbacks.push(cb) }),
      onExit: vi.fn()
    }
    const mockTerminalService = {
      isEnabled: vi.fn(() => true),
      spawn: vi.fn(() => ({ id: 'term_test123', pty: mockPty })),
      list: vi.fn(() => []),
      write: vi.fn(() => true),
      resize: vi.fn(() => true),
      kill: vi.fn(() => true),
      getAuditEvents: vi.fn(() => [])
    }

    // Use real temp dir so realpathSync in isPathWithinRoot succeeds
    const tempRoot = mkdtempSync(join(tmpdir(), 'h3-ptytest-'))
    const tempSub = join(tempRoot, 'project')
    mkdirSync(tempSub)
    try {
      registerAppIpcHandlers(registerOptions({
        getTerminalService: () => mockTerminalService as never,
        getActiveProjectDir: async () => tempRoot
      }))

      const sender = {
        id: 999,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
        once: vi.fn()
      }

      const handler = handlers.get('terminal:spawn')
      const result = await handler?.({ sender }, { cwd: tempSub, cols: 120, rows: 40 })

      expect(result).toMatchObject({
        ok: true,
        sessionId: 'term_test123',
        cols: 120,
        rows: 40
      })

      // Verify PTY onData was registered
      expect(onDataCallbacks.length).toBeGreaterThanOrEqual(1)

      // Simulate PTY output and verify it's forwarded to renderer
      onDataCallbacks.forEach((cb) => cb('hello from pty\r\n'))
      expect(sender.send).toHaveBeenCalledWith('terminal:data', {
        sessionId: 'term_test123',
        data: 'hello from pty\r\n'
      })
    } finally {
      try { rmSync(tempSub, { recursive: true, force: true }) } catch { /* */ }
      try { rmSync(tempRoot, { recursive: true, force: true }) } catch { /* */ }
    }
  })

  it('terminal:spawn respects disabled settings', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const mockTerminalService = {
      isEnabled: vi.fn(() => false),
      spawn: vi.fn()
    }

    registerAppIpcHandlers(registerOptions({
      getTerminalService: () => mockTerminalService as never
    }))

    const handler = handlers.get('terminal:spawn')
    const result = await handler?.({ sender: { id: 1, once: vi.fn() } }, { cwd: '/tmp' })
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('disabled') })
    expect(mockTerminalService.spawn).not.toHaveBeenCalled()
  })

  it('terminal:kill cleans up sender session tracking', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const killFn = vi.fn(() => true)
    const mockTerminalService = {
      isEnabled: vi.fn(() => true),
      spawn: vi.fn(() => ({
        id: 'term_killtest',
        pty: { onData: vi.fn(), onExit: vi.fn() }
      })),
      list: vi.fn(() => []),
      write: vi.fn(() => true),
      resize: vi.fn(() => true),
      kill: killFn,
      getAuditEvents: vi.fn(() => [])
    }

    registerAppIpcHandlers(registerOptions({
      getTerminalService: () => mockTerminalService as never,
      getActiveProjectDir: async () => '/tmp'
    }))

    const sender = {
      id: 888,
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
      once: vi.fn()
    }

    // Spawn first to track the session
    const spawnHandler = handlers.get('terminal:spawn')
    await spawnHandler?.({ sender }, { cwd: '/tmp' })

    // Now kill
    const killHandler = handlers.get('terminal:kill')
    const result = await killHandler?.({ sender }, { sessionId: 'term_killtest' })
    expect(result).toEqual({ ok: true })
    expect(killFn).toHaveBeenCalledWith('term_killtest')
  })

  it('terminal:data is not sent when sender is destroyed', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const onDataCallbacks: Array<(data: string) => void> = []
    const mockPty = {
      onData: vi.fn((cb: (data: string) => void) => { onDataCallbacks.push(cb) }),
      onExit: vi.fn()
    }
    const mockTerminalService = {
      isEnabled: vi.fn(() => true),
      spawn: vi.fn(() => ({ id: 'term_gone', pty: mockPty })),
      list: vi.fn(() => []),
      write: vi.fn(() => true),
      resize: vi.fn(() => true),
      kill: vi.fn(() => true),
      getAuditEvents: vi.fn(() => [])
    }

    registerAppIpcHandlers(registerOptions({
      getTerminalService: () => mockTerminalService as never,
      getActiveProjectDir: async () => '/tmp'
    }))

    const sender = {
      id: 777,
      isDestroyed: vi.fn(() => true), // already destroyed
      send: vi.fn(),
      once: vi.fn()
    }

    const handler = handlers.get('terminal:spawn')
    await handler?.({ sender }, { cwd: '/tmp' })

    // Simulate PTY output after sender destroyed
    onDataCallbacks.forEach((cb) => cb('should not be sent\r\n'))
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('terminal:spawn rejects cwd outside the active project directory', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')

    // Create real temp dirs so realpathSync passes and containment is tested properly
    const tempRoot = mkdtempSync(join(tmpdir(), 'h3-ptypath-root-'))
    const tempSub = join(tempRoot, 'subdir')
    mkdirSync(tempSub)
    try {
      const spawnFn = vi.fn(() => ({
        id: 'term_inside',
        pty: { onData: vi.fn(), onExit: vi.fn() }
      }))
      const mockTerminalService = {
        isEnabled: vi.fn(() => true),
        spawn: spawnFn,
        list: vi.fn(() => []),
        write: vi.fn(() => true),
        resize: vi.fn(() => true),
        kill: vi.fn(() => true),
        getAuditEvents: vi.fn(() => [])
      }

      registerAppIpcHandlers(registerOptions({
        getTerminalService: () => mockTerminalService as never,
        getActiveProjectDir: async () => tempRoot
      }))

      const sender = {
        id: 10,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
        once: vi.fn()
      }

      const handler = handlers.get('terminal:spawn')

      // cwd inside project dir (real existing dir) → allowed
      const resultOk = await handler?.({ sender }, { cwd: tempSub })
      expect(resultOk).toMatchObject({ ok: true })
      expect(spawnFn).toHaveBeenCalledWith(tempSub, 80, 24)

      // cwd outside project dir (non-existent inside /etc) → rejected
      const resultOutside = await handler?.({ sender }, { cwd: '/etc/passwd' })
      expect(resultOutside).toMatchObject({
        ok: false,
        message: expect.stringContaining('outside the active project directory')
      })
      expect(spawnFn).toHaveBeenCalledTimes(1)
    } finally {
      try { rmSync(tempSub, { recursive: true, force: true }) } catch { /* */ }
      try { rmSync(tempRoot, { recursive: true, force: true }) } catch { /* */ }
    }
  })

  it('terminal:spawn defaults to project dir when cwd omitted from payload', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const spawnFn = vi.fn(() => ({
      id: 'term_default',
      pty: { onData: vi.fn(), onExit: vi.fn() }
    }))
    const mockTerminalService = {
      isEnabled: vi.fn(() => true),
      spawn: spawnFn,
      list: vi.fn(() => []),
      write: vi.fn(() => true),
      resize: vi.fn(() => true),
      kill: vi.fn(() => true),
      getAuditEvents: vi.fn(() => [])
    }

    registerAppIpcHandlers(registerOptions({
      getTerminalService: () => mockTerminalService as never,
      getActiveProjectDir: async () => '/Users/test/my-project'
    }))

    const sender = {
      id: 11,
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
      once: vi.fn()
    }

    const handler = handlers.get('terminal:spawn')
    // cwd omitted entirely → falls back to active project dir
    const result = await handler?.({ sender }, {})
    expect(result).toMatchObject({ ok: true, cwd: '/Users/test/my-project' })
    expect(spawnFn).toHaveBeenCalledWith('/Users/test/my-project', 80, 24)
  })

  it('terminal:spawn rejects symlink escape outside project root', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const spawnFn = vi.fn(() => ({
      id: 'term_symlink',
      pty: { onData: vi.fn(), onExit: vi.fn() }
    }))
    const mockTerminalService = {
      isEnabled: vi.fn(() => true),
      spawn: spawnFn,
      list: vi.fn(() => []),
      write: vi.fn(() => true),
      resize: vi.fn(() => true),
      kill: vi.fn(() => true),
      getAuditEvents: vi.fn(() => [])
    }

    // Create temp dir structure: root/subdir (allowed) and root/link-to-outside (symlink escape)
    const tempRoot = mkdtempSync(join(tmpdir(), 'h3-ptypath-'))
    const subDir = join(tempRoot, 'subdir')
    const outsideDir = mkdtempSync(join(tmpdir(), 'h3-ptypath-outside-'))
    const symlinkPath = join(tempRoot, 'link-to-outside')
    try {
      mkdirSync(subDir)
      symlinkSync(outsideDir, symlinkPath, 'dir')

      registerAppIpcHandlers(registerOptions({
        getTerminalService: () => mockTerminalService as never,
        getActiveProjectDir: async () => tempRoot
      }))

      const sender = {
        id: 99,
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
        once: vi.fn()
      }

      const handler = handlers.get('terminal:spawn')

      // subdir inside root → allowed
      const resultInside = await handler?.({ sender }, { cwd: subDir })
      expect(resultInside).toMatchObject({ ok: true })

      // symlink pointing outside root → rejected by realpath containment
      const resultSymlink = await handler?.({ sender }, { cwd: symlinkPath })
      expect(resultSymlink).toMatchObject({
        ok: false,
        message: expect.stringContaining('outside')
      })
    } finally {
      // Cleanup
      try { rmSync(subDir, { recursive: true, force: true }) } catch { /* */ }
      try { rmSync(symlinkPath, { recursive: true, force: true }) } catch { /* */ }
      try { rmSync(tempRoot, { recursive: true, force: true }) } catch { /* */ }
      try { rmSync(outsideDir, { recursive: true, force: true }) } catch { /* */ }
    }
  })

  it('terminal:agent-exec-observed emits an agent_exec_observed audit event', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const agentExecObserved = vi.fn()
    const mockTerminalService = {
      isEnabled: vi.fn(() => true),
      spawn: vi.fn(),
      list: vi.fn(() => []),
      write: vi.fn(() => true),
      resize: vi.fn(() => true),
      kill: vi.fn(() => true),
      getAuditEvents: vi.fn(() => []),
      agentExecObserved
    }

    registerAppIpcHandlers(registerOptions({
      getTerminalService: () => mockTerminalService as never
    }))

    const handler = handlers.get('terminal:agent-exec-observed')
    const result = await handler?.({}, {
      threadId: 'thread-1',
      turnId: 'turn-1',
      toolName: 'bash',
      toolKind: 'command_execution',
      summary: 'ls -la',
      outputTruncated: 'total 4',
      exitCode: 0
    })

    expect(result).toEqual({ ok: true })
    expect(agentExecObserved).toHaveBeenCalledWith({
      toolName: 'bash',
      toolKind: 'command_execution',
      summary: 'ls -la',
      outputTruncated: 'total 4',
      exitCode: 0,
      threadId: 'thread-1',
      detail: expect.stringContaining('tool=bash')
    })
  })

  it('terminal:agent-exec-observed works with minimal payload', async () => {
    const { registerAppIpcHandlers } = await import('./register-app-ipc-handlers')
    const agentExecObserved = vi.fn()
    const mockTerminalService = {
      isEnabled: vi.fn(() => true),
      spawn: vi.fn(),
      list: vi.fn(() => []),
      write: vi.fn(() => true),
      resize: vi.fn(() => true),
      kill: vi.fn(() => true),
      getAuditEvents: vi.fn(() => []),
      agentExecObserved
    }

    registerAppIpcHandlers(registerOptions({
      getTerminalService: () => mockTerminalService as never
    }))

    const handler = handlers.get('terminal:agent-exec-observed')
    const result = await handler?.({}, {})
    expect(result).toEqual({ ok: true })
    expect(agentExecObserved).toHaveBeenCalledWith({
      toolName: undefined,
      toolKind: undefined,
      summary: undefined,
      outputTruncated: undefined,
      exitCode: undefined,
      threadId: undefined,
      detail: undefined
    })
  })
})
