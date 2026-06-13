import { describe, expect, it, afterEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { syncGuiManagedKunConfig } from './kun-process'
import {
  defaultKunRuntimeSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  defaultKeyboardShortcuts,
  defaultModelProviderSettings,
  defaultClawSettings,
  type AppSettingsV1
} from '../shared/app-settings'

const tempDirs: string[] = []

function tmpDir(): string {
  const dir = join(tmpdir(), `kun-provider-security-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      try { rmSync(dir, { recursive: true, force: true }) } catch { /* ok */ }
    }
  }
})

function minimalSettings(overrides?: Partial<AppSettingsV1>): AppSettingsV1 {
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: defaultModelProviderSettings(),
    agents: { kun: defaultKunRuntimeSettings(19001) },
    workspaceRoot: '/tmp',
    log: { enabled: true, retentionDays: 7 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: defaultKeyboardShortcuts(),
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' },
    codePromptPrefix: '',
    ...overrides
  }
}

describe('Kun provider key ephemeral injection (main-side security)', () => {
  // ── Gate 1: syncGuiManagedKunConfig output contains no providerKeys ────

  it('syncGuiManagedKunConfig never writes providerKeys to config.json', async () => {
    const dataDir = tmpDir()
    const runtime = defaultKunRuntimeSettings(19002)

    // Write a fresh config.json via syncGuiManagedKunConfig
    await syncGuiManagedKunConfig(dataDir, {
      ...runtime,
      mcpSearch: {
        enabled: false,
        mode: 'auto',
        autoThresholdToolCount: 24,
        topKDefault: 5,
        topKMax: 10,
        minScore: 0.15
      }
    }, {
      settings: minimalSettings()
    })

    const configPath = join(dataDir, 'config.json')
    expect(existsSync(configPath)).toBe(true)

    const raw = readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // providerKeys must NOT appear anywhere in the written config
    expect(raw).not.toContain('providerKeys')
    expect(raw).not.toContain('provider_keys')

    // serve section must not have providerKeys
    const serve = parsed.serve as Record<string, unknown> | undefined
    expect(serve).toBeDefined()
    expect(serve).not.toHaveProperty('providerKeys')

    // No raw key-like strings in the config (except fixture sentinels if any)
    // Look for patterns like "sk-" or "apiKey" followed by long strings
    const keyPattern = /"apiKey"\s*:\s*"sk-[a-zA-Z0-9]{10,}"/g
    expect(keyPattern.test(raw)).toBe(false)
  })

  // ── Gate 2: Existing config.json without providerKeys is preserved ──────

  it('syncGuiManagedKunConfig preserves existing config without adding providerKeys', async () => {
    const dataDir = tmpDir()

    // Write an initial config.json (simulating a previous clean state)
    const configPath = join(dataDir, 'config.json')
    const initialConfig = {
      serve: {
        model: 'deepseek-v4-pro',
        approvalPolicy: 'auto'
      }
    }
    mkdirSync(dataDir, { recursive: true })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(configPath, JSON.stringify(initialConfig, null, 2) + '\n', 'utf8')

    const runtime = defaultKunRuntimeSettings(19003)
    await syncGuiManagedKunConfig(dataDir, {
      ...runtime,
      mcpSearch: {
        enabled: false,
        mode: 'auto',
        autoThresholdToolCount: 24,
        topKDefault: 5,
        topKMax: 10,
        minScore: 0.15
      }
    }, {
      settings: minimalSettings()
    })

    const raw = readFileSync(configPath, 'utf8')
    // No providerKeys introduced
    expect(raw).not.toContain('providerKeys')
    expect(raw).toContain('deepseek-v4-pro')
  })

  // ── Gate 3: Config update with stale providerKeys would break .strict() ──

  it('syncGuiManagedKunConfig would fail if providerKeys existed in parsed serve', async () => {
    const dataDir = tmpDir()

    // Write a config with stale providerKeys (simulating pre-fix state)
    const configPath = join(dataDir, 'config.json')
    const staleConfig = {
      serve: {
        model: 'deepseek-v4-flash',
        providerKeys: {
          deepseek: { apiKey: 'sk-stale-key' }
        }
      }
    }
    mkdirSync(dataDir, { recursive: true })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(configPath, JSON.stringify(staleConfig, null, 2) + '\n', 'utf8')

    // syncGuiManagedKunConfig should clean up the stale providerKeys on write
    const runtime = defaultKunRuntimeSettings(19004)
    await syncGuiManagedKunConfig(dataDir, {
      ...runtime,
      mcpSearch: {
        enabled: false,
        mode: 'auto',
        autoThresholdToolCount: 24,
        topKDefault: 5,
        topKMax: 10,
        minScore: 0.15
      }
    }, {
      settings: minimalSettings()
    })

    const raw = readFileSync(configPath, 'utf8')
    // After sanitize + new write, providerKeys must be gone
    expect(raw).not.toContain('providerKeys')
    expect(raw).not.toContain('sk-stale-key')
  })
})
