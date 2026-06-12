import type { CheckpointRecord } from '../contracts/checkpoints.js'

/**
 * Port for persistent checkpoint storage.
 */
export interface CheckpointStore {
  /** Persist a checkpoint record. */
  save(checkpoint: CheckpointRecord): Promise<CheckpointRecord>

  /** Get a checkpoint by id. */
  get(id: string): Promise<CheckpointRecord | null>

  /** List checkpoint summaries for a thread (newest first). */
  listByThread(threadId: string): Promise<CheckpointRecord[]>

  /** Delete a checkpoint by id. Returns true if deleted. */
  delete(id: string): Promise<boolean>

  /** Count checkpoints for a thread. */
  countByThread(threadId: string): Promise<number>

  /** Count total checkpoints across all threads. */
  countTotal(): Promise<number>

  /** List all checkpoint ids for a thread, oldest first, for pruning. */
  listIdsByThread(threadId: string): Promise<string[]>
}
