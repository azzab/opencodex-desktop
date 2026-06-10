import { describe, expect, it } from 'vitest'
import {
  APP_SERVER_PROTOCOL_VERSION,
  AppServerApprovalSchema,
  AppServerArtifactSchema,
  AppServerAutomationEventSchema,
  AppServerGoalSchema,
  AppServerItemSchema,
  AppServerLoopSchema,
  AppServerNotificationOptionsSchema,
  AppServerNotificationSchema,
  AppServerProjectSchema,
  AppServerStartThreadRequestSchema,
  AppServerSubagentSchema,
  AppServerThreadSchema,
  AppServerToolCallSchema,
  AppServerTurnSchema,
  AppServerUsageSchema
} from './app-server-protocol'

describe('app-server protocol schemas', () => {
  it('validates the shared Phase 8 protocol object set', () => {
    const now = '2026-06-10T12:00:00.000Z'
    const usage = AppServerUsageSchema.parse({
      threadId: 'thr_1',
      inputTokens: 10,
      outputTokens: 5,
      reasoningTokens: 2,
      cachedTokens: 7,
      cacheMissTokens: 3,
      totalTokens: 17,
      costUsd: 0.01,
      cacheHitRate: 0.7
    })
    const goal = AppServerGoalSchema.parse({
      threadId: 'thr_1',
      objective: 'Finish protocol work',
      status: 'active',
      tokensUsed: 17,
      updatedAt: now
    })

    expect(AppServerProjectSchema.parse({
      id: 'project_1',
      root: '/repo',
      label: 'repo',
      trusted: true,
      active: true,
      capabilities: {
        threads: true,
        approvals: true,
        usage: true,
        events: true,
        attachments: true,
        automation: true
      }
    })).toMatchObject({ id: 'project_1' })
    expect(AppServerThreadSchema.parse({
      id: 'thr_1',
      title: 'Protocol',
      projectId: 'project_1',
      workspaceRoot: '/repo',
      model: 'gpt-5.5',
      mode: 'agent',
      status: 'running',
      goal,
      usage,
      createdAt: now,
      updatedAt: now
    })).toMatchObject({ goal, usage })
    expect(AppServerTurnSchema.parse({
      id: 'turn_1',
      threadId: 'thr_1',
      status: 'running',
      promptPreview: 'Build the bridge',
      model: 'gpt-5.5'
    })).toMatchObject({ id: 'turn_1' })
    expect(AppServerItemSchema.parse({
      id: 'item_1',
      threadId: 'thr_1',
      turnId: 'turn_1',
      kind: 'message',
      summary: 'User asked for Phase 8',
      redacted: false
    })).toMatchObject({ kind: 'message' })
    expect(AppServerToolCallSchema.parse({
      id: 'tool_1',
      threadId: 'thr_1',
      turnId: 'turn_1',
      name: 'apply_patch',
      status: 'completed',
      argumentsPreview: '{}'
    })).toMatchObject({ name: 'apply_patch' })
    expect(AppServerApprovalSchema.parse({
      id: 'approval_1',
      threadId: 'thr_1',
      turnId: 'turn_1',
      toolName: 'bash',
      status: 'pending',
      summary: 'Run build'
    })).toMatchObject({ status: 'pending' })
    expect(AppServerArtifactSchema.parse({
      id: 'artifact_1',
      threadId: 'thr_1',
      kind: 'report',
      name: 'Phase 8 report',
      path: 'docs/PHASE_8_APP_SERVER_CLI_IDE_PROTOCOL_REPORT.md',
      redaction: 'metadata'
    })).toMatchObject({ kind: 'report' })
    expect(AppServerLoopSchema.parse({
      threadId: 'thr_1',
      turnId: 'turn_1',
      runId: 'run_1',
      status: 'running',
      phase: 'verification',
      updatedAt: now
    })).toMatchObject({ phase: 'verification' })
    expect(AppServerSubagentSchema.parse({
      parentThreadId: 'thr_1',
      childThreadId: 'thr_2',
      label: 'reviewer',
      status: 'queued'
    })).toMatchObject({ label: 'reviewer' })
    expect(AppServerAutomationEventSchema.parse({
      threadId: 'thr_1',
      action: 'browser.screenshot',
      decision: 'ask',
      permission: 'screenshots'
    })).toMatchObject({ action: 'browser.screenshot' })
  })

  it('validates streamed notification options and envelopes', () => {
    expect(AppServerNotificationOptionsSchema.parse({
      threadId: 'thr_1',
      sinceSeq: 12,
      optOutCategories: ['usage']
    })).toMatchObject({
      threadId: 'thr_1',
      sinceSeq: 12,
      optOutCategories: ['usage']
    })

    expect(AppServerNotificationSchema.parse({
      id: 'evt_1',
      version: APP_SERVER_PROTOCOL_VERSION,
      category: 'approval',
      type: 'approval.requested',
      sentAt: '2026-06-10T12:00:00.000Z',
      threadId: 'thr_1',
      redaction: 'metadata',
      payload: { approvalId: 'approval_1' }
    })).toMatchObject({
      category: 'approval',
      redaction: 'metadata'
    })
  })

  it('accepts start requests for CLI, IDE, browser, mobile, and Electron clients', () => {
    expect(AppServerStartThreadRequestSchema.parse({
      workspaceRoot: '/repo',
      title: 'Start from bridge',
      mode: 'plan',
      initialPrompt: 'Plan the next step'
    })).toMatchObject({
      workspaceRoot: '/repo',
      mode: 'plan'
    })
  })
})
