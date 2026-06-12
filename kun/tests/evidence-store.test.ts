import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  FileAutomationEvidenceStore,
  InMemoryAutomationEvidenceStore
} from '../src/automation/evidence-store.js'
import type {
  AutomationEvidenceBatch
} from '../src/automation/playwright-sidecar.js'

describe('InMemoryAutomationEvidenceStore', () => {
  it('stores and retrieves evidence per thread', () => {
    const store = new InMemoryAutomationEvidenceStore(100)

    const batch: AutomationEvidenceBatch = {
      threadId: 'thr_1',
      events: [
        {
          id: 'ev_1',
          threadId: 'thr_1',
          runId: 'run_1',
          kind: 'screenshot',
          timestamp: '2026-06-12T00:00:00.000Z',
          screenshotBase64: 'abc123',
          screenshotUrl: 'http://localhost:3000'
        },
        {
          id: 'ev_2',
          threadId: 'thr_1',
          runId: 'run_1',
          kind: 'console',
          timestamp: '2026-06-12T00:00:01.000Z',
          consoleEntries: [
            { type: 'log', text: 'hello', timestamp: '2026-06-12T00:00:01.000Z' }
          ]
        }
      ]
    }

    store.ingest(batch)

    const threadEvidence = store.forThread('thr_1')
    expect(threadEvidence).toHaveLength(2)
    // Newest first — console entry (ev_2) should be first.
    expect(threadEvidence[0].id).toBe('ev_2')
    expect(threadEvidence[1].id).toBe('ev_1')
  })

  it('returns empty array for unknown thread', () => {
    const store = new InMemoryAutomationEvidenceStore()
    expect(store.forThread('nonexistent')).toEqual([])
  })

  it('caps entries per thread', () => {
    const store = new InMemoryAutomationEvidenceStore(3)

    for (let i = 0; i < 5; i++) {
      store.ingest({
        threadId: 'thr_1',
        events: [
          {
            id: `ev_${i}`,
            threadId: 'thr_1',
            runId: 'run_1',
            kind: 'screenshot',
            timestamp: `2026-06-12T00:00:0${i}.000Z`,
            screenshotBase64: `img${i}`
          }
        ]
      })
    }

    const entries = store.forThread('thr_1')
    expect(entries).toHaveLength(3)
    // Newest first.
    expect(entries[0].id).toBe('ev_4')
    expect(entries[2].id).toBe('ev_2')
  })

  it('clears evidence for a thread', () => {
    const store = new InMemoryAutomationEvidenceStore()

    store.ingest({
      threadId: 'thr_1',
      events: [
        {
          id: 'ev_1',
          threadId: 'thr_1',
          runId: 'run_1',
          kind: 'network',
          timestamp: '2026-06-12T00:00:00.000Z',
          networkEntries: [
            { method: 'GET', url: 'http://localhost:3000/api', status: 200, timestamp: '2026-06-12T00:00:00.000Z' }
          ]
        }
      ]
    })

    expect(store.forThread('thr_1')).toHaveLength(1)
    store.clearThread('thr_1')
    expect(store.forThread('thr_1')).toEqual([])
  })

  it('tracks count across threads', () => {
    const store = new InMemoryAutomationEvidenceStore()

    store.ingest({
      threadId: 'thr_1',
      events: [
        {
          id: 'ev_1',
          threadId: 'thr_1',
          runId: 'run_1',
          kind: 'screenshot',
          timestamp: '2026-06-12T00:00:00.000Z'
        }
      ]
    })
    store.ingest({
      threadId: 'thr_2',
      events: [
        {
          id: 'ev_2',
          threadId: 'thr_2',
          runId: 'run_2',
          kind: 'screenshot',
          timestamp: '2026-06-12T00:00:01.000Z'
        }
      ]
    })

    expect(store.count).toBe(2)
    store.clearThread('thr_1')
    expect(store.count).toBe(1)
  })
})

describe('FileAutomationEvidenceStore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kun-evidence-test-'))
  })

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // cleanup best-effort
    }
  })

  function makeEvidence(id: string, threadId: string, runId: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      threadId,
      runId,
      kind: 'screenshot' as const,
      timestamp: '2026-06-12T00:00:00.000Z',
      screenshotBase64: 'abc123',
      screenshotUrl: 'http://localhost:3000',
      ...overrides
    }
  }

  it('writes evidence to disk and reads it back', () => {
    const store = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })
    store.ingest({
      threadId: 'thr_a',
      events: [makeEvidence('ev_1', 'thr_a', 'run_1')]
    })

    // Disk file should exist.
    const threadDir = join(tmpDir, 'thr_a')
    expect(existsSync(threadDir)).toBe(true)
    const files = require('fs').readdirSync(threadDir).filter((f: string) => f.startsWith('ev_') && f.endsWith('.json'))
    expect(files.length).toBe(1)

    // Read back.
    const entries = store.forThread('thr_a')
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('ev_1')
    expect(entries[0].storedAt).toBeTruthy()
  })

  it('survives a simulated restart (new store instance from same root)', () => {
    // Write evidence with first instance.
    const store1 = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })
    store1.ingest({
      threadId: 'thr_b',
      events: [
        makeEvidence('ev_a', 'thr_b', 'run_1', { kind: 'screenshot', screenshotBase64: 'img_data_a' }),
        makeEvidence('ev_b', 'thr_b', 'run_1', { kind: 'console', screenshotBase64: undefined,
          consoleEntries: [{ type: 'log', text: 'hello', timestamp: '2026-06-12T00:00:00.000Z' }]
        })
      ]
    })

    // Simulate restart: create a new store instance pointing at the same root.
    const store2 = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })
    store2.loadFromDisk()

    const entries = store2.forThread('thr_b')
    expect(entries).toHaveLength(2)
    // Newest first, so ev_b then ev_a.
    expect(entries[0].id).toBe('ev_b')
    expect(entries[0].kind).toBe('console')
    expect(entries[1].id).toBe('ev_a')
    expect(entries[1].kind).toBe('screenshot')
    expect(entries[1].screenshotBase64).toBe('img_data_a')
  })

  it('caps entries per thread on disk and in memory', () => {
    const store = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir, maxPerThread: 3 })

    for (let i = 0; i < 5; i++) {
      store.ingest({
        threadId: 'thr_c',
        events: [makeEvidence(`ev_${i}`, 'thr_c', 'run_1', { screenshotBase64: `img${i}` })]
      })
    }

    const entries = store.forThread('thr_c')
    expect(entries).toHaveLength(3)
    expect(entries[0].id).toBe('ev_4')

    // Disk should have at most 3 files.
    const threadDir = join(tmpDir, 'thr_c')
    const files = require('fs').readdirSync(threadDir).filter((f: string) => f.startsWith('ev_') && f.endsWith('.json'))
    expect(files.length).toBeLessThanOrEqual(3)
  })

  it('clears thread evidence from disk and memory', () => {
    const store = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })
    store.ingest({
      threadId: 'thr_d',
      events: [makeEvidence('ev_x', 'thr_d', 'run_1')]
    })

    expect(store.forThread('thr_d')).toHaveLength(1)
    expect(existsSync(join(tmpDir, 'thr_d'))).toBe(true)

    store.clearThread('thr_d')

    expect(store.forThread('thr_d')).toEqual([])
    expect(existsSync(join(tmpDir, 'thr_d'))).toBe(false)
  })

  it('tracks count across threads with disk persistence', () => {
    const store = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })

    store.ingest({
      threadId: 'thr_x',
      events: [makeEvidence('ev_1', 'thr_x', 'run_1')]
    })
    store.ingest({
      threadId: 'thr_y',
      events: [makeEvidence('ev_2', 'thr_y', 'run_2')]
    })

    expect(store.count).toBe(2)

    // Simulate restart.
    const store2 = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })
    store2.loadFromDisk()
    expect(store2.count).toBe(2)
  })

  it('loadFromDisk is idempotent', () => {
    const store = new FileAutomationEvidenceStore({ artifactsRoot: tmpDir })
    store.ingest({
      threadId: 'thr_e',
      events: [makeEvidence('ev_z', 'thr_e', 'run_1')]
    })

    store.loadFromDisk() // no-op, already initialized
    expect(store.forThread('thr_e')).toHaveLength(1)

    store.loadFromDisk() // still no-op
    expect(store.forThread('thr_e')).toHaveLength(1)
  })
})
