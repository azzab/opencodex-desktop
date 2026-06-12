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
  AppServerUsageSchema,
  AppServerHealthResponseSchema,
  AppServerRemoteRunnerHostSummarySchema,
  AppServerRemoteRunnerStatusResponseSchema,
  AppServerRemoteRunnerActionResponseSchema,
  AppServerRemoteRunnerTrustResponseSchema,
  AppServerRemoteRunnerExecResponseSchema,
  AppServerRemoteRunnerStopResponseSchema,
  AppServerRemoteRunnerResumeResponseSchema,
  AppServerRemoteRunnerAuditEntrySchema,
  AppServerRemoteRunnerAuditResponseSchema
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
        automation: true,
        remoteRunners: false
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

  /* ------------------------------------------------------------------ */
  /*  Remote Runner Protocol Schemas (Phase H10)                        */
  /* ------------------------------------------------------------------ */

  it('validates remote runner host summaries with metadata-only fields', () => {
    const host = AppServerRemoteRunnerHostSummarySchema.parse({
      id: 'host_1',
      label: 'Build Host',
      enabled: true,
      connectionStatus: 'connected',
      lastHandshake: {
        issuedAt: '2026-06-12T10:00:00.000Z',
        shell: { os: 'linux', shell: 'bash' },
        gitAvailable: true,
        toolPolicy: { terminal: 'consent_required', filesystem: 'consent_required' }
      },
      lastError: null,
      trustedPathCount: 3
    })

    expect(host).toMatchObject({
      id: 'host_1',
      connectionStatus: 'connected',
      trustedPathCount: 3
    })

    // Trusted path count is metadata-only — no actual paths exposed
    expect(host).not.toHaveProperty('trustedPaths')
    expect(host).not.toHaveProperty('endpointRef')
    expect(host).not.toHaveProperty('credentialRef')
    expect(host).not.toHaveProperty('usernameRef')
  })

  it('rejects host summaries with raw credential-shaped fields', () => {
    const result = AppServerRemoteRunnerHostSummarySchema.safeParse({
      id: 'host_1',
      label: 'Build Host',
      enabled: true,
      connectionStatus: 'connected',
      lastHandshake: null,
      lastError: null,
      trustedPathCount: 0,
      endpointRef: 'ssh-config:build' // not allowed
    })

    expect(result.success).toBe(false)
  })

  it('validates remote runner status response with audit log', () => {
    const status = AppServerRemoteRunnerStatusResponseSchema.parse({
      hosts: [{
        id: 'host_1',
        label: 'Build Host',
        enabled: true,
        connectionStatus: 'connected',
        lastHandshake: {
          issuedAt: '2026-06-12T10:00:00.000Z',
          shell: { os: 'linux', shell: 'bash' },
          gitAvailable: true,
          toolPolicy: { terminal: 'consent_required' }
        },
        lastError: null,
        trustedPathCount: 2
      }],
      enabled: true,
      auditLog: [{
        id: 'audit_1',
        timestamp: '2026-06-12T10:00:00.000Z',
        runnerId: 'host_1',
        action: 'remote-runner.connect',
        outcome: 'completed',
        reason: null
      }]
    })

    expect(status).toMatchObject({
      hosts: [{ id: 'host_1' }],
      enabled: true,
      auditLog: [{ action: 'remote-runner.connect' }]
    })
  })

  it('validates remote runner action response schemas', () => {
    expect(AppServerRemoteRunnerActionResponseSchema.parse({
      ok: true,
      hostId: 'host_1'
    })).toMatchObject({ ok: true, hostId: 'host_1' })

    expect(AppServerRemoteRunnerActionResponseSchema.parse({
      ok: false,
      hostId: 'host_1',
      message: 'Connection failed'
    })).toMatchObject({ ok: false, message: 'Connection failed' })
  })

  it('validates remote runner trust response schemas', () => {
    expect(AppServerRemoteRunnerTrustResponseSchema.parse({
      ok: true,
      hostId: 'host_1',
      path: '/tmp/workspace'
    })).toMatchObject({ ok: true, path: '/tmp/workspace' })

    expect(AppServerRemoteRunnerTrustResponseSchema.parse({
      ok: false,
      hostId: 'host_1',
      path: '/tmp/workspace',
      message: 'Path already trusted'
    })).toMatchObject({ ok: false })
  })

  it('validates remote runner exec response schemas (metadata-only output)', () => {
    expect(AppServerRemoteRunnerExecResponseSchema.parse({
      ok: true,
      runId: 'run_1',
      output: 'hello\n',
      exitCode: 0
    })).toMatchObject({ ok: true, runId: 'run_1', exitCode: 0 })

    expect(AppServerRemoteRunnerExecResponseSchema.parse({
      ok: false,
      message: 'Host not connected'
    })).toMatchObject({ ok: false, message: 'Host not connected' })
  })

  it('validates remote runner stop response schemas', () => {
    expect(AppServerRemoteRunnerStopResponseSchema.parse({
      ok: true,
      hostId: 'host_1',
      wasRunning: true
    })).toMatchObject({ ok: true, wasRunning: true })
  })

  it('validates remote runner resume response schemas', () => {
    expect(AppServerRemoteRunnerResumeResponseSchema.parse({
      ok: true,
      hostId: 'host_1',
      runId: 'run_restored',
      restored: true
    })).toMatchObject({ ok: true, restored: true })

    expect(AppServerRemoteRunnerResumeResponseSchema.parse({
      ok: true,
      hostId: 'host_1',
      runId: null,
      restored: false
    })).toMatchObject({ restored: false })
  })

  it('validates remote runner audit entries and response', () => {
    const entry = AppServerRemoteRunnerAuditEntrySchema.parse({
      id: 'audit_1',
      timestamp: '2026-06-12T10:00:00.000Z',
      runnerId: 'host_1',
      action: 'remote-runner.exec-allowed',
      outcome: 'allowed',
      reason: 'Operator approved'
    })

    expect(entry).toMatchObject({ runnerId: 'host_1', outcome: 'allowed' })

    const response = AppServerRemoteRunnerAuditResponseSchema.parse({
      entries: [entry]
    })

    expect(response.entries).toHaveLength(1)
  })

  it('health response includes remote runner capability', () => {
    const health = AppServerHealthResponseSchema.parse({
      ok: true,
      protocolVersion: APP_SERVER_PROTOCOL_VERSION,
      runtime: {
        ok: true,
        status: 200,
        owner: 'kun'
      },
      auth: {
        loopbackOnly: true,
        tokenRequired: true
      },
      remoteRunners: {
        available: true,
        enabled: true
      }
    })

    expect(health).toMatchObject({
      remoteRunners: { available: true, enabled: true }
    })
  })

  it('project capabilities include remote runner flag', () => {
    const project = AppServerProjectSchema.parse({
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
        automation: true,
        remoteRunners: false
      }
    })

    expect(project.capabilities.remoteRunners).toBe(false)
  })

  it('notifications include remote_runner category', () => {
    expect(AppServerNotificationSchema.parse({
      id: 'evt_rr_1',
      version: APP_SERVER_PROTOCOL_VERSION,
      category: 'remote_runner',
      type: 'remote_runner.status_changed',
      sentAt: '2026-06-12T10:00:00.000Z',
      redaction: 'metadata',
      payload: { hostId: 'host_1', connectionStatus: 'connected' }
    })).toMatchObject({
      category: 'remote_runner',
      redaction: 'metadata'
    })
  })
})
