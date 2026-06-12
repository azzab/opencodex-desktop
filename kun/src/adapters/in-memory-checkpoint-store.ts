import type { CheckpointRecord } from '../contracts/checkpoints.js'
import type { CheckpointStore } from '../ports/checkpoint-store.js'

/**
 * In-memory checkpoint store for tests and development.
 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<string, CheckpointRecord>()

  async save(checkpoint: CheckpointRecord): Promise<CheckpointRecord> {
    this.checkpoints.set(checkpoint.id, { ...checkpoint })
    return checkpoint
  }

  async get(id: string): Promise<CheckpointRecord | null> {
    return this.checkpoints.get(id) ?? null
  }

  async listByThread(threadId: string): Promise<CheckpointRecord[]> {
    return [...this.checkpoints.values()]
      .filter((cp) => cp.threadId === threadId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async delete(id: string): Promise<boolean> {
    return this.checkpoints.delete(id)
  }

  async countByThread(threadId: string): Promise<number> {
    return [...this.checkpoints.values()].filter((cp) => cp.threadId === threadId).length
  }

  async countTotal(): Promise<number> {
    return this.checkpoints.size
  }

  async listIdsByThread(threadId: string): Promise<string[]> {
    return [...this.checkpoints.values()]
      .filter((cp) => cp.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((cp) => cp.id)
  }
}
