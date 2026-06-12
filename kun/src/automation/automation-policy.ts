import { relative, resolve, sep } from 'node:path'
import {
  AutomationCapabilityConfig as AutomationCapabilityConfigSchema,
  DEFAULT_AUTOMATION_ALLOWED_HOSTS,
  DEFAULT_AUTOMATION_PERMISSIONS,
  type AutomationCapabilityConfig,
  type AutomationPermissionKey,
  type AutomationPermissionMode
} from '../contracts/capabilities.js'

export {
  DEFAULT_AUTOMATION_ALLOWED_HOSTS,
  DEFAULT_AUTOMATION_PERMISSIONS,
  type AutomationCapabilityConfig,
  type AutomationPermissionKey,
  type AutomationPermissionMode
} from '../contracts/capabilities.js'

export type AutomationAction =
  | 'browser.navigate'
  | 'browser.click'
  | 'browser.type'
  | 'browser.screenshot'
  | 'browser.snapshot'
  | 'local_file.access'
  | 'app.control'

export type AutomationTarget = {
  url?: string
  selector?: string
  text?: string
  path?: string
  app?: string
}

export type AutomationActionRequest = {
  action: AutomationAction
  runId: string
  threadId: string
  turnId: string
  workspace: string
  target: AutomationTarget
}

export type AutomationPermissionDecision = {
  decision: AutomationPermissionMode
  permission: AutomationPermissionKey
  reason: string
}

export function normalizeAutomationCapabilityConfig(input: unknown): AutomationCapabilityConfig {
  const parsed = AutomationCapabilityConfigSchema.parse(input ?? {})
  return {
    ...parsed,
    allowedHosts: normalizeAllowedHosts(parsed.allowedHosts),
    permissions: {
      ...DEFAULT_AUTOMATION_PERMISSIONS,
      ...parsed.permissions
    },
    auditLog: {
      enabled: parsed.auditLog.enabled !== false,
      maxEntries: clampPositiveInt(parsed.auditLog.maxEntries, 500, 10_000)
    }
  }
}

export function decideAutomationPermission(
  configInput: AutomationCapabilityConfig,
  request: AutomationActionRequest
): AutomationPermissionDecision {
  const config = normalizeAutomationCapabilityConfig(configInput)
  const permission = permissionForAction(request.action)
  if (!config.enabled) {
    return deny(permission, 'experimental automation is disabled')
  }
  if (request.action === 'app.control') {
    return deny(permission, 'app/computer control is not implemented in this phase')
  }
  if (request.action === 'browser.navigate') {
    const urlDecision = validateBrowserTarget(config, request.target.url)
    if (!urlDecision.ok) return deny(permission, urlDecision.reason)
  }
  if (request.action === 'browser.snapshot') {
    // DOM snapshot shares browser navigation permission gate.
    // If an explicit URL is provided, validate it against the host allowlist
    // so disallowed hosts are blocked before any browser access is attempted.
    if (request.target.url) {
      const urlDecision = validateBrowserTarget(config, request.target.url)
      if (!urlDecision.ok) return deny(permission, urlDecision.reason)
    }
  }
  if (request.action === 'browser.click' || request.action === 'browser.type') {
    if (!stringValue(request.target.selector)) {
      return deny(permission, 'browser interaction requires a controlled-browser selector')
    }
  }
  if (request.action === 'local_file.access') {
    const pathDecision = validateWorkspacePath(request.workspace, request.target.path)
    if (!pathDecision.ok) return deny(permission, pathDecision.reason)
  }
  const configured = config.permissions[permission]
  return {
    decision: configured,
    permission,
    reason: configured === 'deny'
      ? `${permission} permission is denied by settings`
      : `${permission} permission is ${configured}`
  }
}

export function targetSummaryForAudit(target: AutomationTarget): string {
  if (target.url) return sanitizeUrlForAudit(target.url)
  if (target.selector) return `selector:${target.selector}`
  if (target.path) return `path:${target.path}`
  if (target.app) return `app:${target.app}`
  return 'target:unspecified'
}

function permissionForAction(action: AutomationAction): AutomationPermissionKey {
  switch (action) {
    case 'browser.navigate':
      return 'browserNavigation'
    case 'browser.click':
    case 'browser.type':
      return 'browserInteraction'
    case 'browser.screenshot':
      return 'screenshots'
    case 'browser.snapshot':
      return 'browserNavigation'
    case 'local_file.access':
      return 'localFileAccess'
    case 'app.control':
      return 'appControl'
  }
}

function validateBrowserTarget(
  config: AutomationCapabilityConfig,
  value: string | undefined
): { ok: true } | { ok: false; reason: string } {
  const raw = stringValue(value)
  if (!raw) return { ok: false, reason: 'browser navigation requires a URL' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'browser navigation URL is invalid' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'browser navigation requires HTTP or HTTPS' }
  }
  if (!config.localDevOnly) return { ok: true }
  const host = normalizeHost(parsed.hostname)
  const allowed = new Set(config.allowedHosts.map(normalizeHost))
  if (allowed.has(host)) return { ok: true }
  return { ok: false, reason: 'browser navigation is limited to local/dev hosts' }
}

function validateWorkspacePath(
  workspace: string,
  path: string | undefined
): { ok: true } | { ok: false; reason: string } {
  const root = stringValue(workspace)
  const requested = stringValue(path)
  if (!root || !requested) return { ok: false, reason: 'local file access requires workspace and path' }
  const resolvedRoot = resolve(root)
  const resolvedPath = resolve(requested)
  const rel = relative(resolvedRoot, resolvedPath)
  if (!rel || (!rel.startsWith('..') && !rel.includes(`..${sep}`))) return { ok: true }
  return { ok: false, reason: 'local file access is limited to the active workspace' }
}

function deny(permission: AutomationPermissionKey, reason: string): AutomationPermissionDecision {
  return { decision: 'deny', permission, reason }
}

function sanitizeUrlForAudit(value: string): string {
  try {
    const parsed = new URL(value)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.href
  } catch {
    return 'url:invalid'
  }
}

function normalizeAllowedHosts(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values?.length ? values : DEFAULT_AUTOMATION_ALLOWED_HOSTS) {
    const host = normalizeHost(value)
    if (!host || seen.has(host)) continue
    seen.add(host)
    out.push(host)
    if (out.length >= 128) break
  }
  return out.length > 0 ? out : [...DEFAULT_AUTOMATION_ALLOWED_HOSTS]
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
}

function stringValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), max)
    : fallback
}
