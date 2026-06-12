import type { LoopStore } from '../ports/loop-store.js'
import type { IdGenerator } from '../ports/id-generator.js'
import type { Clock } from '../ports/clock.js'
import type { EventBus } from '../ports/event-bus.js'
import type { ModelClient } from '../ports/model-client.js'
import type { ThreadStore } from '../ports/thread-store.js'
import type { TurnService } from '../services/turn-service.js'
import type { UsageService } from '../services/usage-service.js'
import type { RuntimeEventRecorder } from '../services/runtime-event-recorder.js'
import type {
  LoopRecord,
  CreateLoopRequest,
  UpdateLoopRequest,
  LoopScheduleSpec,
  LoopRunStatus,
  LoopAutomationSettings
} from '../contracts/automations.js'
import type { ThreadRecord } from '../contracts/threads.js'

export type LoopSchedulerOptions = {
  loopStore: LoopStore
  ids: IdGenerator
  clock: Clock
  eventBus: EventBus
  model: ModelClient
  threadStore: ThreadStore
  turns: TurnService
  usage: UsageService
  events: RuntimeEventRecorder
  settings: LoopAutomationSettings
  nowIso: () => string
}

export class LoopScheduler {
  private readonly opts: LoopSchedulerOptions
  private timer: ReturnType<typeof setInterval> | undefined
  private running = false
  private readonly activeRunIds = new Set<string>()

  constructor(opts: LoopSchedulerOptions) {
    this.opts = opts
    this.opts.settings = opts.settings ?? {
      enabled: true,
      defaultModel: 'deepseek-v4-pro',
      maxConcurrentLoops: 5,
      minIntervalMinutes: 1,
      requireProjectId: true
    }
  }

  /** Start the scheduler ticker. */
  start(): void {
    if (this.running) return
    this.running = true
    const intervalMs = Math.max(30_000, this.opts.settings.minIntervalMinutes * 60_000)
    this.timer = setInterval(() => {
      this.tick().catch(() => {
        // ticks are self-contained; errors are logged within
      })
    }, intervalMs)
    // Run an initial tick
    this.tick().catch(() => {})
  }

  /** Stop the scheduler ticker. */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /** Check for due loops and execute them. */
  private async tick(): Promise<void> {
    if (!this.opts.settings.enabled) return
    const now = this.opts.nowIso()
    const due = await this.opts.loopStore.getDue(now)

    for (const loop of due) {
      if (this.activeRunIds.size >= this.opts.settings.maxConcurrentLoops) break
      if (this.activeRunIds.has(loop.id)) continue

      // Skip if another turn is active on this thread
      const thread = await this.opts.threadStore.get(loop.threadTemplateId)
      if (thread?.status === 'running') {
        if (loop.queuePolicy === 'queue') continue
        // skip policy: record skipped run
        await this.opts.loopStore.recordRun(loop.id, {
          status: 'skipped',
          tokens: 0,
          costUsd: 0
        }, now)
        await this.computeNextRun(loop, now)
        continue
      }

      void this.executeLoop(loop)
    }
  }

  private async executeLoop(loop: LoopRecord): Promise<void> {
    this.activeRunIds.add(loop.id)
    const now = this.opts.nowIso()
    try {
      let finalStatus: LoopRunStatus = 'success'
      let finalError: string | undefined
      let finalThreadId: string | undefined
      let turnTokens = 0
      let turnCostUsd = 0

      try {
        const thread = await this.opts.threadStore.get(loop.threadTemplateId)
        if (!thread) {
          finalStatus = 'skipped'
          finalError = `Thread ${loop.threadTemplateId} not found for loop ${loop.id}`
        } else {
          finalThreadId = thread.id

          // Snapshot usage before the turn to compute delta
          const usageBefore = this.opts.usage.forThread(finalThreadId)

          await this.opts.turns.startTurn({
            threadId: finalThreadId,
            request: {
              prompt: loop.prompt,
              mode: 'agent',
              model: loop.model
            }
          })

          // Compute usage delta (may be zero if the turn hasn't run yet)
          const usageAfter = this.opts.usage.forThread(finalThreadId)
          turnTokens = Math.max(0, usageAfter.totalTokens - usageBefore.totalTokens)
          turnCostUsd = Math.max(0, (usageAfter.costUsd ?? 0) - (usageBefore.costUsd ?? 0))
        }
      } catch (err) {
        finalStatus = 'error'
        finalError = err instanceof Error ? err.message : String(err)
      }

      // Record final run result with real usage
      await this.opts.loopStore.recordRun(loop.id, {
        status: finalStatus,
        threadId: finalThreadId,
        error: finalError,
        tokens: turnTokens,
        costUsd: turnCostUsd
      }, now)

      // Compute next run time
      await this.computeNextRun(loop, now)

      // Check expiry
      const updated = await this.opts.loopStore.get(loop.id)
      if (updated) {
        await this.checkExpiry(updated, now)
      }
    } finally {
      this.activeRunIds.delete(loop.id)
    }
  }

  private async computeNextRun(loop: LoopRecord, now: string): Promise<void> {
    const nextAt = computeNextRunAt(loop.schedule, now, loop.catchUpPolicy)
    // Update nextRunAt directly in the store if it changed
    const record = await this.opts.loopStore.get(loop.id)
    if (record && record.nextRunAt !== nextAt) {
      await this.opts.loopStore.update(loop.id, { id: loop.id }, now)
    }
  }

  private async checkExpiry(loop: LoopRecord, now: string): Promise<void> {
    let expired = false

    if (loop.maxRuns !== undefined && loop.runCount >= loop.maxRuns) {
      expired = true
    }
    if (loop.expiryRuns !== undefined && loop.runCount >= loop.expiryRuns) {
      expired = true
    }
    if (loop.expiryDate && loop.expiryDate <= now) {
      expired = true
    }

    if (expired) {
      await this.opts.loopStore.expire(loop.id, now)
      await this.opts.eventBus.publish({
        kind: 'error',
        seq: 0,
        timestamp: now,
        threadId: loop.threadTemplateId,
        itemId: loop.id,
        message: `Loop ${loop.id} expired after ${loop.runCount} runs.`,
        code: 'loop_expired',
        severity: 'warning'
      })
    }
  }

  // ── Management API ──

  async create(request: CreateLoopRequest): Promise<LoopRecord> {
    const id = this.opts.ids.next('loop')
    const now = this.opts.nowIso()
    return this.opts.loopStore.create(request, id, now)
  }

  async list(filter?: { projectId?: string; status?: LoopRecord['status'][] }): Promise<LoopRecord[]> {
    return this.opts.loopStore.list(filter)
  }

  async get(id: string): Promise<LoopRecord | undefined> {
    return this.opts.loopStore.get(id)
  }

  async update(id: string, request: UpdateLoopRequest): Promise<LoopRecord | undefined> {
    const now = this.opts.nowIso()
    return this.opts.loopStore.update(id, request, now)
  }

  async pause(id: string): Promise<LoopRecord | undefined> {
    const now = this.opts.nowIso()
    return this.opts.loopStore.pause(id, now)
  }

  async resume(id: string): Promise<LoopRecord | undefined> {
    const now = this.opts.nowIso()
    return this.opts.loopStore.resume(id, now)
  }

  async cancel(id: string): Promise<LoopRecord | undefined> {
    const now = this.opts.nowIso()
    return this.opts.loopStore.cancel(id, now)
  }

  async delete(id: string): Promise<boolean> {
    return this.opts.loopStore.delete(id)
  }
}

// ── Schedule computation ──

function computeNextRunAt(
  spec: LoopScheduleSpec,
  now: string,
  catchUp: LoopRecord['catchUpPolicy']
): string | undefined {
  const nowDate = new Date(now)
  if (!Number.isFinite(nowDate.getTime())) return undefined

  switch (spec.kind) {
    case 'interval': {
      if (!spec.everyMinutes) return undefined
      const next = new Date(nowDate.getTime() + spec.everyMinutes * 60_000)
      return next.toISOString()
    }
    case 'cron': {
      if (!spec.cronExpression) return undefined
      const next = nextCronTime(spec.cronExpression, nowDate)
      if (!next) return undefined

      // Skip-not-burst: if catch-up would mean running immediately,
      // skip to the next interval after now
      if (catchUp === 'skip' && next.getTime() < nowDate.getTime()) {
        const skipped = nextCronTime(spec.cronExpression, nowDate)
        return skipped?.toISOString()
      }
      return next.toISOString()
    }
    case 'at': {
      if (!spec.atTime) return undefined
      const atDate = new Date(spec.atTime)
      if (!Number.isFinite(atDate.getTime())) return undefined
      if (atDate > nowDate) return atDate.toISOString()
      return undefined // one-shot already passed
    }
  }
}

function nextCronTime(expression: string, from: Date): Date | null {
  // Simple cron-like parser supporting:
  // "*/N" for every N minutes
  // "0 * * * *" for hourly
  // "0 0 * * *" for daily
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    // Try simple "every N minutes" format
    const everyMatch = expression.match(/every\s+(\d+)\s*min(?:ute)?s?/i)
    if (everyMatch && everyMatch[1]) {
      const mins = parseInt(everyMatch[1], 10)
      if (mins > 0) {
        return new Date(from.getTime() + mins * 60_000)
      }
    }
    // Try "*/N" format for minutes
    const starMatch = expression.match(/^\*\/(\d+)$/)
    if (starMatch && starMatch[1]) {
      const mins = parseInt(starMatch[1], 10)
      if (mins > 0) {
        return new Date(from.getTime() + mins * 60_000)
      }
    }
    return null
  }

  const [minute, hour, dayOfMonth, ,] = parts

  const next = new Date(from)
  next.setSeconds(0, 0)

  if (dayOfMonth !== '*') {
    next.setDate(next.getDate() + 1)
    next.setHours(0, 0, 0, 0)
    return next
  }

  if (hour !== '*') {
    const targetHour = parseInt(hour, 10)
    if (Number.isFinite(targetHour)) {
      const nextHour = new Date(from)
      nextHour.setHours(targetHour, 0, 0, 0)
      if (nextHour <= from) {
        nextHour.setDate(nextHour.getDate() + 1)
      }
      return nextHour
    }
  }

  if (minute !== '*') {
    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2), 10)
      if (interval > 0) {
        const nextMs = from.getTime() + interval * 60_000
        return new Date(Math.ceil(nextMs / (interval * 60_000)) * interval * 60_000)
      }
    }
  }

  // Default: next minute
  return new Date(from.getTime() + 60_000)
}
