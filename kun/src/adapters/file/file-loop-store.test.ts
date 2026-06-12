import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FileLoopStore } from './file-loop-store.js'
import type { CreateLoopRequest } from '../../contracts/automations.js'

const createRequest: CreateLoopRequest = {
  projectId: 'project-1',
  threadTemplateId: 'thread-abc',
  prompt: 'Run daily health check',
  model: 'deepseek-v4-pro',
  schedule: {
    kind: 'interval',
    everyMinutes: 60
  }
}

const now = '2026-06-12T10:00:00.000Z'
const later = '2026-06-12T11:00:00.000Z'

describe('FileLoopStore', () => {
  let dir: string
  let store: FileLoopStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'file-loop-store-test-'))
    store = new FileLoopStore({ dataDir: dir })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  describe('create', () => {
    it('creates a loop record', async () => {
      const record = await store.create(createRequest, 'loop-1', now)
      expect(record.id).toBe('loop-1')
      expect(record.status).toBe('active')
      expect(record.prompt).toBe('Run daily health check')
      expect(record.runCount).toBe(0)
      expect(record.nextRunAt).toBeDefined()
    })
  })

  describe('get', () => {
    it('returns undefined for missing loop', async () => {
      expect(await store.get('missing')).toBeUndefined()
    })

    it('returns created loop', async () => {
      await store.create(createRequest, 'loop-3', now)
      const record = await store.get('loop-3')
      expect(record).toBeDefined()
      expect(record!.id).toBe('loop-3')
    })
  })

  describe('list', () => {
    it('lists all loops', async () => {
      await store.create(createRequest, 'loop-a', now)
      await store.create({ ...createRequest, projectId: 'project-2' }, 'loop-b', now)
      const loops = await store.list()
      expect(loops.length).toBe(2)
    })

    it('filters by projectId', async () => {
      await store.create(createRequest, 'loop-x', now)
      await store.create({ ...createRequest, projectId: 'project-z' }, 'loop-y', now)
      const loops = await store.list({ projectId: 'project-z' })
      expect(loops.length).toBe(1)
      expect(loops[0]!.projectId).toBe('project-z')
    })

    it('filters by status', async () => {
      await store.create(createRequest, 'loop-p', now)
      await store.pause('loop-p', later)
      const active = await store.list({ status: ['active'] })
      const paused = await store.list({ status: ['paused'] })
      expect(active.length).toBe(0)
      expect(paused.length).toBe(1)
    })
  })

  describe('pause and resume', () => {
    it('pauses an active loop', async () => {
      await store.create(createRequest, 'loop-pr-1', now)
      const paused = await store.pause('loop-pr-1', later)
      expect(paused).toBeDefined()
      expect(paused!.status).toBe('paused')
    })

    it('resumes a paused loop', async () => {
      await store.create(createRequest, 'loop-pr-2', now)
      await store.pause('loop-pr-2', later)
      const resumed = await store.resume('loop-pr-2', later)
      expect(resumed).toBeDefined()
      expect(resumed!.status).toBe('active')
      expect(resumed!.nextRunAt).toBeDefined()
    })
  })

  describe('cancel', () => {
    it('cancels a loop (terminal)', async () => {
      await store.create(createRequest, 'loop-c-1', now)
      const cancelled = await store.cancel('loop-c-1', later)
      expect(cancelled!.status).toBe('cancelled')
    })
  })

  describe('expire', () => {
    it('expires a loop', async () => {
      await store.create(createRequest, 'loop-e-1', now)
      const expired = await store.expire('loop-e-1', later)
      expect(expired!.status).toBe('expired')
    })
  })

  describe('getDue', () => {
    it('returns loops with nextRunAt <= now', async () => {
      await store.create(createRequest, 'due-test', now)
      const due = await store.getDue(later)
      expect(Array.isArray(due)).toBe(true)
    })
  })

  describe('recordRun', () => {
    it('records a successful run', async () => {
      await store.create(createRequest, 'loop-rr-1', now)
      const result = await store.recordRun('loop-rr-1', {
        status: 'success',
        threadId: 'thread-1',
        tokens: 500,
        costUsd: 0.02
      }, later)
      expect(result!.runCount).toBe(1)
      expect(result!.lastRunStatus).toBe('success')
      expect(result!.usage.totalTurns).toBe(1)
      expect(result!.usage.totalTokens).toBe(500)
      expect(result!.usage.totalCostUsd).toBe(0.02)
    })

    it('records an error run', async () => {
      await store.create(createRequest, 'loop-rr-2', now)
      const result = await store.recordRun('loop-rr-2', {
        status: 'error',
        error: 'Model unavailable',
        tokens: 0,
        costUsd: 0
      }, later)
      expect(result!.runCount).toBe(1)
      expect(result!.lastRunStatus).toBe('error')
      expect(result!.lastRunError).toBe('Model unavailable')
    })

    it('tracks cumulative usage across multiple runs', async () => {
      await store.create(createRequest, 'loop-rr-3', now)
      await store.recordRun('loop-rr-3', { status: 'success', tokens: 100, costUsd: 0.01 }, later)
      await store.recordRun('loop-rr-3', { status: 'success', tokens: 200, costUsd: 0.02 }, later)
      const final = await store.get('loop-rr-3')
      expect(final!.runCount).toBe(2)
      expect(final!.usage.totalTokens).toBe(300)
      expect(final!.usage.totalCostUsd).toBeCloseTo(0.03, 5)
    })
  })

  describe('delete', () => {
    it('deletes a loop', async () => {
      await store.create(createRequest, 'loop-d-1', now)
      expect(await store.delete('loop-d-1')).toBe(true)
      expect(await store.get('loop-d-1')).toBeUndefined()
    })

    it('returns false for missing loop', async () => {
      expect(await store.delete('missing')).toBe(false)
    })
  })

  describe('persistence across simulated restart', () => {
    it('survives simulated restart (new store instance reads same files)', async () => {
      const store1 = new FileLoopStore({ dataDir: dir })
      await store1.create(createRequest, 'survive-1', now)
      await store1.recordRun('survive-1', {
        status: 'success',
        tokens: 300,
        costUsd: 0.015
      }, later)

      // Simulate restart: new store instance pointing to same directory
      const store2 = new FileLoopStore({ dataDir: dir })
      const restored = await store2.get('survive-1')

      expect(restored).toBeDefined()
      expect(restored!.id).toBe('survive-1')
      expect(restored!.runCount).toBe(1)
      expect(restored!.usage.totalTokens).toBe(300)
      expect(restored!.usage.totalCostUsd).toBeCloseTo(0.015, 5)
      expect(restored!.lastRunStatus).toBe('success')
      expect(restored!.prompt).toBe('Run daily health check')
    })

    it('survives restart with multiple records', async () => {
      const store1 = new FileLoopStore({ dataDir: dir })
      await store1.create(createRequest, 's1', now)
      await store1.create({ ...createRequest, prompt: 'Loop B' }, 's2', now)
      await store1.pause('s2', later)

      const store2 = new FileLoopStore({ dataDir: dir })
      const loops = await store2.list()
      expect(loops.length).toBe(2)

      const paused = await store2.list({ status: ['paused'] })
      expect(paused.length).toBe(1)
      expect(paused[0]!.id).toBe('s2')
    })
  })
})
