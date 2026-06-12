import type { LoopRecord, CreateLoopRequest, UpdateLoopRequest } from '../contracts/automations.js'

export interface LoopStore {
  /** Create a new loop record. */
  create(request: CreateLoopRequest, id: string, now: string): Promise<LoopRecord>

  /** Get a loop by id. */
  get(id: string): Promise<LoopRecord | undefined>

  /** List all loops, optionally filtered by project or status. */
  list(filter?: { projectId?: string; status?: LoopRecord['status'][] }): Promise<LoopRecord[]>

  /** Update a loop record. */
  update(id: string, request: UpdateLoopRequest, now: string): Promise<LoopRecord | undefined>

  /** Pause a loop. */
  pause(id: string, now: string): Promise<LoopRecord | undefined>

  /** Resume a paused loop. */
  resume(id: string, now: string): Promise<LoopRecord | undefined>

  /** Cancel a loop (terminal state). */
  cancel(id: string, now: string): Promise<LoopRecord | undefined>

  /** Mark a loop as expired. */
  expire(id: string, now: string): Promise<LoopRecord | undefined>

  /** Get loops that are due for execution (nextRunAt <= now and status === 'active'). */
  getDue(now: string): Promise<LoopRecord[]>

  /** Record a run result for a loop. */
  recordRun(
    id: string,
    result: {
      status: LoopRecord['lastRunStatus']
      threadId?: string
      error?: string
      tokens: number
      costUsd: number
    },
    now: string
  ): Promise<LoopRecord | undefined>

  /** Delete a loop. */
  delete(id: string): Promise<boolean>
}
