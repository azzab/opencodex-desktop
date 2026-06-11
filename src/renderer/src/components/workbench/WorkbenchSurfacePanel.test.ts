import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreRuntimeInfoJson } from '../../agent/kun-contract'
import i18n from '../../i18n'
import { WorkbenchSurfacePanelView, type WorkbenchSurfaceMode } from './WorkbenchSurfacePanel'
import type { Phase7DiagnosticsResult } from '@shared/phase7-diagnostics'

const close = vi.fn()

function runtimeInfo(): CoreRuntimeInfoJson {
  return {
    host: '127.0.0.1',
    port: 17891,
    dataDir: '/tmp/opencodex',
    startedAt: '2026-06-09T00:00:00.000Z',
    approvalPolicy: 'on-request',
    sandboxMode: 'workspace-write',
    capabilities: {
      contractVersion: 1,
      model: {
        id: 'gpt-5.5',
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        supportsToolCalling: true,
        messageParts: ['text', 'input_image']
      },
      cli: {
        serve: { status: 'available', enabled: true, available: true },
        run: { status: 'available', enabled: true, available: true },
        chat: { status: 'available', enabled: true, available: true },
        exec: { status: 'available', enabled: true, available: true }
      },
      mcp: {
        status: 'available',
        enabled: true,
        available: true,
        configuredServers: 3,
        connectedServers: 2,
        toolCount: 18
      },
      web: {
        status: 'available',
        enabled: true,
        available: true,
        fetch: { status: 'available', enabled: true, available: true },
        search: { status: 'available', enabled: true, available: true }
      },
      automation: {
        status: 'disabled',
        enabled: false,
        available: false,
        browserWorkbenchEnabled: true,
        localDevOnly: true,
        allowedHosts: ['localhost', '127.0.0.1']
      },
      skills: {
        status: 'available',
        enabled: true,
        available: true,
        configuredRoots: 2,
        discoveredSkills: 12
      },
      subagents: {
        status: 'available',
        enabled: true,
        available: true,
        maxParallel: 3,
        maxChildRuns: 6
      },
      attachments: {
        status: 'available',
        enabled: true,
        available: true,
        maxImageBytes: 1000,
        maxImageDimension: 1024,
        allowedMimeTypes: ['image/png']
      },
      memory: {
        status: 'available',
        enabled: true,
        available: true,
        scopes: ['user', 'workspace', 'project'],
        maxInjectedRecords: 4
      }
    }
  }
}

function renderPanel(surface: WorkbenchSurfaceMode): string {
  return renderToStaticMarkup(
    createElement(WorkbenchSurfacePanelView, {
      surface,
      workspaceRoot: '/Users/mohamedazab/opencodex-desktop',
      runtimeConnection: 'ready',
      runtimeInfo: runtimeInfo(),
      runtimeSkillCount: 12,
      composerModel: 'gpt-5.5',
      fileReferences: [
        { path: '/Users/mohamedazab/opencodex-desktop/src/App.tsx', relativePath: 'src/App.tsx' }
      ],
      attachments: [{ id: 'att-1', name: 'screen.png', mimeType: 'image/png' }],
      sideConversations: [
        { threadId: 'side-1', title: 'Design review', busy: true },
        { threadId: 'side-2', title: 'Copy check', busy: false }
      ],
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        reasoningTokens: 0,
        cachedTokens: 400,
        cacheMissTokens: 600,
        cacheHitRate: 0.4,
        totalTokens: 1200,
        costUsd: 0.12,
        costCny: null,
        cacheSavingsUsd: 0.02,
        cacheSavingsCny: null,
        tokenEconomySavingsTokens: 80,
        tokenEconomySavingsUsd: 0.01,
        tokenEconomySavingsCny: null,
        turns: 3
      },
      phase7Diagnostics: phase7Diagnostics(),
      onClose: close
    })
  )
}

function phase7Diagnostics(): Extract<Phase7DiagnosticsResult, { ok: true }> {
  return {
    ok: true,
    generatedAt: '2026-06-10T12:00:00.000Z',
    skills: [{
      id: 'review-helper',
      name: 'Review Helper',
      description: 'Review code changes.',
      root: '/workspace/.codex/skills/review-helper',
      entryPath: '/workspace/.codex/skills/review-helper/SKILL.md',
      scope: 'project',
      source: 'workspace-codex',
      enabled: true,
      legacy: true,
      triggers: ['/review', '*.ts']
    }],
    skillValidationErrors: [],
    plugins: [{
      id: 'demo-plugin',
      name: 'Demo Plugin',
      version: '0.1.0',
      description: 'Safe manifest.',
      root: '/home/.codex/plugins/cache/demo-plugin/0.1.0',
      manifestPath: '/home/.codex/plugins/cache/demo-plugin/0.1.0/.codex-plugin/plugin.json',
      enabled: true,
      executesCode: false,
      redaction: 'secret-values-redacted',
      manifestPreview: { id: 'demo-plugin' },
      validationErrors: []
    }],
    hooks: [{
      id: 'PreToolUse',
      phase: 'PreToolUse',
      enabled: true,
      implemented: true,
      executionOwner: 'kun',
      trustReviewRequired: true,
      timeoutMs: 5000,
      mutating: true,
      audit: 'required',
      description: 'Runs before tool execution.'
    }],
    rules: [{
      id: 'code-prompt-prefix',
      scope: 'project',
      source: 'codePromptPrefix',
      enabled: true,
      redactedPreview: 'Always be concise.'
    }],
    memory: {
      enabled: true,
      scopes: ['user', 'workspace', 'project'],
      maxInjectedRecords: 8,
      controls: ['create', 'disable', 'delete'],
      redaction: 'secret-values-redacted'
    },
    compatibilitySources: [{
      id: 'codex',
      label: 'Codex',
      status: 'ready',
      supportedInputs: ['.codex/skills'],
      limitations: []
    }]
  }
}

describe('WorkbenchSurfacePanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    close.mockClear()
  })

  it('renders concrete file and attachment workspace state', () => {
    const html = renderPanel('files')

    expect(html).toContain('Files, Search, Attachments')
    expect(html).toContain('src/App.tsx')
    expect(html).toContain('screen.png')
    expect(html).toContain('Workspace boundary')
  })

  it('renders terminal, diagnostics, subagent, usage, and permission evidence states', () => {
    expect(renderPanel('terminal')).toContain('Managed Terminal')
    expect(renderPanel('terminal')).toContain('Terminal')
    expect(renderPanel('diagnostics')).toContain('12 skills / 18 tools')
    expect(renderPanel('diagnostics')).toContain('2/3 MCP servers')
    expect(renderPanel('diagnostics')).toContain('Review Helper')
    expect(renderPanel('diagnostics')).toContain('Demo Plugin')
    expect(renderPanel('diagnostics')).toContain('PreToolUse')
    expect(renderPanel('diagnostics')).toContain('Codex')
    expect(renderPanel('subagents')).toContain('1 running / 2 side chats')
    expect(renderPanel('usage')).toContain('1.2k tokens')
    expect(renderPanel('usage')).toContain('cache 40%')
    expect(renderPanel('permissions')).toContain('on-request / workspace-write')
    expect(renderPanel('permissions')).toContain('Automation disabled')
    expect(renderPanel('permissions')).toContain('Memory scopes')
    expect(renderPanel('permissions')).toContain('user, workspace, project')
    expect(renderPanel('permissions')).toContain('codePromptPrefix')
  })
})
