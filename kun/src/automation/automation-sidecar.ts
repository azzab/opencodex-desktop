import type {
  AutomationActionRequest,
  AutomationPermissionDecision
} from './automation-policy.js'

export type AutomationSidecarResult = {
  status: 'ok' | 'blocked' | 'failed' | 'not_implemented'
  message?: string
  evidence?: Record<string, unknown>
}

export type AutomationAuditStatus =
  | 'requested'
  | 'allowed'
  | 'blocked'
  | 'completed'
  | 'failed'

export type AutomationAuditRecord = {
  runId: string
  threadId: string
  turnId: string
  action: AutomationActionRequest['action']
  status: AutomationAuditStatus
  targetSummary: string
  timestamp: string
  permission?: AutomationPermissionDecision['permission']
  decision?: AutomationPermissionDecision['decision']
  reason?: string
  sidecar?: string
}

export interface AutomationAuditLog {
  record(event: AutomationAuditRecord): Promise<void> | void
}

export interface AutomationSidecar {
  readonly id: string
  readonly available: boolean
  execute(request: AutomationActionRequest): Promise<AutomationSidecarResult>
}

export class InMemoryAutomationAuditLog implements AutomationAuditLog {
  readonly events: AutomationAuditRecord[] = []
  private readonly maxEntries: number

  constructor(maxEntries = 500) {
    this.maxEntries = Number.isFinite(maxEntries) && maxEntries > 0
      ? Math.floor(maxEntries)
      : 500
  }

  record(event: AutomationAuditRecord): void {
    this.events.push(event)
    if (this.events.length > this.maxEntries) {
      this.events.splice(0, this.events.length - this.maxEntries)
    }
  }
}

export class MockAutomationSidecar implements AutomationSidecar {
  readonly id = 'mock'
  readonly available = true
  readonly requests: AutomationActionRequest[] = []
  private readonly result: AutomationSidecarResult

  constructor(result: AutomationSidecarResult) {
    this.result = result
  }

  async execute(request: AutomationActionRequest): Promise<AutomationSidecarResult> {
    this.requests.push(request)
    return this.result
  }
}

export class NoopAutomationSidecar implements AutomationSidecar {
  readonly id = 'noop'
  readonly available = false

  async execute(): Promise<AutomationSidecarResult> {
    return {
      status: 'not_implemented',
      message: 'automation sidecar is not connected'
    }
  }
}
