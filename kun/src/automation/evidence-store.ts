/**
 * Evidence store interfaces and implementations — in-memory and
 * file-backed — for automation evidence grouped by thread.
 *
 * The file-backed store persists evidence under a thread artifacts
 * directory so it survives restarts and can be inspected offline.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AutomationEvidence,
  AutomationEvidenceBatch
} from './playwright-sidecar.js'

export type EvidenceEntry = AutomationEvidence & {
  storedAt: string
}

export interface AutomationEvidenceStore {
  /** Record a batch of evidence events. */
  ingest(batch: AutomationEvidenceBatch): void
  /** Get all evidence entries for a thread, newest first. */
  forThread(threadId: string): EvidenceEntry[]
  /** Drop all evidence for a given thread. */
  clearThread(threadId: string): void
  /** Total count across all threads. */
  readonly count: number
}

export type FileEvidenceStoreOptions = {
  /** Root directory for thread artifact storage. */
  artifactsRoot: string
  maxPerThread?: number
}

/**
 * File-backed evidence store. Each entry is written as a JSON file under
 * `artifactsRoot/<threadId>/ev_<id>.json`. The store can be reconstructed
 * from disk after a restart by creating a new instance with the same root.
 */
export class FileAutomationEvidenceStore
  implements AutomationEvidenceStore
{
  private readonly artifactsRoot: string
  private readonly maxPerThread: number
  private readonly byThread = new Map<string, EvidenceEntry[]>()
  private initialized = false

  constructor(options: FileEvidenceStoreOptions) {
    this.artifactsRoot = options.artifactsRoot
    this.maxPerThread = Math.max(1, Math.floor(options.maxPerThread ?? 200))
  }

  /** Scan disk and load evidence. Call once after construction. */
  loadFromDisk(): void {
    if (this.initialized) return
    if (!existsSync(this.artifactsRoot)) {
      mkdirSync(this.artifactsRoot, { recursive: true })
      this.initialized = true
      return
    }

    const threadDirs = readdirSync(this.artifactsRoot, { withFileTypes: true })
    for (const dirent of threadDirs) {
      if (!dirent.isDirectory()) continue
      const threadDir = join(this.artifactsRoot, dirent.name)
      const files = readdirSync(threadDir)
        .filter((f) => f.startsWith('ev_') && f.endsWith('.json'))
        .sort()
        .reverse() // newest first by filename (ISO timestamps sort lexicographically)

      const entries: EvidenceEntry[] = []
      for (const file of files.slice(0, this.maxPerThread)) {
        try {
          const raw = readFileSync(join(threadDir, file), 'utf-8')
          const entry = JSON.parse(raw) as EvidenceEntry
          entries.push(entry)
        } catch {
          // Corrupt entry — skip.
        }
      }

      if (entries.length > 0) {
        this.byThread.set(dirent.name, entries)
      }
    }

    this.initialized = true
  }

  private ensureInit(): void {
    if (!this.initialized) this.loadFromDisk()
  }

  ingest(batch: AutomationEvidenceBatch): void {
    this.ensureInit()
    const stored = this.nowIso()

    // Write each entry to disk.
    const threadDir = join(this.artifactsRoot, batch.threadId)
    if (!existsSync(threadDir)) {
      mkdirSync(threadDir, { recursive: true })
    }

    const entries: EvidenceEntry[] = []
    for (const ev of batch.events) {
      const entry: EvidenceEntry = { ...ev, storedAt: stored }
      entries.push(entry)
      try {
        writeFileSync(
          join(threadDir, `ev_${entry.id}.json`),
          JSON.stringify(entry, null, 2),
          'utf-8'
        )
      } catch {
        // Disk write failure — store in memory anyway.
      }
    }

    // Newest first in memory.
    entries.reverse()

    let existing = this.byThread.get(batch.threadId) ?? []
    existing = [...entries, ...existing].slice(0, this.maxPerThread)
    this.byThread.set(batch.threadId, existing)

    // Prune excess disk files beyond maxPerThread.
    this.pruneDiskFiles(batch.threadId)
  }

  forThread(threadId: string): EvidenceEntry[] {
    this.ensureInit()
    return this.byThread.get(threadId) ?? []
  }

  clearThread(threadId: string): void {
    this.ensureInit()
    this.byThread.delete(threadId)
    const threadDir = join(this.artifactsRoot, threadId)
    if (existsSync(threadDir)) {
      try {
        rmSync(threadDir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  get count(): number {
    this.ensureInit()
    let total = 0
    for (const entries of this.byThread.values()) {
      total += entries.length
    }
    return total
  }

  /** Return the directory path for a thread. */
  threadDir(threadId: string): string {
    return join(this.artifactsRoot, threadId)
  }

  private pruneDiskFiles(threadId: string): void {
    const threadDir = join(this.artifactsRoot, threadId)
    if (!existsSync(threadDir)) return

    try {
      const files = readdirSync(threadDir)
        .filter((f) => f.startsWith('ev_') && f.endsWith('.json'))
        .sort()
        .reverse()

      // Remove files beyond maxPerThread.
      for (const file of files.slice(this.maxPerThread)) {
        try {
          rmSync(join(threadDir, file), { force: true })
        } catch {
          // Best-effort.
        }
      }
    } catch {
      // Best-effort.
    }
  }

  private nowIso(): string {
    return new Date().toISOString()
  }
}

export class InMemoryAutomationEvidenceStore
  implements AutomationEvidenceStore
{
  private readonly byThread = new Map<string, EvidenceEntry[]>()
  private readonly maxPerThread: number

  constructor(maxPerThread = 200) {
    this.maxPerThread = Math.max(1, Math.floor(maxPerThread))
  }

  ingest(batch: AutomationEvidenceBatch): void {
    const stored = this.nowIso()
    // Newest first: reverse batch events before prepending.
    const entries: EvidenceEntry[] = [...batch.events]
      .reverse()
      .map((ev) => ({ ...ev, storedAt: stored }))
    let existing = this.byThread.get(batch.threadId) ?? []
    existing = [...entries, ...existing].slice(0, this.maxPerThread)
    this.byThread.set(batch.threadId, existing)
  }

  forThread(threadId: string): EvidenceEntry[] {
    return this.byThread.get(threadId) ?? []
  }

  clearThread(threadId: string): void {
    this.byThread.delete(threadId)
  }

  get count(): number {
    let total = 0
    for (const entries of this.byThread.values()) {
      total += entries.length
    }
    return total
  }

  private nowIso(): string {
    return new Date().toISOString()
  }
}
