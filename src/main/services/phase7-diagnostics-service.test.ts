import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import { getPhase7Diagnostics } from './phase7-diagnostics-service'

describe('phase7-diagnostics-service', () => {
  let tempRoot = ''
  let homeDir = ''
  let workspaceRoot = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'phase7-diagnostics-'))
    homeDir = join(tempRoot, 'home')
    workspaceRoot = join(tempRoot, 'workspace')
    await mkdir(homeDir, { recursive: true })
    await mkdir(workspaceRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('inventories skills, plugin metadata, hooks, rules, memory, and compatibility without leaking secrets', async () => {
    const skillRoot = join(workspaceRoot, '.codex', 'skills', 'review-helper')
    await mkdir(skillRoot, { recursive: true })
    await writeFile(join(skillRoot, 'SKILL.md'), [
      '---',
      'name: review-helper',
      'description: Review code changes.',
      'triggers: /review, *.ts',
      '---',
      '',
      'Use for code review.'
    ].join('\n'), 'utf8')

    const pluginManifestDir = join(homeDir, '.codex', 'plugins', 'cache', 'demo-plugin', '0.1.0', '.codex-plugin')
    await mkdir(pluginManifestDir, { recursive: true })
    await writeFile(join(pluginManifestDir, 'plugin.json'), JSON.stringify({
      id: 'demo-plugin',
      name: 'Demo Plugin',
      version: '0.1.0',
      description: 'Adds a safe manifest.',
      apiKey: 'pk-fixture-live-sentinel',
      capabilities: {
        mcp: {
          servers: {
            docs: {
              command: 'docs-mcp',
              env: {
                DOCS_TOKEN: 'fixture-token'
              }
            }
          }
        }
      }
    }, null, 2), 'utf8')

    const settings = createSettings()
    settings.codePromptPrefix = 'Always be concise. token=fixture-value'
    settings.claw.skills.promptPrefix = 'Use security checks. api_key=pk-fixture-test'
    settings.agents.kun.userAgentStack = {
      ...settings.agents.kun.userAgentStack,
      enabled: true,
      sourcePaths: [join(homeDir, '.codex', 'config.toml')],
      skillRoots: [{
        path: skillRoot,
        scope: 'project',
        source: 'workspace-codex',
        available: true
      }],
      mcpServers: [{
        id: 'docs',
        transport: 'stdio',
        command: 'docs-mcp',
        args: ['--token', '<redacted>'],
        env: { DOCS_TOKEN: '<redacted>' },
        headers: {},
        enabled: true,
        trustScope: 'workspace',
        trustedWorkspaceRoots: [workspaceRoot],
        sourcePath: join(homeDir, '.codex', 'config.toml')
      }],
      cli: [],
      validationErrors: [],
      importedAt: '2026-06-10T00:00:00.000Z',
      refreshedAt: '2026-06-10T00:00:00.000Z',
      redactedPreviewJson: '{}'
    }

    const diagnostics = await getPhase7Diagnostics(settings, {
      workspaceRoot,
      homeDir,
      now: () => new Date('2026-06-10T12:00:00.000Z')
    })

    expect(diagnostics).toMatchObject({
      ok: true,
      generatedAt: '2026-06-10T12:00:00.000Z',
      memory: {
        enabled: true,
        scopes: ['user', 'workspace', 'project'],
        controls: ['create', 'disable', 'delete'],
        redaction: 'secret-values-redacted'
      }
    })
    if (!diagnostics.ok) return
    expect(diagnostics.skills).toContainEqual(expect.objectContaining({
      id: 'review-helper',
      name: 'Review Helper',
      scope: 'project',
      enabled: true,
      source: 'workspace-codex',
      triggers: ['/review', '*.ts']
    }))
    expect(diagnostics.plugins).toContainEqual(expect.objectContaining({
      id: 'demo-plugin',
      name: 'Demo Plugin',
      version: '0.1.0',
      executesCode: false,
      redaction: 'secret-values-redacted'
    }))
    expect(JSON.stringify(diagnostics.plugins)).not.toContain('pk-fixture-live-sentinel')
    expect(JSON.stringify(diagnostics.plugins)).not.toContain('fixture-token')
    expect(diagnostics.hooks.map((hook) => hook.phase)).toEqual(expect.arrayContaining([
      'PreToolUse',
      'PostToolUse',
      'PermissionRequest',
      'UserPromptSubmit',
      'SessionStart',
      'SessionStop',
      'SubagentStart',
      'SubagentStop',
      'Compaction'
    ]))
    expect(diagnostics.hooks.find((hook) => hook.phase === 'PreToolUse')).toMatchObject({
      implemented: true,
      executionOwner: 'kun',
      trustReviewRequired: true
    })
    expect(diagnostics.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        source: 'codePromptPrefix',
        redactedPreview: 'Always be concise. token=<redacted>'
      }),
      expect.objectContaining({
        scope: 'user',
        source: 'claw.skills.promptPrefix',
        redactedPreview: 'Use security checks. api_key=<redacted>'
      })
    ]))
    expect(diagnostics.compatibilitySources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'codex', status: 'ready' }),
      expect.objectContaining({ id: 'claude-code', status: 'partial' }),
      expect.objectContaining({ id: 'opencode', status: 'partial' }),
      expect.objectContaining({ id: 'mcp', status: 'ready' })
    ]))
  })

  function createSettings(): AppSettingsV1 {
    return {
      version: 1,
      locale: 'en',
      theme: 'system',
      uiFontScale: 'small',
      provider: defaultModelProviderSettings(),
      agents: { kun: defaultKunRuntimeSettings() },
      workspaceRoot,
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
})
