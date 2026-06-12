import { mkdir, readFile, readdir, rm, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { CheckpointRecord } from '../../contracts/checkpoints.js'
import type { CheckpointStore } from '../../ports/checkpoint-store.js'
import { atomicWriteFile } from './atomic-write.js'

/**
 * File-backed checkpoint store. Each checkpoint is stored as a small
 * JSON file under `{dataDir}/checkpoints/{checkpointId}.json`.
 *
 * Layout:
 *   {dataDir}/checkpoints/{checkpointId}.json
 */
export class FileCheckpointStore implements CheckpointStore {
  private readonly dataDir: string

  constructor(options: { dataDir: string }) {
    this.dataDir = resolve(options.dataDir, 'checkpoints')
  }

  async save(checkpoint: CheckpointRecord): Promise<CheckpointRecord> {
    await this.ensureDir()
    const path = this.filePath(checkpoint.id)
    await atomicWriteFile(path, JSON.stringify(checkpoint))
    return checkpoint
  }

  async get(id: string): Promise<CheckpointRecord | null> {
    try {
      const raw = await readFile(this.filePath(id), 'utf-8')
      return JSON.parse(raw) as CheckpointRecord
    } catch {
      return null
    }
  }

  async listByThread(threadId: string): Promise<CheckpointRecord[]> {
    await this.ensureDir()
    let entries: string[]
    try {
      entries = await readdir(this.dataDir)
    } catch {
      return []
    }
    const records: CheckpointRecord[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const raw = await readFile(join(this.dataDir, entry), 'utf-8')
        const record = JSON.parse(raw) as CheckpointRecord
        if (record.threadId === threadId) {
          records.push(record)
        }
      } catch {
        // Skip corrupted entries
      }
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async delete(id: string): Promise<boolean> {
    try {
      await unlink(this.filePath(id))
      return true
    } catch {
      return false
    }
  }

  async countByThread(threadId: string): Promise<number> {
    const records = await this.listByThread(threadId)
    return records.length
  }

  async countTotal(): Promise<number> {
    await this.ensureDir()
    try {
      const entries = await readdir(this.dataDir)
      return entries.filter((entry) => entry.endsWith('.json')).length
    } catch {
      return 0
    }
  }

  async listIdsByThread(threadId: string): Promise<string[]> {
    const records = await this.listByThread(threadId)
    return records
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((record) => record.id)
  }

  private filePath(checkpointId: string): string {
    return join(this.dataDir, `${checkpointId}.json`)
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
  }
}
