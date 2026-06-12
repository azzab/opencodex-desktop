/**
 * Real Playwright Chromium sidecar implementing AutomationSidecar.
 *
 * Launches on demand, loopback-only. Enforces host allowlist defense-in-depth
 * and captures evidence (screenshots, console, redacted network summaries).
 * Playwright is always imported dynamically so the package works without
 * bundled browsers. Minimal type stubs live in kun/src/types/playwright-stubs.d.ts.
 */

import { randomUUID } from 'node:crypto'
import type { Browser, BrowserContext, Page } from 'playwright'
import type {
  AutomationActionRequest,
  AutomationPermissionDecision
} from './automation-policy.js'
import {
  decideAutomationPermission,
  normalizeAutomationCapabilityConfig,
  targetSummaryForAudit,
  type AutomationCapabilityConfig
} from './automation-policy.js'
import type {
  AutomationAuditLog,
  AutomationAuditRecord,
  AutomationSidecar,
  AutomationSidecarResult
} from './automation-sidecar.js'
import { InMemoryAutomationAuditLog } from './automation-sidecar.js'
import { redactSecrets } from '../config/secret-redaction.js'

export type PlaywrightSidecarOptions = {
  headless?: boolean
  auditLog?: AutomationAuditLog
  nowIso?: () => string
  /**
   * Optional evidence callback. When set, the sidecar pushes captured
   * evidence through this callback so callers can store it per thread.
   */
  onEvidence?: (evidence: AutomationEvidenceBatch) => void
}

export type AutomationEvidence = {
  id: string
  threadId: string
  runId: string
  kind: 'screenshot' | 'console' | 'network'
  timestamp: string
  /** Base64-encoded PNG for screenshots. */
  screenshotBase64?: string
  /** URL the screenshot was captured from. */
  screenshotUrl?: string
  /** Console entries (up to 200 per snapshot). */
  consoleEntries?: BrowserConsoleEntry[]
  /** Redacted network summaries. */
  networkEntries?: BrowserNetworkEntry[]
}

export type AutomationEvidenceBatch = {
  threadId: string
  events: AutomationEvidence[]
}

export type BrowserConsoleEntry = {
  type: string
  text: string
  timestamp: string
  location?: string
}

export type BrowserNetworkEntry = {
  method: string
  url: string
  status: number
  statusText?: string
  /** Response body snippet only for allowed hosts; always redacted. */
  bodySnippet?: string
  timestamp: string
  durationMs?: number
}

const EVIDENCE_MAX_CONSOLE_ENTRIES = 200
const EVIDENCE_MAX_NETWORK_ENTRIES = 200

export class PlaywrightSidecar implements AutomationSidecar {
  readonly id = 'playwright-chromium'
  available = false

  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private readonly headless: boolean
  private readonly auditLog: AutomationAuditLog
  private readonly nowIso: () => string
  private readonly onEvidence?: (evidence: AutomationEvidenceBatch) => void
  private readonly consoleEntries: BrowserConsoleEntry[] = []
  private readonly networkEntries: BrowserNetworkEntry[] = []
  private launching: Promise<void> | null = null
  private closed = false

  constructor(options: PlaywrightSidecarOptions = {}) {
    this.headless = options.headless !== false
    this.auditLog = options.auditLog ?? new InMemoryAutomationAuditLog(500)
    this.nowIso = options.nowIso ?? (() => new Date().toISOString())
    this.onEvidence = options.onEvidence
  }

  private async ensureBrowser(): Promise<{ page: Page; available: boolean }> {
    if (this.closed) return { page: this.page!, available: false }
    if (this.page && !this.page.isClosed()) return { page: this.page, available: true }

    if (!this.launching) {
      this.launching = this.launchBrowser()
    }

    try {
      await this.launching
    } catch {
      this.available = false
      this.launching = null
      return { page: this.page!, available: false }
    }

    return { page: this.page!, available: this.available }
  }

  private async launchBrowser(): Promise<void> {
    // Dynamic import — Playwright is an optional dependency.
    let pw: typeof import('playwright')
    try {
      pw = await import('playwright')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ERR_MODULE_NOT_FOUND') {
        throw new Error(
          'Playwright is not installed. Run: npx playwright install chromium'
        )
      }
      throw err
    }

    this.browser = await pw.chromium.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    })

    this.context.on('console', (msg) => {
      if (this.consoleEntries.length >= EVIDENCE_MAX_CONSOLE_ENTRIES) {
        this.consoleEntries.shift()
      }
      this.consoleEntries.push({
        type: msg.type(),
        text: redactSecrets(msg.text()),
        timestamp: this.nowIso(),
        location: msg.location().url || undefined
      })
    })

    this.page = await this.context.newPage()

    this.page.on('request', (req) => {
      void req.response().then((res) => {
        if (res && this.networkEntries.length < EVIDENCE_MAX_NETWORK_ENTRIES) {
          this.networkEntries.push({
            method: req.method(),
            url: sanitizeNetworkUrl(req.url()),
            status: res.status(),
            statusText: res.statusText(),
            timestamp: this.nowIso(),
            durationMs: undefined
          })
        }
      }).catch(() => {
        // Request may fail before response — skip.
      })
    })

    this.available = true
    this.launching = null
  }

  async execute(
    request: AutomationActionRequest
  ): Promise<AutomationSidecarResult> {
    // Defense-in-depth permission check in the sidecar itself.
    const config = normalizeAutomationCapabilityConfig({ enabled: true })
    const decision = decideAutomationPermission(config, request)

    if (decision.decision === 'deny') {
      await this.recordAudit(request, {
        status: 'blocked',
        decision,
        targetSummary: targetSummaryForAudit(request.target)
      })
      return { status: 'blocked', message: decision.reason }
    }

    const targetSummary = targetSummaryForAudit(request.target)

    try {
      const { page, available } = await this.ensureBrowser()

      if (!available) {
        await this.recordAudit(request, {
          status: 'failed',
          decision,
          targetSummary,
          reason: 'browser is unavailable'
        })
        return {
          status: 'failed',
          message: 'Playwright Chromium is unavailable — browsers may not be installed'
        }
      }

      // --- Route by action ---

      if (request.action === 'browser.navigate') {
        return await this.executeNavigate(page, request, config, decision, targetSummary)
      }

      if (request.action === 'browser.click') {
        return await this.executeClick(page, request, decision, targetSummary)
      }

      if (request.action === 'browser.type') {
        return await this.executeType(page, request, decision, targetSummary)
      }

      if (request.action === 'browser.screenshot') {
        return await this.executeScreenshot(request, decision, targetSummary)
      }

      if (request.action === 'browser.snapshot') {
        return await this.executeSnapshot(page, request, decision, targetSummary)
      }

      // Unknown action — fail with audit.
      await this.recordAudit(request, {
        status: 'failed',
        decision,
        targetSummary,
        reason: `unsupported action: ${request.action}`
      })
      return {
        status: 'failed',
        message: `unsupported action: ${request.action}`
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.recordAudit(request, {
        status: 'failed',
        decision,
        targetSummary,
        reason: message
      })
      return { status: 'failed', message }
    }
  }

  private async executeNavigate(
    page: Page,
    request: AutomationActionRequest,
    config: AutomationCapabilityConfig,
    decision: AutomationPermissionDecision,
    targetSummary: string
  ): Promise<AutomationSidecarResult> {
    // Defense-in-depth host allowlist enforcement.
    const hostCheck = this.validateHost(request.target.url, config)
    if (!hostCheck.ok) {
      await this.recordAudit(request, {
        status: 'blocked',
        decision,
        targetSummary: hostCheck.url ?? 'unknown',
        reason: hostCheck.reason
      })
      return { status: 'blocked', message: hostCheck.reason }
    }

    await page.goto(request.target.url!, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000
    })

    const title = await page.title()

    // Capture evidence.
    const evidence: AutomationEvidence[] = []
    const screenshot = await this.captureScreenshot(request)
    if (screenshot) evidence.push(screenshot)
    const consoleSnap = this.snapshotConsole(request)
    if (consoleSnap) evidence.push(consoleSnap)
    const networkSnap = this.snapshotNetwork(request)
    if (networkSnap) evidence.push(networkSnap)

    if (evidence.length > 0 && this.onEvidence) {
      this.onEvidence({ threadId: request.threadId, events: evidence })
    }

    await this.recordAudit(request, {
      status: 'completed',
      decision,
      targetSummary
    })

    return {
      status: 'ok',
      evidence: {
        title,
        url: request.target.url,
        screenshotCaptured: !!screenshot,
        consoleEntries: consoleSnap?.consoleEntries?.length ?? 0,
        networkEntries: networkSnap?.networkEntries?.length ?? 0
      }
    }
  }

  private async executeClick(
    page: Page,
    request: AutomationActionRequest,
    decision: AutomationPermissionDecision,
    targetSummary: string
  ): Promise<AutomationSidecarResult> {
    if (!request.target.selector) {
      return { status: 'failed', message: 'click requires a selector' }
    }

    await page.click(request.target.selector, { timeout: 10_000 })

    await this.recordAudit(request, {
      status: 'completed',
      decision,
      targetSummary
    })

    return { status: 'ok', evidence: { selector: request.target.selector } }
  }

  private async executeType(
    page: Page,
    request: AutomationActionRequest,
    decision: AutomationPermissionDecision,
    targetSummary: string
  ): Promise<AutomationSidecarResult> {
    if (!request.target.selector) {
      return { status: 'failed', message: 'type requires a selector' }
    }

    await page.fill(request.target.selector, request.target.text ?? '', {
      timeout: 10_000
    })

    await this.recordAudit(request, {
      status: 'completed',
      decision,
      targetSummary
    })

    return {
      status: 'ok',
      evidence: {
        selector: request.target.selector,
        textLength: (request.target.text ?? '').length
      }
    }
  }

  private async executeScreenshot(
    request: AutomationActionRequest,
    decision: AutomationPermissionDecision,
    targetSummary: string
  ): Promise<AutomationSidecarResult> {
    const evidence = await this.captureScreenshot(request)
    if (evidence && this.onEvidence) {
      this.onEvidence({ threadId: request.threadId, events: [evidence] })
    }

    await this.recordAudit(request, {
      status: 'completed',
      decision,
      targetSummary
    })

    return {
      status: 'ok',
      evidence: {
        screenshotCaptured: !!evidence,
        url: this.page?.url()
      }
    }
  }

  // --- Host validation (defense in depth) ---

  private validateHost(
    urlValue: string | undefined,
    config: AutomationCapabilityConfig
  ): { ok: true } | { ok: false; reason: string; url?: string } {
    const raw =
      typeof urlValue === 'string' && urlValue.trim() ? urlValue.trim() : ''
    if (!raw) {
      return { ok: false, reason: 'browser navigation requires a URL', url: raw }
    }
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      return {
        ok: false,
        reason: 'browser navigation URL is invalid',
        url: raw
      }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        reason: 'browser navigation requires HTTP or HTTPS',
        url: raw
      }
    }
    if (!config.localDevOnly) return { ok: true }
    const host = parsed.hostname
      .trim()
      .toLowerCase()
      .replace(/^\[/, '')
      .replace(/\]$/, '')
    const allowed = new Set(
      config.allowedHosts.map((h) => h.trim().toLowerCase())
    )
    if (allowed.has(host)) return { ok: true }
    return {
      ok: false,
      reason:
        'browser navigation is limited to local/dev hosts (sidecar enforcement)',
      url: sanitizeNetworkUrl(raw)
    }
  }

  // --- DOM Snapshot ---

  private async executeSnapshot(
    page: Page,
    request: AutomationActionRequest,
    decision: AutomationPermissionDecision,
    targetSummary: string
  ): Promise<AutomationSidecarResult> {
    // Defense-in-depth: if a URL is provided in the target, validate it
    // against the host allowlist. Snapshots always operate on the current
    // page; an explicit URL must be on an allowed host.
    if (request.target.url) {
      const config = normalizeAutomationCapabilityConfig({ enabled: true })
      const hostCheck = this.validateHost(request.target.url, config)
      if (!hostCheck.ok) {
        await this.recordAudit(request, {
          status: 'blocked',
          decision,
          targetSummary: hostCheck.url ?? 'unknown',
          reason: hostCheck.reason
        })
        return { status: 'blocked', message: hostCheck.reason }
      }
    }

    try {
      // String evaluation avoids TS browser-global issues with our stubs.
      // The real Playwright types resolve correctly at runtime.
      const raw: unknown = await page.evaluate(`(() => {
        var doc = document
        var title = doc.title
        var url = location.href

        var headings = []
        for (var level = 1; level <= 6; level++) {
          doc.querySelectorAll('h' + level).forEach(function(el) {
            var text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 200)
            if (text) headings.push({ level: level, text: text })
          })
        }

        var hintSelector = function(el) {
          var tag = el.tagName.toLowerCase()
          if (el.id) return '#' + CSS.escape(el.id)
          var testId = el.getAttribute('data-testid')
          if (testId) return tag + '[data-testid="' + CSS.escape(testId) + '"]'
          var cls = el.classList.length > 0 ? '.' + CSS.escape(el.classList[0]) : ''
          return tag + cls
        }

        var interactives = []
        doc.querySelectorAll('button, a[href], input, textarea, select, [role="button"]').forEach(function(el) {
          var tag = el.tagName.toLowerCase()
          var kind = tag
          if (tag === 'a') kind = 'link'
          else if (el.getAttribute('role') === 'button') kind = 'button'

          var text = ''
          if (tag === 'input') {
            text = el.value || el.placeholder || el.name || el.type || ''
          } else if (tag === 'textarea') {
            text = el.value || el.placeholder || el.name || ''
          } else {
            text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 150)
          }

          if (text || tag === 'input') {
            interactives.push({
              kind: kind,
              text: text.slice(0, 150),
              selector: hintSelector(el)
            })
          }
        })

        var links = []
        doc.querySelectorAll('a[href]').forEach(function(el) {
          var text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 150)
          var href = el.href
          if (text && href) links.push({ text: text, href: href })
        })

        var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
          acceptNode: function(node) {
            var parent = node.parentElement
            if (!parent) return NodeFilter.FILTER_REJECT
            var tag = parent.tagName.toLowerCase()
            if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg') {
              return NodeFilter.FILTER_REJECT
            }
            var style = window.getComputedStyle(parent)
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT
            }
            return NodeFilter.FILTER_ACCEPT
          }
        })
        var textParts = []
        var totalChars = 0
        var maxChars = 8000
        while (walker.nextNode() && totalChars < maxChars) {
          var raw = (walker.currentNode.textContent || '').replace(/\\s+/g, ' ').trim()
          if (raw) {
            textParts.push(raw)
            totalChars += raw.length
          }
        }
        var visibleText = textParts.join(' ').slice(0, maxChars)

        return {
          title: title,
          url: url,
          headings: headings,
          interactiveCount: interactives.length,
          interactives: interactives.slice(0, 100),
          linkCount: links.length,
          links: links.slice(0, 100),
          visibleText: visibleText,
          visibleTextLength: visibleText.length
        }
      })()`)
      const dom = raw as Record<string, unknown>

      // Capture evidence.
      const evidence: AutomationEvidence[] = []
      const screenshot = await this.captureScreenshot(request)
      if (screenshot) evidence.push(screenshot)
      const consoleSnap = this.snapshotConsole(request)
      if (consoleSnap) evidence.push(consoleSnap)
      const networkSnap = this.snapshotNetwork(request)
      if (networkSnap) evidence.push(networkSnap)

      if (evidence.length > 0 && this.onEvidence) {
        this.onEvidence({ threadId: request.threadId, events: evidence })
      }

      await this.recordAudit(request, {
        status: 'completed',
        decision,
        targetSummary
      })

      return {
        status: 'ok',
        evidence: {
          ...dom,
          screenshotCaptured: !!screenshot,
          consoleEntries: consoleSnap?.consoleEntries?.length ?? 0,
          networkEntries: networkSnap?.networkEntries?.length ?? 0
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.recordAudit(request, {
        status: 'failed',
        decision,
        targetSummary,
        reason: message
      })
      return { status: 'failed', message }
    }
  }

  // --- Evidence capture ---

  private async captureScreenshot(
    request: AutomationActionRequest
  ): Promise<AutomationEvidence | null> {
    if (!this.page || this.page.isClosed()) return null
    try {
      const buffer = await this.page.screenshot({
        type: 'png',
        fullPage: false
      })
      return {
        id: `ev_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        threadId: request.threadId,
        runId: request.runId,
        kind: 'screenshot',
        timestamp: this.nowIso(),
        screenshotBase64: buffer.toString('base64'),
        screenshotUrl: this.page.url()
      }
    } catch {
      return null
    }
  }

  private snapshotConsole(
    request: AutomationActionRequest
  ): AutomationEvidence | null {
    if (this.consoleEntries.length === 0) return null
    return {
      id: `ev_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      threadId: request.threadId,
      runId: request.runId,
      kind: 'console',
      timestamp: this.nowIso(),
      consoleEntries: [...this.consoleEntries]
    }
  }

  private snapshotNetwork(
    request: AutomationActionRequest
  ): AutomationEvidence | null {
    if (this.networkEntries.length === 0) return null
    return {
      id: `ev_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      threadId: request.threadId,
      runId: request.runId,
      kind: 'network',
      timestamp: this.nowIso(),
      networkEntries: [...this.networkEntries]
    }
  }

  // --- Audit ---

  private async recordAudit(
    request: AutomationActionRequest,
    opts: {
      status: AutomationAuditRecord['status']
      decision: AutomationPermissionDecision
      targetSummary: string
      reason?: string
    }
  ): Promise<void> {
    await this.auditLog.record({
      runId: request.runId,
      threadId: request.threadId,
      turnId: request.turnId,
      action: request.action,
      status: opts.status,
      targetSummary: opts.targetSummary,
      permission: opts.decision.permission,
      decision: opts.decision.decision,
      reason: opts.reason ?? opts.decision.reason,
      sidecar: this.id,
      timestamp: this.nowIso()
    })
  }

  // --- Lifecycle ---

  async shutdown(): Promise<void> {
    this.closed = true
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {})
      }
    } catch {
      /* ignore */
    }
    try {
      if (this.context) {
        await this.context.close().catch(() => {})
      }
    } catch {
      /* ignore */
    }
    try {
      if (this.browser) {
        await this.browser.close().catch(() => {})
      }
    } catch {
      /* ignore */
    }
    this.page = null
    this.context = null
    this.browser = null
    this.launching = null
    this.available = false
  }
}

function sanitizeNetworkUrl(value: string): string {
  try {
    const parsed = new URL(value)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.href
  } catch {
    return value.length > 200 ? value.slice(0, 200) + '…' : value
  }
}
