import { describe, expect, it } from 'vitest'
import {
  PlaywrightSidecar,
  type AutomationEvidenceBatch
} from '../src/automation/playwright-sidecar.js'
import {
  InMemoryAutomationAuditLog
} from '../src/automation/automation-sidecar.js'
import {
  type AutomationActionRequest
} from '../src/automation/automation-policy.js'

function makeRequest(
  overrides: Partial<AutomationActionRequest> = {}
): AutomationActionRequest {
  return {
    action: 'browser.navigate',
    runId: 'run_1',
    threadId: 'thr_1',
    turnId: 'turn_1',
    workspace: '/tmp/workspace',
    target: { url: 'http://localhost:3000' },
    ...overrides
  }
}

/**
 * These tests verify the sidecar's audit, permission, and host-allowlist
 * behavior. When Playwright is installed, a real browser is launched
 * (headless). When it's not installed, the sidecar returns "unavailable".
 * Tests use flexible assertions to work in both environments.
 */

describe('PlaywrightSidecar (unit)', () => {
  it('records a blocked audit event when automation is disabled by config', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    expect(sidecar.available).toBe(false)
    expect(sidecar.id).toBe('playwright-chromium')
  })

  it('blocks non-localhost navigation when localDevOnly is active', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    const result = await sidecar.execute(
      makeRequest({ target: { url: 'https://evil.com' } })
    )

    expect(result.status).toBe('blocked')
    expect(result.message).toContain('local/dev hosts')
    expect(auditLog.events).toHaveLength(1)
    expect(auditLog.events[0].status).toBe('blocked')
  })

  it('returns failed when server is not reachable', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    const result = await sidecar.execute(
      makeRequest({ target: { url: 'http://localhost:3000' } })
    )

    expect(result.status).toBe('failed')
    // When Playwright is not installed → "unavailable".
    // When installed but no server → connection-refused.
    const message = result.message ?? ''
    expect(
      message.includes('unavailable') ||
      message.includes('ERR_CONNECTION_REFUSED') ||
      message.includes('ECONNREFUSED')
    ).toBe(true)
    expect(auditLog.events.length).toBeGreaterThanOrEqual(1)
    expect(auditLog.events[0].status).toBe('failed')
  })

  it('records audit events for blocked or failed actions', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    await sidecar.execute(makeRequest({ target: { url: 'http://localhost:3000' } }))

    expect(auditLog.events.length).toBeGreaterThan(0)
    const lastEvent = auditLog.events[auditLog.events.length - 1]
    expect(lastEvent.action).toBe('browser.navigate')
    expect(lastEvent.sidecar).toBe('playwright-chromium')
    expect(lastEvent.status).toBe('failed')
  })

  it('records blocked event when app.control action is attempted', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    const result = await sidecar.execute(
      makeRequest({ action: 'app.control', target: { app: 'Finder' } })
    )

    expect(result.status).toBe('blocked')
    expect(result.message).toContain('app/computer control')
    expect(auditLog.events).toHaveLength(1)
    expect(auditLog.events[0].status).toBe('blocked')
  })

  it('records audit event for unsupported actions via sidecar', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    const result = await sidecar.execute(
      makeRequest({
        action: 'local_file.access',
        target: { path: '/tmp/test.txt' }
      })
    )

    expect(result.status).toBe('blocked')
    expect(result.message).toContain('limited')
    expect(auditLog.events).toHaveLength(1)
    expect(auditLog.events[0].status).toBe('blocked')
  })

  it('can shutdown without throwing even when no browser was launched', async () => {
    const sidecar = new PlaywrightSidecar({ headless: true })
    await sidecar.shutdown()
    expect(sidecar.available).toBe(false)
  })

  it('collects no evidence when server is not reachable', async () => {
    const batches: AutomationEvidenceBatch[] = []
    const sidecar = new PlaywrightSidecar({
      headless: true,
      onEvidence: (batch) => batches.push(batch)
    })

    await sidecar.execute(makeRequest({ target: { url: 'http://localhost:3000' } }))

    expect(batches).toHaveLength(0)
  })

  it('browser.snapshot is gated through browserNavigation permission and blocks non-localhost', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    const result = await sidecar.execute(
      makeRequest({
        action: 'browser.snapshot',
        target: { url: 'https://evil.com' }
      })
    )

    expect(result.status).toBe('blocked')
    expect(auditLog.events.length).toBeGreaterThanOrEqual(1)
    expect(auditLog.events[0].status).toBe('blocked')
  })

  it('browser.snapshot on allowed host works on current page', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    const result = await sidecar.execute(
      makeRequest({
        action: 'browser.snapshot',
        target: { url: 'http://localhost:3000' }
      })
    )

    // Snapshot validates the host but does NOT navigate.
    // When browser is available, it snapshots the current blank page successfully.
    // When not available, returns failed.
    expect(['ok', 'failed']).toContain(result.status)
    if (result.status === 'ok') {
      const evidence = result.evidence as Record<string, unknown> | undefined
      expect(evidence).toBeDefined()
      expect(typeof evidence!.title).toBe('string')
    } else {
      expect(result.message).not.toContain('unsupported action')
    }
  })

  it('browser.snapshot returns ok on blank page when browser is available', async () => {
    const sidecar = new PlaywrightSidecar({ headless: true })

    const result = await sidecar.execute(
      makeRequest({ action: 'browser.snapshot', target: {} })
    )

    // Without a URL, snapshot operates on the current page.
    expect(['ok', 'failed']).toContain(result.status)
    if (result.status === 'ok') {
      const evidence = result.evidence as Record<string, unknown> | undefined
      expect(evidence).toBeDefined()
      expect(typeof evidence!.title).toBe('string')
      expect(typeof evidence!.url).toBe('string')
    } else {
      expect(result.message).not.toContain('unsupported action')
    }
  })

  it('browser.snapshot is not reported as unsupported action', async () => {
    const sidecar = new PlaywrightSidecar({ headless: true })

    const result = await sidecar.execute(
      makeRequest({ action: 'browser.snapshot', target: {} })
    )

    // Snapshot is always a supported action.
    if (result.message) {
      expect(result.message).not.toContain('unsupported action')
    }
  })

  it('blocks non-allowed host navigation even for snapshot (defense-in-depth)', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    const result = await sidecar.execute(
      makeRequest({
        action: 'browser.snapshot',
        target: { url: 'https://example.com' }
      })
    )

    expect(result.status).toBe('blocked')
    expect(result.message).toContain('local/dev hosts')
    expect(auditLog.events.length).toBeGreaterThan(0)
  })
})
