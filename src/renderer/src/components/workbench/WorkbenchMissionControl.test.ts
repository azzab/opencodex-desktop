import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { WorkbenchMissionControlView } from './WorkbenchMissionControl'

const noop = vi.fn()

function renderMissionControl(): string {
  return renderToStaticMarkup(
    createElement(WorkbenchMissionControlView, {
      workspaceLabel: 'opencodex-desktop',
      workspaceRoot: '/Users/mohamedazab/opencodex-desktop',
      runtimeConnection: 'ready',
      activeThreadTitle: 'Phase 5',
      activeThreadMode: 'agent',
      activeGoal: {
        threadId: 'thread-1',
        objective: 'Build the workbench',
        status: 'active',
        tokensUsed: 1200,
        timeUsedSeconds: 60,
        createdAt: '2026-06-09T00:00:00.000Z',
        updatedAt: '2026-06-09T00:01:00.000Z'
      },
      activeTodos: {
        threadId: 'thread-1',
        items: [
          {
            id: 'todo-1',
            content: 'Design',
            status: 'completed',
            createdAt: '2026-06-09T00:00:00.000Z',
            updatedAt: '2026-06-09T00:00:00.000Z'
          },
          {
            id: 'todo-2',
            content: 'Build',
            status: 'in_progress',
            createdAt: '2026-06-09T00:00:00.000Z',
            updatedAt: '2026-06-09T00:00:00.000Z'
          }
        ],
        updatedAt: '2026-06-09T00:01:00.000Z'
      },
      planAvailable: true,
      rightPanelMode: 'todo',
      sideChatCount: 2,
      sideChatRunningCount: 1,
      runtimeInfo: {
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
            inputModalities: ['text'],
            outputModalities: ['text'],
            supportsToolCalling: true,
            messageParts: ['text']
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
      },
      runtimeSkillCount: 12,
      composerModel: 'gpt-5.5',
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
        tokenEconomySavingsTokens: 0,
        tokenEconomySavingsUsd: 0,
        tokenEconomySavingsCny: null,
        turns: 3
      },
      attachmentCount: 1,
      fileReferenceCount: 2,
      hasDevPreview: true,
      onOpenFiles: noop,
      onOpenTodo: noop,
      onOpenPlan: noop,
      onOpenChanges: noop,
      onOpenTerminal: noop,
      onOpenBrowser: noop,
      onOpenDiagnostics: noop,
      onOpenSubagents: noop,
      onOpenUsage: noop,
      onOpenPlugins: noop,
      onOpenSettings: noop
    })
  )
}

describe('WorkbenchMissionControl', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    noop.mockClear()
  })

  it('renders the operator workbench surfaces with live status summaries', () => {
    const html = renderMissionControl()

    expect(html).toContain('Project')
    expect(html).toContain('Thread')
    expect(html).toContain('Files')
    expect(html).toContain('Diff')
    expect(html).toContain('Terminal')
    expect(html).toContain('Browser')
    expect(html).toContain('Skills')
    expect(html).toContain('Subagents')
    expect(html).toContain('Usage')
    expect(html).toContain('Permissions')
    expect(html).toContain('Build the workbench')
    expect(html).toContain('1 active / 2 total')
    expect(html).toContain('2 files / 1 image')
    expect(html).toContain('12 skills / 18 tools')
    expect(html).toContain('1.2k tokens')
    expect(html).toContain('cache 40%')
    expect(html).toContain('on-request / workspace-write')
    expect(html).toContain('aria-label="Open files and attachments panel"')
    expect(html).toContain('aria-label="Open todo panel"')
    expect(html).toContain('aria-label="Open terminal panel"')
    expect(html).toContain('aria-label="Open browser evidence panel"')
    expect(html).toContain('aria-label="Open Skills and MCP diagnostics"')
    expect(html).toContain('aria-label="Open subagent team panel"')
    expect(html).toContain('aria-label="Open usage and cache panel"')
  })
})
