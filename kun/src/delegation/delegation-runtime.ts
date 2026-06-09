import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type {
  SubagentWorkflowPresetConfig,
  SubagentWorkflowPresetId,
  SubagentsCapabilityConfig
} from '../contracts/capabilities.js'
import type { RuntimeEventRecorder } from '../services/runtime-event-recorder.js'
import type { UsageSnapshot } from '../contracts/usage.js'
import { emptyUsageSnapshot } from '../contracts/usage.js'

const ChildRunUsage = z.object({
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  cachedTokens: z.number().int().nonnegative().optional(),
  cacheHitTokens: z.number().int().nonnegative().optional(),
  cacheMissTokens: z.number().int().nonnegative().optional(),
  cacheHitRate: z.number().min(0).max(1).nullable().optional(),
  turns: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  costCny: z.number().nonnegative().optional(),
  cacheSavingsUsd: z.number().nonnegative().optional(),
  cacheSavingsCny: z.number().nonnegative().optional(),
  tokenEconomySavingsTokens: z.number().int().nonnegative().optional(),
  tokenEconomySavingsUsd: z.number().nonnegative().optional(),
  tokenEconomySavingsCny: z.number().nonnegative().optional()
})

export const ChildRunRecord = z.object({
  id: z.string().min(1),
  parentThreadId: z.string().min(1),
  parentTurnId: z.string().min(1),
  label: z.string().optional(),
  prompt: z.string().min(1),
  workspace: z.string().optional(),
  model: z.string().optional(),
  preset: z.string().optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'aborted']),
  summary: z.string().optional(),
  error: z.string().optional(),
  usage: ChildRunUsage.default({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()
export type ChildRunRecord = z.infer<typeof ChildRunRecord>

export type ChildRunExecutor = (input: {
  childId: string
  parentThreadId: string
  parentTurnId: string
  label?: string
  prompt: string
  workspace?: string
  model?: string
  preset?: string
  signal: AbortSignal
}) => Promise<{ summary: string; usage?: ChildRunRecord['usage'] }>

export type ChildRunAggregate = {
  key: string
  label?: string
  model?: string
  runs: number
  completed: number
  failed: number
  aborted: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheHitTokens: number
  cacheMissTokens: number
  cacheHitRate: number | null
  costUsd?: number
  costCny?: number
  cacheSavingsUsd?: number
  cacheSavingsCny?: number
  summaries: string[]
  averageTotalTokens: number
  averageCostUsd?: number
  averageCostCny?: number
}

type ChildRunBudgetPolicy = Pick<
  SubagentsCapabilityConfig,
  | 'defaultModel'
  | 'maxParallel'
  | 'maxChildRuns'
  | 'maxTotalChildTokens'
  | 'maxChildCostUsd'
  | 'perAgentTimeoutMs'
>

type ChildRunBudgetStop = {
  code:
    | 'subagent_parallel_budget_exhausted'
    | 'subagent_child_run_budget_exhausted'
    | 'subagent_token_budget_exhausted'
    | 'subagent_cost_budget_exhausted'
  message: string
  used: number
  limit: number
}

export class FileDelegationStore {
  constructor(private readonly rootDir: string) {}

  async upsert(record: ChildRunRecord): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    await writeFile(join(this.rootDir, `${record.id}.json`), JSON.stringify(record, null, 2), 'utf8')
  }

  async list(parentThreadId?: string): Promise<ChildRunRecord[]> {
    await mkdir(this.rootDir, { recursive: true })
    const entries = await readdir(this.rootDir).catch(() => [])
    const records = await Promise.all(entries
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => readFile(join(this.rootDir, entry), 'utf8')
        .then((text) => ChildRunRecord.parse(JSON.parse(text)))
        .catch(() => null)))
    return records
      .filter((record): record is ChildRunRecord => Boolean(record))
      .filter((record) => !parentThreadId || record.parentThreadId === parentThreadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
}

export class DelegationRuntime {
  private active = 0
  private childSeq = 0

  constructor(private readonly options: {
    config: SubagentsCapabilityConfig
    store: FileDelegationStore
    events?: RuntimeEventRecorder
    nowIso?: () => string
    idGenerator?: () => string
    executor?: ChildRunExecutor
    recordExternalUsage?: (threadId: string, usage: UsageSnapshot) => UsageSnapshot | void | Promise<UsageSnapshot | void>
  }) {}

  async runChild(input: {
    parentThreadId: string
    parentTurnId: string
    label?: string
    prompt: string
    workspace?: string
    model?: string
    preset?: string
    signal: AbortSignal
  }): Promise<ChildRunRecord> {
    if (!this.options.config.enabled) throw new Error('delegation is disabled by config')
    const policy = this.policyForPreset(input.preset)
    if (policy.maxParallel > 0 && this.active >= policy.maxParallel) {
      throw new Error('delegation parallel budget exhausted')
    }
    const existing = await this.options.store.list(input.parentThreadId)
    const stop = budgetStopForRecords(existing, policy, this.active)
    if (stop) throw new Error(stop.message)
    const now = this.now()
    const id = this.options.idGenerator?.() ?? `child_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const model = input.model?.trim() || policy.defaultModel || this.options.config.defaultModel
    const preset = input.preset?.trim() || undefined
    let record = ChildRunRecord.parse({
      id,
      parentThreadId: input.parentThreadId,
      parentTurnId: input.parentTurnId,
      label: input.label,
      prompt: input.prompt,
      workspace: input.workspace,
      model,
      preset,
      status: 'running',
      createdAt: now,
      updatedAt: now
    })
    await this.options.store.upsert(record)
    await this.recordChildEvent(record)
    this.active += 1
    const timeout = childRunTimeoutSignal(input.signal, policy.perAgentTimeoutMs)
    try {
      const executor: ChildRunExecutor = this.options.executor ?? defaultExecutor
      const result = await executor({
        childId: id,
        parentThreadId: input.parentThreadId,
        parentTurnId: input.parentTurnId,
        ...(input.label ? { label: input.label } : {}),
        prompt: input.prompt,
        workspace: input.workspace,
        model,
        ...(preset ? { preset } : {}),
        signal: timeout.signal
      })
      record = ChildRunRecord.parse({
        ...record,
        status: 'completed',
        summary: result.summary,
        usage: result.usage ?? record.usage,
        updatedAt: this.now()
      })
      await this.options.store.upsert(record)
      await this.recordChildEvent(record)
      await this.recordExternalUsage(record)
      await this.recordBudgetStopIfExceeded(record, policy)
      return record
    } catch (error) {
      record = ChildRunRecord.parse({
        ...record,
        status: timeout.signal.aborted ? 'aborted' : 'failed',
        error: timeout.timedOut ? `child agent timed out after ${policy.perAgentTimeoutMs}ms` : errorMessage(error),
        updatedAt: this.now()
      })
      await this.options.store.upsert(record)
      await this.recordChildEvent(record)
      return record
    } finally {
      timeout.cleanup()
      this.active -= 1
    }
  }

  async diagnostics(parentThreadId?: string): Promise<{
    enabled: boolean
    active: number
    childRuns: ChildRunRecord[]
    aggregates: ChildRunAggregate[]
    usage: UsageSnapshot
  }> {
    const childRuns = await this.options.store.list(parentThreadId)
    return {
      enabled: this.options.config.enabled,
      active: this.active,
      childRuns,
      aggregates: aggregateChildRuns(childRuns),
      usage: aggregateChildUsage(childRuns)
    }
  }

  private async recordChildEvent(record: ChildRunRecord): Promise<void> {
    await this.options.events?.record({
      kind: record.status === 'completed' ? 'turn_completed' : record.status === 'failed' ? 'turn_failed' : record.status === 'aborted' ? 'turn_aborted' : 'turn_started',
      threadId: record.parentThreadId,
      turnId: record.parentTurnId,
      status: record.status,
      text: record.summary ?? record.error,
      child: {
        parentThreadId: record.parentThreadId,
        parentTurnId: record.parentTurnId,
        childId: record.id,
        childLabel: record.label,
        childStatus: record.status,
        childSeq: ++this.childSeq,
        childModel: record.model,
        childPreset: record.preset,
        childUsage: toUsageSnapshot(record.usage)
      }
    })
  }

  private async recordExternalUsage(record: ChildRunRecord): Promise<void> {
    if (record.status !== 'completed') return
    const usage = toUsageSnapshot(record.usage)
    if (usage.totalTokens <= 0 && usage.costUsd === undefined && usage.costCny === undefined) return
    const recorded = await this.options.recordExternalUsage?.(record.parentThreadId, usage)
    const recordedUsage = isUsageSnapshotLike(recorded) ? recorded : usage
    await this.options.events?.record({
      kind: 'usage',
      threadId: record.parentThreadId,
      turnId: record.parentTurnId,
      model: record.model,
      usage: recordedUsage,
      child: {
        parentThreadId: record.parentThreadId,
        parentTurnId: record.parentTurnId,
        childId: record.id,
        childLabel: record.label,
        childStatus: record.status,
        childSeq: ++this.childSeq,
        childModel: record.model,
        childPreset: record.preset,
        childUsage: usage
      }
    })
  }

  private async recordBudgetStopIfExceeded(
    record: ChildRunRecord,
    policy: ChildRunBudgetPolicy
  ): Promise<void> {
    const records = await this.options.store.list(record.parentThreadId)
    const stop = budgetStopForRecords(records, policy, this.active)
    if (!stop) return
    await this.options.events?.record({
      kind: 'error',
      threadId: record.parentThreadId,
      turnId: record.parentTurnId,
      itemId: `child_budget_${record.id}`,
      message: stop.message,
      code: 'subagent_budget_exceeded',
      severity: 'error',
      details: stop
    })
  }

  private policyForPreset(preset: string | undefined): ChildRunBudgetPolicy {
    const trimmed = preset?.trim()
    if (!trimmed) return this.options.config
    if (!isPresetId(trimmed)) throw new Error(`unknown subagent workflow preset: ${trimmed}`)
    const presetConfig = this.options.config.workflowPresets[trimmed]
    if (!presetConfig.enabled) throw new Error(`subagent workflow preset is disabled: ${trimmed}`)
    return policyFromPreset(presetConfig, this.options.config)
  }

  private now(): string {
    return this.options.nowIso?.() ?? new Date().toISOString()
  }
}

function isPresetId(value: string): value is SubagentWorkflowPresetId {
  return ['review_swarm', 'implementation_split', 'research_split', 'audit_split'].includes(value)
}

function policyFromPreset(
  preset: SubagentWorkflowPresetConfig,
  fallback: SubagentsCapabilityConfig
): ChildRunBudgetPolicy {
  return {
    defaultModel: preset.defaultModel || fallback.defaultModel,
    maxParallel: preset.maxParallel,
    maxChildRuns: preset.maxChildRuns,
    maxTotalChildTokens: preset.maxTotalChildTokens,
    maxChildCostUsd: preset.maxChildCostUsd,
    perAgentTimeoutMs: preset.perAgentTimeoutMs
  }
}

function toUsageSnapshot(usage: ChildRunRecord['usage']): UsageSnapshot {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    cachedTokens: usage.cachedTokens,
    cacheHitTokens: usage.cacheHitTokens,
    cacheMissTokens: usage.cacheMissTokens,
    cacheHitRate: usage.cacheHitRate ?? null,
    turns: usage.turns ?? 0,
    costUsd: usage.costUsd,
    costCny: usage.costCny,
    cacheSavingsUsd: usage.cacheSavingsUsd,
    cacheSavingsCny: usage.cacheSavingsCny,
    tokenEconomySavingsTokens: usage.tokenEconomySavingsTokens,
    tokenEconomySavingsUsd: usage.tokenEconomySavingsUsd,
    tokenEconomySavingsCny: usage.tokenEconomySavingsCny
  }
}

export function aggregateChildRuns(records: readonly ChildRunRecord[]): ChildRunAggregate[] {
  const buckets = new Map<string, ChildRunAggregate>()
  for (const record of records) {
    const label = record.label?.trim() || undefined
    const model = record.model?.trim() || undefined
    const key = `${label ?? 'unlabeled'}:${model ?? 'default'}`
    const bucket = buckets.get(key) ?? {
      key,
      ...(label ? { label } : {}),
      ...(model ? { model } : {}),
      runs: 0,
      completed: 0,
      failed: 0,
      aborted: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
      cacheHitRate: null,
      summaries: [],
      averageTotalTokens: 0
    }
    bucket.runs += 1
    if (record.status === 'completed') bucket.completed += 1
    else if (record.status === 'failed') bucket.failed += 1
    else if (record.status === 'aborted') bucket.aborted += 1
    bucket.promptTokens += record.usage.promptTokens
    bucket.completionTokens += record.usage.completionTokens
    bucket.totalTokens += record.usage.totalTokens
    bucket.cacheHitTokens += record.usage.cacheHitTokens ?? 0
    bucket.cacheMissTokens += record.usage.cacheMissTokens ?? 0
    if (record.usage.costUsd !== undefined) bucket.costUsd = (bucket.costUsd ?? 0) + record.usage.costUsd
    if (record.usage.costCny !== undefined) bucket.costCny = (bucket.costCny ?? 0) + record.usage.costCny
    if (record.usage.cacheSavingsUsd !== undefined) {
      bucket.cacheSavingsUsd = (bucket.cacheSavingsUsd ?? 0) + record.usage.cacheSavingsUsd
    }
    if (record.usage.cacheSavingsCny !== undefined) {
      bucket.cacheSavingsCny = (bucket.cacheSavingsCny ?? 0) + record.usage.cacheSavingsCny
    }
    if (record.summary?.trim()) bucket.summaries.push(record.summary.trim())
    const cacheTotal = bucket.cacheHitTokens + bucket.cacheMissTokens
    bucket.cacheHitRate = cacheTotal > 0 ? bucket.cacheHitTokens / cacheTotal : null
    bucket.averageTotalTokens = bucket.runs > 0 ? bucket.totalTokens / bucket.runs : 0
    bucket.averageCostUsd = bucket.costUsd !== undefined && bucket.runs > 0 ? bucket.costUsd / bucket.runs : undefined
    bucket.averageCostCny = bucket.costCny !== undefined && bucket.runs > 0 ? bucket.costCny / bucket.runs : undefined
    buckets.set(key, bucket)
  }
  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      summaries: [...bucket.summaries].sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) =>
      b.runs - a.runs ||
      b.totalTokens - a.totalTokens ||
      a.key.localeCompare(b.key)
    )
}

export function aggregateChildUsage(records: readonly ChildRunRecord[]): UsageSnapshot {
  return records.reduce((usage, record) => {
    const delta = toUsageSnapshot(record.usage)
    const cacheHitTokens = (usage.cacheHitTokens ?? 0) + (delta.cacheHitTokens ?? 0)
    const cacheMissTokens = (usage.cacheMissTokens ?? 0) + (delta.cacheMissTokens ?? 0)
    const cacheTotal = cacheHitTokens + cacheMissTokens
    return {
      promptTokens: usage.promptTokens + delta.promptTokens,
      completionTokens: usage.completionTokens + delta.completionTokens,
      totalTokens: usage.totalTokens + delta.totalTokens,
      cachedTokens: (usage.cachedTokens ?? 0) + (delta.cachedTokens ?? 0),
      cacheHitTokens,
      cacheMissTokens,
      cacheHitRate: cacheTotal > 0 ? cacheHitTokens / cacheTotal : null,
      turns: usage.turns + delta.turns,
      costUsd:
        usage.costUsd === undefined && delta.costUsd === undefined
          ? undefined
          : (usage.costUsd ?? 0) + (delta.costUsd ?? 0),
      costCny:
        usage.costCny === undefined && delta.costCny === undefined
          ? undefined
          : (usage.costCny ?? 0) + (delta.costCny ?? 0),
      cacheSavingsUsd:
        usage.cacheSavingsUsd === undefined && delta.cacheSavingsUsd === undefined
          ? undefined
          : (usage.cacheSavingsUsd ?? 0) + (delta.cacheSavingsUsd ?? 0),
      cacheSavingsCny:
        usage.cacheSavingsCny === undefined && delta.cacheSavingsCny === undefined
          ? undefined
          : (usage.cacheSavingsCny ?? 0) + (delta.cacheSavingsCny ?? 0),
      tokenEconomySavingsTokens:
        (usage.tokenEconomySavingsTokens ?? 0) + (delta.tokenEconomySavingsTokens ?? 0),
      tokenEconomySavingsUsd:
        usage.tokenEconomySavingsUsd === undefined && delta.tokenEconomySavingsUsd === undefined
          ? undefined
          : (usage.tokenEconomySavingsUsd ?? 0) + (delta.tokenEconomySavingsUsd ?? 0),
      tokenEconomySavingsCny:
        usage.tokenEconomySavingsCny === undefined && delta.tokenEconomySavingsCny === undefined
          ? undefined
          : (usage.tokenEconomySavingsCny ?? 0) + (delta.tokenEconomySavingsCny ?? 0)
    }
  }, emptyUsageSnapshot())
}

function budgetStopForRecords(
  records: readonly ChildRunRecord[],
  policy: ChildRunBudgetPolicy,
  active: number
): ChildRunBudgetStop | null {
  if (policy.maxChildRuns > 0 && records.length >= policy.maxChildRuns) {
    return {
      code: 'subagent_child_run_budget_exhausted',
      message: `delegation child-run budget exhausted (${records.length}/${policy.maxChildRuns})`,
      used: records.length,
      limit: policy.maxChildRuns
    }
  }
  if (policy.maxParallel > 0 && active >= policy.maxParallel) {
    return {
      code: 'subagent_parallel_budget_exhausted',
      message: `delegation parallel budget exhausted (${active}/${policy.maxParallel})`,
      used: active,
      limit: policy.maxParallel
    }
  }
  const usage = aggregateChildUsage(records)
  if (policy.maxTotalChildTokens > 0 && usage.totalTokens >= policy.maxTotalChildTokens) {
    return {
      code: 'subagent_token_budget_exhausted',
      message: `delegation token budget exhausted (${usage.totalTokens}/${policy.maxTotalChildTokens})`,
      used: usage.totalTokens,
      limit: policy.maxTotalChildTokens
    }
  }
  const costUsd = usage.costUsd ?? 0
  if (policy.maxChildCostUsd > 0 && costUsd >= policy.maxChildCostUsd) {
    return {
      code: 'subagent_cost_budget_exhausted',
      message: `delegation cost budget exhausted (${costUsd}/${policy.maxChildCostUsd})`,
      used: costUsd,
      limit: policy.maxChildCostUsd
    }
  }
  return null
}

function childRunTimeoutSignal(parentSignal: AbortSignal, timeoutMs: number): {
  signal: AbortSignal
  timedOut: boolean
  cleanup: () => void
} {
  if (timeoutMs <= 0) {
    return { signal: parentSignal, timedOut: false, cleanup: () => undefined }
  }
  const controller = new AbortController()
  let timedOut = false
  const abortFromParent = (): void => controller.abort(parentSignal.reason)
  if (parentSignal.aborted) abortFromParent()
  else parentSignal.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error(`child agent timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut
    },
    cleanup: () => {
      clearTimeout(timer)
      parentSignal.removeEventListener('abort', abortFromParent)
    }
  }
}

const defaultExecutor: ChildRunExecutor = async (input) => {
  return { summary: `Child result: ${input.prompt}` }
}

function isUsageSnapshotLike(value: unknown): value is UsageSnapshot {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
