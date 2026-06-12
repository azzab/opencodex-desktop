import { describe, expect, it } from 'vitest'
import { buildAutomationToolProviders } from '../src/adapters/tool/automation-tool-provider.js'
import { LocalToolHost } from '../src/adapters/tool/local-tool-host.js'
import { CapabilityRegistry } from '../src/adapters/tool/capability-registry.js'
import {
  InMemoryAutomationAuditLog,
  MockAutomationSidecar
} from '../src/automation/automation-sidecar.js'
import { normalizeAutomationCapabilityConfig } from '../src/automation/automation-policy.js'

describe('automation tool provider', () => {
  it('routes browser automation through the sidecar and records audit events', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new MockAutomationSidecar({
      status: 'ok',
      evidence: { title: 'Local dev app' }
    })
    const built = buildAutomationToolProviders(
      normalizeAutomationCapabilityConfig({
        enabled: true,
        localDevOnly: true,
        allowedHosts: ['localhost'],
        permissions: {
          browserNavigation: 'allow',
          browserInteraction: 'deny',
          screenshots: 'deny',
          localFileAccess: 'deny',
          appControl: 'deny'
        }
      }),
      { auditLog, sidecar, nowIso: () => '2026-06-09T00:00:00.000Z' }
    )
    const registry = new CapabilityRegistry(built.providers)
    const host = new LocalToolHost({ registry })
    const result = await host.execute(
      {
        callId: 'call_1',
        toolName: 'browser_navigate',
        arguments: { url: 'http://localhost:3000' }
      },
      {
        threadId: 'thr_1',
        turnId: 'turn_1',
        workspace: '/tmp/workspace',
        approvalPolicy: 'auto',
        abortSignal: new AbortController().signal,
        awaitApproval: async () => 'allow'
      }
    )

    if (result.item.kind !== 'tool_result') {
      throw new Error(`expected tool_result, got ${result.item.kind}`)
    }
    expect(result.item.output).toMatchObject({
      status: 'ok',
      evidence: { title: 'Local dev app' }
    })
    expect(sidecar.requests.map((entry) => entry.action)).toEqual(['browser.navigate'])
    expect(auditLog.events.map((entry) => entry.status)).toEqual([
      'requested',
      'allowed',
      'completed'
    ])
    expect(JSON.stringify(auditLog.events)).not.toContain('sensitive-fixture')
  })

  it('records blocked audit events without calling the sidecar', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new MockAutomationSidecar({ status: 'ok' })
    const built = buildAutomationToolProviders(
      normalizeAutomationCapabilityConfig({
        enabled: true,
        localDevOnly: true,
        allowedHosts: ['localhost'],
        permissions: {
          browserNavigation: 'deny',
          browserInteraction: 'deny',
          screenshots: 'deny',
          localFileAccess: 'deny',
          appControl: 'deny'
        }
      }),
      { auditLog, sidecar, nowIso: () => '2026-06-09T00:00:00.000Z' }
    )
    const registry = new CapabilityRegistry(built.providers)
    const host = new LocalToolHost({ registry })
    const result = await host.execute(
      {
        callId: 'call_2',
        toolName: 'browser_navigate',
        arguments: { url: 'http://localhost:3000' }
      },
      {
        threadId: 'thr_1',
        turnId: 'turn_1',
        workspace: '/tmp/workspace',
        approvalPolicy: 'auto',
        abortSignal: new AbortController().signal,
        awaitApproval: async () => 'allow'
      }
    )

    if (result.item.kind !== 'tool_result') {
      throw new Error(`expected tool_result, got ${result.item.kind}`)
    }
    expect(result.item.isError).toBe(true)
    expect(sidecar.requests).toEqual([])
    expect(auditLog.events.map((entry) => entry.status)).toEqual([
      'requested',
      'blocked'
    ])
  })

  it('does not register automation tools when audit logging is disabled', () => {
    const sidecar = new MockAutomationSidecar({ status: 'ok' })
    const built = buildAutomationToolProviders(
      normalizeAutomationCapabilityConfig({
        enabled: true,
        auditLog: {
          enabled: false,
          maxEntries: 500
        },
        permissions: {
          browserNavigation: 'allow',
          browserInteraction: 'allow',
          screenshots: 'allow',
          localFileAccess: 'deny',
          appControl: 'deny'
        }
      }),
      { sidecar }
    )

    expect(built.providers).toEqual([])
    expect(built.diagnostics[0]).toMatchObject({
      available: false,
      reason: 'automation audit log is disabled by config'
    })
  })

  it('browser_snapshot tool routes through the sidecar with browserNavigation permission', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new MockAutomationSidecar({
      status: 'ok',
      evidence: {
        title: 'Local dev app',
        url: 'http://localhost:3000',
        headings: [{ level: 1, text: 'Welcome' }],
        visibleText: 'Hello world',
        interactiveCount: 2,
        interactives: [],
        linkCount: 1,
        links: [],
        visibleTextLength: 11
      }
    })
    const built = buildAutomationToolProviders(
      normalizeAutomationCapabilityConfig({
        enabled: true,
        permissions: {
          browserNavigation: 'allow',
          browserInteraction: 'deny',
          screenshots: 'deny',
          localFileAccess: 'deny',
          appControl: 'deny'
        }
      }),
      { auditLog, sidecar, nowIso: () => '2026-06-09T00:00:00.000Z' }
    )
    const registry = new CapabilityRegistry(built.providers)
    const host = new LocalToolHost({ registry })
    const result = await host.execute(
      {
        callId: 'call_snap',
        toolName: 'browser_snapshot',
        arguments: {}
      },
      {
        threadId: 'thr_1',
        turnId: 'turn_1',
        workspace: '/tmp/workspace',
        approvalPolicy: 'auto',
        abortSignal: new AbortController().signal,
        awaitApproval: async () => 'allow'
      }
    )

    if (result.item.kind !== 'tool_result') {
      throw new Error(`expected tool_result, got ${result.item.kind}`)
    }
    expect(result.item.output).toMatchObject({ status: 'ok' })
    const ev = result.item.output as Record<string, unknown>
    expect(ev.evidence).toBeDefined()
    expect(sidecar.requests.map((entry) => entry.action)).toEqual(['browser.snapshot'])
    expect(auditLog.events.map((entry) => entry.status)).toEqual([
      'requested',
      'allowed',
      'completed'
    ])
  })

  it('caps the in-memory audit log used by mock sidecars', () => {
    const auditLog = new InMemoryAutomationAuditLog(2)

    for (const status of ['requested', 'allowed', 'completed'] as const) {
      auditLog.record({
        runId: 'run_1',
        threadId: 'thr_1',
        turnId: 'turn_1',
        action: 'browser.navigate',
        status,
        targetSummary: 'http://localhost:3000',
        timestamp: '2026-06-09T00:00:00.000Z'
      })
    }

    expect(auditLog.events.map((entry) => entry.status)).toEqual(['allowed', 'completed'])
  })
})
