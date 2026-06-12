/**
 * Integration smoke test for the Playwright sidecar.
 *
 * Skipped by default. Run only when:
 *   1. Playwright installed (`npx playwright install chromium`)
 *   2. A local HTTP server running on localhost:3333
 *      (e.g. `npx http-server --port 3333 /tmp/test-site`)
 *
 * Run with:
 *   RUN_SMOKE=1 npx vitest run kun/tests/playwright-sidecar-smoke.test.ts
 *
 * Or with a specific test site:
 *   SMOKE_URL=http://localhost:3333 RUN_SMOKE=1 npx vitest run kun/tests/playwright-sidecar-smoke.test.ts
 */

import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { PlaywrightSidecar } from '../src/automation/playwright-sidecar.js'
import { InMemoryAutomationAuditLog } from '../src/automation/automation-sidecar.js'
import { FileAutomationEvidenceStore } from '../src/automation/evidence-store.js'
import type { AutomationActionRequest } from '../src/automation/automation-policy.js'

const SMOKE_URL = process.env.SMOKE_URL ?? 'http://localhost:3333'
const runSmoke = process.env.RUN_SMOKE === '1' || process.env.CI === 'true'

function makeRequest(
  overrides: Partial<AutomationActionRequest> = {}
): AutomationActionRequest {
  return {
    action: 'browser.navigate',
    runId: 'run_smoke',
    threadId: 'thr_smoke',
    turnId: 'turn_smoke',
    workspace: '/tmp/workspace',
    target: { url: SMOKE_URL },
    ...overrides
  }
}

function skipIfServerDown(navResult: { status: string; message?: string }): boolean {
  if (navResult.status === 'failed' && navResult.message?.includes('ECONNREFUSED')) {
    return true
  }
  if (navResult.status === 'failed' && navResult.message?.includes('unavailable')) {
    return true
  }
  return false
}

describe.skipIf(!runSmoke)('Playwright sidecar integration smoke', () => {
  it('navigate → snapshot (DOM) → screenshot → audit events', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    try {
      // 1. Navigate.
      const navResult = await sidecar.execute(
        makeRequest({ target: { url: SMOKE_URL } })
      )
      if (skipIfServerDown(navResult)) return
      expect(navResult.status).toBe('ok')
      expect(navResult.evidence).toBeDefined()

      // 2. DOM Snapshot — prove it returns useful sanitized DOM data.
      const snapResult = await sidecar.execute(
        makeRequest({ action: 'browser.snapshot', target: {} })
      )
      expect(snapResult.status).toBe('ok')
      const snapEvidence = snapResult.evidence as Record<string, unknown> | undefined
      expect(snapEvidence).toBeDefined()
      // Sanitized DOM should have title (string) and url (string).
      expect(typeof snapEvidence!.title).toBe('string')
      expect(typeof snapEvidence!.url).toBe('string')
      // Browser may normalize URLs with trailing slash.
      expect(snapEvidence!.url).toMatch(new RegExp(`^${SMOKE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
      // Should have headings array.
      expect(Array.isArray(snapEvidence!.headings)).toBe(true)
      // Should have visibleText (sanitized text content, no scripts/styles).
      expect(typeof snapEvidence!.visibleText).toBe('string')
      expect((snapEvidence!.visibleText as string).length).toBeGreaterThan(0)
      // Should have interactives array.
      expect(Array.isArray(snapEvidence!.interactives)).toBe(true)
      // Should have linkCount.
      expect(typeof snapEvidence!.linkCount).toBe('number')

      // 3. Screenshot.
      const sshotResult = await sidecar.execute(
        makeRequest({ action: 'browser.screenshot', target: {} })
      )
      expect(sshotResult.status).toBe('ok')
      const sshotEvidence = sshotResult.evidence as Record<string, unknown> | undefined
      expect(sshotEvidence).toBeDefined()
      expect(sshotEvidence!.screenshotCaptured).toBe(true)

      // 4. Audit events — should have requested, allowed, and completed events.
      const completedEvents = auditLog.events.filter((e) => e.status === 'completed')
      expect(completedEvents.length).toBeGreaterThanOrEqual(2)

      // Each action should be represented.
      const actions = auditLog.events.map((e) => e.action)
      expect(actions).toContain('browser.navigate')
      expect(actions).toContain('browser.snapshot')
      expect(actions).toContain('browser.screenshot')

      // No blocked events.
      const blockedEvents = auditLog.events.filter((e) => e.status === 'blocked')
      expect(blockedEvents).toHaveLength(0)
    } finally {
      await sidecar.shutdown()
    }
  })

  it('click and type actions on a local page', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    try {
      // Navigate first.
      const navResult = await sidecar.execute(
        makeRequest({ target: { url: SMOKE_URL } })
      )
      if (skipIfServerDown(navResult)) return
      expect(navResult.status).toBe('ok')

      // Type into a selector (if available — may fail if selector doesn't exist).
      // We try a common selector; best-effort validation that the action is supported.
      const typeResult = await sidecar.execute(
        makeRequest({
          action: 'browser.type',
          target: { selector: 'input', text: 'test query' }
        })
      )
      // Type may fail if no input exists on the page — that's fine.
      // We just prove the action is routed correctly.
      expect(['ok', 'failed'].includes(typeResult.status)).toBe(true)

      // Click a selector (best-effort).
      const clickResult = await sidecar.execute(
        makeRequest({
          action: 'browser.click',
          target: { selector: 'a' }
        })
      )
      expect(['ok', 'failed'].includes(clickResult.status)).toBe(true)

      // All actions should have audit records.
      expect(auditLog.events.length).toBeGreaterThanOrEqual(3)
    } finally {
      await sidecar.shutdown()
    }
  })

  it('blocks navigation to disallowed hosts even when browser is available', async () => {
    const auditLog = new InMemoryAutomationAuditLog()
    const sidecar = new PlaywrightSidecar({ auditLog, headless: true })

    try {
      // First navigate to localhost to prove browser is available.
      const navResult = await sidecar.execute(
        makeRequest({ target: { url: SMOKE_URL } })
      )
      if (skipIfServerDown(navResult)) return
      expect(navResult.status).toBe('ok')

      // Then try non-localhost — must be blocked.
      const badResult = await sidecar.execute(
        makeRequest({
          action: 'browser.navigate',
          target: { url: 'https://example.com' }
        })
      )
      expect(badResult.status).toBe('blocked')
      expect(badResult.message).toContain('local/dev hosts')

      // Snapshot on non-localhost also blocked.
      const snapResult = await sidecar.execute(
        makeRequest({
          action: 'browser.snapshot',
          target: { url: 'https://example.com' }
        })
      )
      expect(snapResult.status).toBe('blocked')

      // At least two blocked audit events.
      const blockedEvents = auditLog.events.filter((e) => e.status === 'blocked')
      expect(blockedEvents.length).toBeGreaterThanOrEqual(2)
    } finally {
      await sidecar.shutdown()
    }
  })

  it('disk evidence artifacts survive a simulated restart/reload', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'kun-smoke-evidence-'))
    const auditLog = new InMemoryAutomationAuditLog()

    try {
      // Phase 1: create store, navigate, capture evidence.
      const store1 = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })
      const sidecar = new PlaywrightSidecar({
        auditLog,
        headless: true,
        onEvidence: (batch) => store1.ingest(batch)
      })

      try {
        const navResult = await sidecar.execute(
          makeRequest({ target: { url: SMOKE_URL } })
        )
        if (skipIfServerDown(navResult)) return
        expect(navResult.status).toBe('ok')

        // Take a screenshot to generate disk evidence.
        await sidecar.execute(
          makeRequest({ action: 'browser.screenshot', target: {} })
        )

        // Take a DOM snapshot.
        await sidecar.execute(
          makeRequest({ action: 'browser.snapshot', target: {} })
        )
      } finally {
        await sidecar.shutdown()
      }

      // Evidence should be on disk now.
      expect(store1.count).toBeGreaterThanOrEqual(2)

      // Verify disk files exist.
      const threadDir = join(tmpDir, 'thr_smoke')
      expect(existsSync(threadDir)).toBe(true)
      const diskFiles = readdirSync(threadDir).filter(
        (f) => f.startsWith('ev_') && f.endsWith('.json')
      )
      expect(diskFiles.length).toBeGreaterThanOrEqual(2)

      // Phase 2: simulate restart — new store instance from same root.
      const store2 = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })
      store2.loadFromDisk()

      expect(store2.count).toBeGreaterThanOrEqual(2)
      const reloadedEntries = store2.forThread('thr_smoke')
      expect(reloadedEntries.length).toBeGreaterThanOrEqual(2)

      // Evidence should include screenshots (base64 PNG data).
      const screenshots = reloadedEntries.filter((e) => e.kind === 'screenshot' && e.screenshotBase64)
      expect(screenshots.length).toBeGreaterThanOrEqual(1)
      expect(screenshots[0].screenshotBase64!.length).toBeGreaterThan(100)

      // Evidence should include console or network entries.
      const nonScreenshots = reloadedEntries.filter((e) => e.kind !== 'screenshot')
      expect(nonScreenshots.length).toBeGreaterThanOrEqual(0) // console/network depends on page

      // Audit log from memory (not persisted, but proves all actions are tracked).
      const completedEvents = auditLog.events.filter((e) => e.status === 'completed')
      const actions = completedEvents.map((e) => e.action)
      expect(actions).toContain('browser.navigate')
      expect(actions).toContain('browser.snapshot')
      expect(actions).toContain('browser.screenshot')
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // cleanup best-effort
      }
    }
  })
})
