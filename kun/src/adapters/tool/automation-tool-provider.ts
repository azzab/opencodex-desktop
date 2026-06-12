import { randomUUID } from 'node:crypto'
import { createApprovalRequest } from '../../domain/approval.js'
import type { AutomationCapabilityConfig } from '../../contracts/capabilities.js'
import type { ToolHostContext } from '../../ports/tool-host.js'
import type { CapabilityToolProvider } from './capability-registry.js'
import { LocalToolHost, type LocalTool } from './local-tool-host.js'
import {
  decideAutomationPermission,
  normalizeAutomationCapabilityConfig,
  targetSummaryForAudit,
  type AutomationAction,
  type AutomationActionRequest,
  type AutomationTarget
} from '../../automation/automation-policy.js'
import {
  InMemoryAutomationAuditLog,
  NoopAutomationSidecar,
  type AutomationAuditLog,
  type AutomationSidecar,
  type AutomationSidecarResult
} from '../../automation/automation-sidecar.js'

export type AutomationProviderDiagnostic = {
  id: string
  enabled: boolean
  available: boolean
  sidecar: string
  reason?: string
}

export type AutomationToolProviderBuildResult = {
  providers: CapabilityToolProvider[]
  diagnostics: AutomationProviderDiagnostic[]
  available: boolean
  sidecar: string
}

export type AutomationToolProviderOptions = {
  auditLog?: AutomationAuditLog
  sidecar?: AutomationSidecar
  nowIso?: () => string
}

export function buildAutomationToolProviders(
  configInput: AutomationCapabilityConfig | undefined,
  options: AutomationToolProviderOptions = {}
): AutomationToolProviderBuildResult {
  const config = normalizeAutomationCapabilityConfig(configInput)
  const sidecar = options.sidecar ?? new NoopAutomationSidecar()
  const auditLog = options.auditLog ?? new InMemoryAutomationAuditLog(config.auditLog.maxEntries)
  const nowIso = options.nowIso ?? (() => new Date().toISOString())
  const available = config.enabled && config.auditLog.enabled && sidecar.available
  const diagnostic: AutomationProviderDiagnostic = {
    id: 'automation',
    enabled: config.enabled,
    available,
    sidecar: sidecar.id,
    ...(!config.enabled
      ? { reason: 'experimental automation is disabled by config' }
      : !config.auditLog.enabled
        ? { reason: 'automation audit log is disabled by config' }
      : !sidecar.available
        ? { reason: 'automation sidecar is unavailable' }
        : {})
  }
  const providers: CapabilityToolProvider[] = diagnostic.available
    ? [{
        id: 'automation',
        kind: 'automation',
        enabled: true,
        available: true,
        tools: createAutomationTools({ config, sidecar, auditLog, nowIso })
      }]
    : []

  return {
    providers,
    diagnostics: [diagnostic],
    available: diagnostic.available,
    sidecar: sidecar.id
  }
}

function createAutomationTools(options: {
  config: AutomationCapabilityConfig
  sidecar: AutomationSidecar
  auditLog: AutomationAuditLog
  nowIso: () => string
}): LocalTool[] {
  return [
    createAutomationTool({
      name: 'browser_navigate',
      description: 'Navigate the controlled browser through the automation sidecar.',
      action: 'browser.navigate',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
        additionalProperties: false
      },
      target: (args) => ({ url: stringValue(args.url) }),
      ...options
    }),
    createAutomationTool({
      name: 'browser_click',
      description: 'Click a selector in the controlled browser through the automation sidecar.',
      action: 'browser.click',
      inputSchema: {
        type: 'object',
        properties: { selector: { type: 'string' } },
        required: ['selector'],
        additionalProperties: false
      },
      target: (args) => ({ selector: stringValue(args.selector) }),
      ...options
    }),
    createAutomationTool({
      name: 'browser_type',
      description: 'Type into a selector in the controlled browser through the automation sidecar.',
      action: 'browser.type',
      inputSchema: {
        type: 'object',
        properties: { selector: { type: 'string' }, text: { type: 'string' } },
        required: ['selector', 'text'],
        additionalProperties: false
      },
      target: (args) => ({ selector: stringValue(args.selector), text: stringValue(args.text) }),
      ...options
    }),
    createAutomationTool({
      name: 'browser_screenshot',
      description: 'Capture controlled-browser screenshot evidence through the automation sidecar.',
      action: 'browser.screenshot',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: [],
        additionalProperties: false
      },
      target: (args) => ({ url: stringValue(args.url) }),
      ...options
    }),
    createAutomationTool({
      name: 'browser_snapshot',
      description: 'Read the current DOM as sanitized text (title, URL, visible text, input values) through the automation sidecar. Returns page metadata, headings, interactive elements, links, and a text dump of visible content. Use this to inspect page state before clicking or typing.',
      action: 'browser.snapshot',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      },
      target: () => ({}),
      ...options
    }),
    createAutomationTool({
      name: 'local_file_access',
      description: 'Request automation-sidecar local file access for browser evidence only.',
      action: 'local_file.access',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
        additionalProperties: false
      },
      target: (args) => ({ path: stringValue(args.path) }),
      ...options
    }),
    createAutomationTool({
      name: 'app_control',
      description: 'Request future app/computer control through a native sidecar.',
      action: 'app.control',
      inputSchema: {
        type: 'object',
        properties: { app: { type: 'string' } },
        required: ['app'],
        additionalProperties: false
      },
      target: (args) => ({ app: stringValue(args.app) }),
      ...options
    })
  ]
}

function createAutomationTool(options: {
  name: string
  description: string
  action: AutomationAction
  inputSchema: Record<string, unknown>
  target: (args: Record<string, unknown>) => AutomationTarget
  config: AutomationCapabilityConfig
  sidecar: AutomationSidecar
  auditLog: AutomationAuditLog
  nowIso: () => string
}): LocalTool {
  return LocalToolHost.defineTool({
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    policy: 'auto',
    toolKind: 'tool_call',
    planModeAllowed: false,
    execute: async (args, context) => executeAutomationTool(options, args, context)
  })
}

async function executeAutomationTool(
  options: {
    name: string
    action: AutomationAction
    target: (args: Record<string, unknown>) => AutomationTarget
    config: AutomationCapabilityConfig
    sidecar: AutomationSidecar
    auditLog: AutomationAuditLog
    nowIso: () => string
  },
  args: Record<string, unknown>,
  context: ToolHostContext
): Promise<{ output: AutomationSidecarResult; isError?: boolean }> {
  const request: AutomationActionRequest = {
    action: options.action,
    runId: `auto_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    threadId: context.threadId,
    turnId: context.turnId,
    workspace: context.workspace,
    target: options.target(args)
  }
  const targetSummary = targetSummaryForAudit(request.target)
  await options.auditLog.record({
    runId: request.runId,
    threadId: request.threadId,
    turnId: request.turnId,
    action: request.action,
    status: 'requested',
    targetSummary,
    sidecar: options.sidecar.id,
    timestamp: options.nowIso()
  })
  const decision = decideAutomationPermission(options.config, request)
  if (decision.decision === 'deny') {
    await options.auditLog.record({
      runId: request.runId,
      threadId: request.threadId,
      turnId: request.turnId,
      action: request.action,
      status: 'blocked',
      targetSummary,
      permission: decision.permission,
      decision: decision.decision,
      reason: decision.reason,
      sidecar: options.sidecar.id,
      timestamp: options.nowIso()
    })
    return {
      output: {
        status: 'blocked',
        message: decision.reason
      },
      isError: true
    }
  }
  if (decision.decision === 'ask') {
    const approval = createApprovalRequest({
      id: `appr_${request.runId}`,
      threadId: context.threadId,
      turnId: context.turnId,
      toolName: options.name,
      summary: `Run ${request.action} on ${targetSummary}`,
      createdAt: options.nowIso()
    })
    const approvalDecision = await context.awaitApproval(approval)
    if (approvalDecision !== 'allow') {
      await options.auditLog.record({
        runId: request.runId,
        threadId: request.threadId,
        turnId: request.turnId,
        action: request.action,
        status: 'blocked',
        targetSummary,
        permission: decision.permission,
        decision: decision.decision,
        reason: 'user denied automation approval',
        sidecar: options.sidecar.id,
        timestamp: options.nowIso()
      })
      return {
        output: {
          status: 'blocked',
          message: 'user denied automation approval'
        },
        isError: true
      }
    }
  }
  await options.auditLog.record({
    runId: request.runId,
    threadId: request.threadId,
    turnId: request.turnId,
    action: request.action,
    status: 'allowed',
    targetSummary,
    permission: decision.permission,
    decision: decision.decision,
    reason: decision.reason,
    sidecar: options.sidecar.id,
    timestamp: options.nowIso()
  })
  try {
    const result = await options.sidecar.execute(request)
    await options.auditLog.record({
      runId: request.runId,
      threadId: request.threadId,
      turnId: request.turnId,
      action: request.action,
      status: result.status === 'ok' ? 'completed' : 'failed',
      targetSummary,
      permission: decision.permission,
      decision: decision.decision,
      reason: result.message,
      sidecar: options.sidecar.id,
      timestamp: options.nowIso()
    })
    return { output: result, isError: result.status !== 'ok' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await options.auditLog.record({
      runId: request.runId,
      threadId: request.threadId,
      turnId: request.turnId,
      action: request.action,
      status: 'failed',
      targetSummary,
      permission: decision.permission,
      decision: decision.decision,
      reason: message,
      sidecar: options.sidecar.id,
      timestamp: options.nowIso()
    })
    return {
      output: {
        status: 'failed',
        message
      },
      isError: true
    }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
