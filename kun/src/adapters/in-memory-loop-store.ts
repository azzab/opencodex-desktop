import type { LoopStore } from '../ports/loop-store.js'
import type {
  LoopRecord,
  CreateLoopRequest,
  UpdateLoopRequest,
  LoopRunStatus
} from '../contracts/automations.js'

export class InMemoryLoopStore implements LoopStore {
  private readonly loops = new Map<string, LoopRecord>()

  async create(request: CreateLoopRequest, id: string, now: string): Promise<LoopRecord> {
    const record: LoopRecord = {
      id,
      projectId: request.projectId,
      threadTemplateId: request.threadTemplateId,
      prompt: request.prompt,
      model: request.model,
      schedule: request.schedule,
      status: 'active',
      catchUpPolicy: request.catchUpPolicy ?? 'skip',
      queuePolicy: request.queuePolicy ?? 'queue',
      expiryRuns: request.expiryRuns,
      expiryDate: request.expiryDate,
      maxRuns: request.maxRuns,
      runCount: 0,
      nextRunAt: computeInitialNextRun(request.schedule, now),
      lastRunAt: undefined,
      lastRunStatus: 'idle',
      lastRunThreadId: undefined,
      lastRunError: undefined,
      usage: {
        totalTurns: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        lastTurnTokens: 0,
        lastTurnCostUsd: 0
      },
      createdAt: now,
      updatedAt: now
    }
    this.loops.set(id, record)
    return record
  }

  async get(id: string): Promise<LoopRecord | undefined> {
    return this.loops.get(id)
  }

  async list(filter?: { projectId?: string; status?: LoopRecord['status'][] }): Promise<LoopRecord[]> {
    let results = [...this.loops.values()]
    if (filter?.projectId) {
      results = results.filter((l) => l.projectId === filter.projectId)
    }
    if (filter?.status && filter.status.length > 0) {
      const statusSet = new Set(filter.status)
      results = results.filter((l) => statusSet.has(l.status))
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async update(id: string, request: UpdateLoopRequest, now: string): Promise<LoopRecord | undefined> {
    const existing = this.loops.get(id)
    if (!existing) return undefined
    const updated: LoopRecord = {
      ...existing,
      ...(request.prompt !== undefined ? { prompt: request.prompt } : {}),
      ...(request.model !== undefined ? { model: request.model } : {}),
      ...(request.schedule !== undefined ? { schedule: request.schedule } : {}),
      ...(request.status !== undefined ? { status: request.status } : {}),
      ...(request.catchUpPolicy !== undefined ? { catchUpPolicy: request.catchUpPolicy } : {}),
      ...(request.queuePolicy !== undefined ? { queuePolicy: request.queuePolicy } : {}),
      ...(request.expiryRuns !== undefined ? { expiryRuns: request.expiryRuns ?? undefined } : {}),
      ...(request.expiryDate !== undefined ? { expiryDate: request.expiryDate ?? undefined } : {}),
      ...(request.maxRuns !== undefined ? { maxRuns: request.maxRuns ?? undefined } : {}),
      updatedAt: now
    }
    this.loops.set(id, updated)
    return updated
  }

  async pause(id: string, now: string): Promise<LoopRecord | undefined> {
    const existing = this.loops.get(id)
    if (!existing) return undefined
    if (existing.status === 'cancelled' || existing.status === 'expired' || existing.status === 'completed') {
      return existing
    }
    const updated: LoopRecord = {
      ...existing,
      status: 'paused',
      updatedAt: now
    }
    this.loops.set(id, updated)
    return updated
  }

  async resume(id: string, now: string): Promise<LoopRecord | undefined> {
    const existing = this.loops.get(id)
    if (!existing || existing.status !== 'paused') return existing
    const updated: LoopRecord = {
      ...existing,
      status: 'active',
      nextRunAt: computeInitialNextRun(existing.schedule, now),
      updatedAt: now
    }
    this.loops.set(id, updated)
    return updated
  }

  async cancel(id: string, now: string): Promise<LoopRecord | undefined> {
    const existing = this.loops.get(id)
    if (!existing) return undefined
    const updated: LoopRecord = {
      ...existing,
      status: 'cancelled',
      updatedAt: now
    }
    this.loops.set(id, updated)
    return updated
  }

  async expire(id: string, now: string): Promise<LoopRecord | undefined> {
    const existing = this.loops.get(id)
    if (!existing) return undefined
    const updated: LoopRecord = {
      ...existing,
      status: 'expired',
      updatedAt: now
    }
    this.loops.set(id, updated)
    return updated
  }

  async getDue(now: string): Promise<LoopRecord[]> {
    const result: LoopRecord[] = []
    for (const loop of this.loops.values()) {
      if (loop.status !== 'active') continue
      if (!loop.nextRunAt) continue
      if (loop.nextRunAt <= now) {
        result.push(loop)
      }
    }
    return result.sort((a, b) => (a.nextRunAt ?? '').localeCompare(b.nextRunAt ?? ''))
  }

  async recordRun(
    id: string,
    result: {
      status: LoopRunStatus
      threadId?: string
      error?: string
      tokens: number
      costUsd: number
    },
    now: string
  ): Promise<LoopRecord | undefined> {
    const existing = this.loops.get(id)
    if (!existing) return undefined
    const updated: LoopRecord = {
      ...existing,
      runCount: existing.runCount + 1,
      lastRunAt: now,
      lastRunStatus: result.status,
      lastRunThreadId: result.threadId,
      lastRunError: result.error,
      nextRunAt: result.status === 'running' ? existing.nextRunAt : undefined,
      usage: {
        totalTurns: existing.usage.totalTurns + 1,
        totalTokens: existing.usage.totalTokens + result.tokens,
        totalCostUsd: existing.usage.totalCostUsd + result.costUsd,
        lastTurnTokens: result.tokens,
        lastTurnCostUsd: result.costUsd
      },
      updatedAt: now
    }
    this.loops.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<boolean> {
    return this.loops.delete(id)
  }
}

function computeInitialNextRun(
  schedule: LoopRecord['schedule'],
  now: string
): string | undefined {
  const nowDate = new Date(now)
  if (!Number.isFinite(nowDate.getTime())) return undefined

  switch (schedule.kind) {
    case 'interval':
      if (schedule.everyMinutes) {
        return new Date(nowDate.getTime() + schedule.everyMinutes * 60_000).toISOString()
      }
      return undefined
    case 'cron':
      // Simple fallback: use everyMinutes or default to now
      if (schedule.everyMinutes) {
        return new Date(nowDate.getTime() + schedule.everyMinutes * 60_000).toISOString()
      }
      return new Date(nowDate.getTime() + 60_000).toISOString()
    case 'at':
      return schedule.atTime
  }
}
