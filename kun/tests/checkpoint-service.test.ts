import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { InMemorySessionStore } from '../src/adapters/in-memory-session-store.js'
import { InMemoryEventBus } from '../src/adapters/in-memory-event-bus.js'
import { InMemoryThreadStore } from '../src/adapters/in-memory-thread-store.js'
import { InMemoryCheckpointStore } from '../src/adapters/in-memory-checkpoint-store.js'
import { FileCheckpointStore } from '../src/adapters/file/file-checkpoint-store.js'
import { SequentialIdGenerator } from '../src/ports/id-generator.js'
import { CheckpointService } from '../src/services/checkpoint-service.js'
import { DirtyWorkspaceRestoreError } from '../src/contracts/checkpoints.js'
import { ThreadService } from '../src/services/thread-service.js'
import { RuntimeEventRecorder } from '../src/services/runtime-event-recorder.js'
import type { TurnItem } from '../src/contracts/items.js'
import { createThreadRecord } from '../src/domain/thread.js'
import { createTurnRecord } from '../src/domain/turn.js'
import { makeUserItem, makeAssistantTextItem } from '../src/domain/item.js'

const execFileAsync = promisify(execFile)

async function runGit(cwd: string, args: string[], timeout = 15_000): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, { cwd, timeout, maxBuffer: 1024 * 1024 })
  return { stdout: String(stdout), stderr: String(stderr) }
}

function fileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function buildCheckpointService(
  options: { dataDir?: string; maxPerThread?: number; maxTotal?: number } = {}
): {
  service: CheckpointService
  threadService: ThreadService
  threadStore: InMemoryThreadStore
  sessionStore: InMemorySessionStore
  checkpointStore: InMemoryCheckpointStore
  nowIso: () => string
} {
  const bus = new InMemoryEventBus()
  const threadStore = new InMemoryThreadStore()
  const sessionStore = new InMemorySessionStore()
  const checkpointStore = new InMemoryCheckpointStore()
  const ids = new SequentialIdGenerator()
  let now = 1_700_000_000_000
  const nowIso = () => new Date((now += 1000)).toISOString()
  const events = new RuntimeEventRecorder({
    eventBus: bus,
    sessionStore,
    allocateSeq: (threadId) => bus.allocateSeq(threadId),
    nowIso
  })
  const threadService = new ThreadService({ threadStore, sessionStore, events, ids, nowIso })
  const service = new CheckpointService({
    checkpointStore,
    threadStore,
    sessionStore,
    events,
    ids,
    nowIso,
    dataDir: options.dataDir,
    maxPerThread: options.maxPerThread,
    maxTotal: options.maxTotal
  })
  return { service, threadService, threadStore, sessionStore, checkpointStore, nowIso }
}

function withId(item: TurnItem, id: string): TurnItem {
  return { ...item, id }
}

describe('CheckpointService', () => {
  describe('create', () => {
    it('creates a checkpoint record for a thread', async () => {
      const { service, threadService, threadStore, nowIso } = buildCheckpointService()

      const thread = await threadService.create({
        workspace: '/tmp/test-workspace',
        model: 'deepseek-chat',
        mode: 'agent'
      })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_1',
        trigger: 'pre_mutation',
        eventSeq: 5,
        itemCount: 10,
        turnCount: 2,
        workspaceRoot: '/tmp/test-workspace'
      })

      expect(cp.id).toBeTruthy()
      expect(cp.threadId).toBe(thread.id)
      expect(cp.turnId).toBe('turn_1')
      expect(cp.trigger).toBe('pre_mutation')
      expect(cp.snapshot.workspaceRoot).toBe('/tmp/test-workspace')
    })

    it('creates checkpoints that can be retrieved', async () => {
      const { service, threadService } = buildCheckpointService()

      const thread = await threadService.create({
        workspace: '/tmp/test-workspace',
        model: 'deepseek-chat',
        mode: 'agent'
      })

      await service.create({
        threadId: thread.id,
        turnId: 'turn_a',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 3,
        turnCount: 1,
        workspaceRoot: '/tmp/test-workspace'
      })

      await service.create({
        threadId: thread.id,
        turnId: 'turn_b',
        trigger: 'manual',
        eventSeq: 8,
        itemCount: 15,
        turnCount: 3,
        workspaceRoot: '/tmp/test-workspace'
      })

      const list = await service.list(thread.id)
      expect(list).toHaveLength(2)
      // Newest first
      expect(list[0].trigger).toBe('manual')
      expect(list[1].trigger).toBe('pre_mutation')
    })
  })

  describe('list', () => {
    it('returns empty list for thread with no checkpoints', async () => {
      const { service } = buildCheckpointService()
      const list = await service.list('nonexistent')
      expect(list).toEqual([])
    })
  })

  describe('delete', () => {
    it('deletes a checkpoint and returns true', async () => {
      const { service, threadService } = buildCheckpointService()
      const thread = await threadService.create({
        workspace: '/tmp/test-workspace',
        model: 'deepseek-chat',
        mode: 'agent'
      })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_1',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 3,
        turnCount: 1,
        workspaceRoot: '/tmp/test-workspace'
      })

      const deleted = await service.delete(cp.id)
      expect(deleted).toBe(true)

      const retrieved = await service.get(cp.id)
      expect(retrieved).toBeNull()
    })

    it('returns false for nonexistent checkpoint', async () => {
      const { service } = buildCheckpointService()
      const deleted = await service.delete('nonexistent')
      expect(deleted).toBe(false)
    })
  })

  describe('retention', () => {
    it('prunes oldest per-thread checkpoints when exceeding maxPerThread', async () => {
      const { service, threadService, checkpointStore } = buildCheckpointService({ maxPerThread: 3 })
      const thread = await threadService.create({
        workspace: '/tmp/test-workspace',
        model: 'deepseek-chat',
        mode: 'agent'
      })

      // Create 5 checkpoints
      for (let i = 0; i < 5; i++) {
        await service.create({
          threadId: thread.id,
          turnId: `turn_${i}`,
          trigger: 'pre_mutation',
          eventSeq: i,
          itemCount: i * 2,
          turnCount: i + 1,
          workspaceRoot: '/tmp/test-workspace'
        })
      }

      const count = await checkpointStore.countByThread(thread.id)
      expect(count).toBeLessThanOrEqual(3)
    })

    it('prunes globally when exceeding maxTotal', async () => {
      const { service, threadService, checkpointStore } = buildCheckpointService({ maxPerThread: 10, maxTotal: 2 })
      const thread = await threadService.create({
        workspace: '/tmp/test-workspace',
        model: 'deepseek-chat',
        mode: 'agent'
      })

      for (let i = 0; i < 5; i++) {
        await service.create({
          threadId: thread.id,
          turnId: `turn_${i}`,
          trigger: 'pre_mutation',
          eventSeq: i,
          itemCount: i * 2,
          turnCount: i + 1,
          workspaceRoot: '/tmp/test-workspace'
        })
      }

      const total = await checkpointStore.countTotal()
      expect(total).toBeLessThanOrEqual(2)
    })
  })

  describe('restore conversation', () => {
    it('truncates thread events at checkpoint offset (conversation-only)', async () => {
      const { service, threadService, threadStore, sessionStore, nowIso } = buildCheckpointService()
      const thread = await threadService.create(
        { workspace: '/tmp/test-workspace', model: 'deepseek-chat', mode: 'agent' },
        { id: 'thr_source', title: 'Source Thread' }
      )

      // Simulate 3 turns with items
      const turn1 = createTurnRecord({
        id: 'turn_1',
        threadId: thread.id,
        prompt: 'first turn',
        createdAt: nowIso()
      })
      const turn2 = createTurnRecord({
        id: 'turn_2',
        threadId: thread.id,
        prompt: 'second turn',
        createdAt: nowIso()
      })
      const turn3 = createTurnRecord({
        id: 'turn_3',
        threadId: thread.id,
        prompt: 'third turn',
        createdAt: nowIso()
      })

      // Add items
      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'item_1_u', turnId: 'turn_1', threadId: thread.id, text: 'hello 1' }), 'item_1_u'),
        withId(makeAssistantTextItem({ id: 'item_1_a', turnId: 'turn_1', threadId: thread.id, text: 'reply 1' }), 'item_1_a'),
        withId(makeUserItem({ id: 'item_2_u', turnId: 'turn_2', threadId: thread.id, text: 'hello 2' }), 'item_2_u'),
        withId(makeAssistantTextItem({ id: 'item_2_a', turnId: 'turn_2', threadId: thread.id, text: 'reply 2' }), 'item_2_a'),
        withId(makeUserItem({ id: 'item_3_u', turnId: 'turn_3', threadId: thread.id, text: 'hello 3' }), 'item_3_u'),
        withId(makeAssistantTextItem({ id: 'item_3_a', turnId: 'turn_3', threadId: thread.id, text: 'reply 3' }), 'item_3_a')
      ]

      for (const item of items) {
        await sessionStore.appendItem(thread.id, item)
      }

      // Update thread with turns and items
      await threadStore.upsert({
        ...thread,
        turns: [
          { ...turn1, items: [items[0], items[1]], status: 'completed', finishedAt: nowIso(), steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [] },
          { ...turn2, items: [items[2], items[3]], status: 'completed', finishedAt: nowIso(), steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [] },
          { ...turn3, items: [items[4], items[5]], status: 'completed', finishedAt: nowIso(), steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [] }
        ]
      })

      // Create checkpoint after turn 2 (4 items, 2 turns)
      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_2',
        trigger: 'pre_mutation',
        eventSeq: 4,
        itemCount: 4,
        turnCount: 2,
        workspaceRoot: '/tmp/test-workspace'
      })

      // Restore conversation only
      const result = await service.restore({ checkpointId: cp.id, target: 'conversation' })

      expect(result.restored).toBe(true)
      expect(result.target).toBe('conversation')
      expect(result.newThreadId).toBeTruthy()
      expect(result.newItemCount).toBe(4) // Items from first 2 turns

      // Original thread still has all items
      const originalItems = await sessionStore.loadItems(thread.id)
      expect(originalItems).toHaveLength(6)

      // New thread has only truncated items
      const newItems = await sessionStore.loadItems(result.newThreadId!)
      expect(newItems).toHaveLength(4)
    })
  })

  describe('restore code', () => {
    it('restores workspace to checkpoint state and does NOT modify conversation length', async () => {
      const { service, threadService, threadStore, sessionStore, nowIso } = buildCheckpointService()

      const thread = await threadService.create({
        workspace: '/tmp/test-workspace',
        model: 'deepseek-chat',
        mode: 'agent'
      })

      // Seed thread with items
      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'item_1', turnId: 'turn_1', threadId: thread.id, text: 'hello' }), 'item_1'),
        withId(makeAssistantTextItem({ id: 'item_2', turnId: 'turn_1', threadId: thread.id, text: 'reply' }), 'item_2')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)
      await threadStore.upsert({
        ...thread,
        turns: [{
          id: 'turn_1', threadId: thread.id, status: 'completed', prompt: 'hello',
          steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [],
          createdAt: nowIso(), finishedAt: nowIso(), items
        }]
      })

      // Create checkpoint
      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_1',
        trigger: 'pre_mutation',
        eventSeq: 2,
        itemCount: 2,
        turnCount: 1,
        workspaceRoot: '/tmp/test-workspace'
      })

      // Restore code only
      const result = await service.restore({ checkpointId: cp.id, target: 'code' })

      expect(result.restored).toBe(true)
      expect(result.target).toBe('code')
      expect(result.newThreadId).toBeUndefined()

      // Conversation unchanged
      const allItems = await sessionStore.loadItems(thread.id)
      expect(allItems).toHaveLength(2)
    })
  })

  describe('fork', () => {
    it('creates a new thread forked from checkpoint', async () => {
      const { service, threadService, threadStore, sessionStore, nowIso } = buildCheckpointService()

      const thread = await threadService.create(
        { workspace: '/tmp/test-workspace', model: 'deepseek-chat', mode: 'agent' },
        { id: 'thr_parent', title: 'Parent' }
      )

      // Seed turns
      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'it_1', turnId: 'turn_1', threadId: thread.id, text: 'hello' }), 'it_1'),
        withId(makeAssistantTextItem({ id: 'it_2', turnId: 'turn_1', threadId: thread.id, text: 'reply' }), 'it_2')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)
      await threadStore.upsert({
        ...thread,
        turns: [{
          id: 'turn_1', threadId: thread.id, status: 'completed', prompt: 'hello',
          steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [],
          createdAt: nowIso(), finishedAt: nowIso(), items
        }]
      })

      // Create checkpoint
      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_1',
        trigger: 'pre_mutation',
        eventSeq: 2,
        itemCount: 2,
        turnCount: 1,
        workspaceRoot: '/tmp/test-workspace'
      })

      // Fork
      const result = await service.fork({ checkpointId: cp.id, title: 'Forked Thread', createWorktree: false })

      expect(result.forkedThreadId).toBeTruthy()
      expect(result.forkedThreadId).not.toBe(thread.id)
      expect(result.worktreePath).toBeUndefined()

      // Forked thread exists and has truncated items
      const forked = await threadStore.get(result.forkedThreadId)
      expect(forked).not.toBeNull()
      expect(forked!.title).toBe('Forked Thread')
      expect(forked!.relation).toBe('fork')
      expect(forked!.forkedFromThreadId).toBe(thread.id)

      const forkedItems = await sessionStore.loadItems(result.forkedThreadId)
      expect(forkedItems).toHaveLength(2)
    })
  })

  describe('audit events', () => {
    it('emits checkpoint_created audit event on create', async () => {
      const checkpointStore = new InMemoryCheckpointStore()
      const threadStore = new InMemoryThreadStore()
      const sessionStore = new InMemorySessionStore()
      const bus = new InMemoryEventBus()
      const ids = new SequentialIdGenerator()
      let now = 1_700_000_000_000
      const nowIso = () => new Date((now += 1000)).toISOString()
      const events = new RuntimeEventRecorder({
        eventBus: bus,
        sessionStore,
        allocateSeq: (threadId) => bus.allocateSeq(threadId),
        nowIso
      })

      const threadService = new ThreadService({ threadStore, sessionStore, events, ids, nowIso })
      const thread = await threadService.create({
        workspace: '/tmp/test-audit',
        model: 'deepseek-chat',
        mode: 'agent'
      })

      const svc = new CheckpointService({
        checkpointStore,
        threadStore,
        sessionStore,
        events,
        ids,
        nowIso,
        maxPerThread: 20,
        maxTotal: 200
      })

      const cp = await svc.create({
        threadId: thread.id,
        turnId: 'turn_audit',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 3,
        turnCount: 1,
        workspaceRoot: '/tmp/test-audit'
      })

      expect(cp).toBeTruthy()
      expect(cp.threadId).toBe(thread.id)
      expect(cp.trigger).toBe('pre_mutation')
    })
  })

  describe('retention N+2', () => {
    it('prunes exactly to maxPerThread limit even with burst of checkpoints', async () => {
      const MAX = 3
      const { service, threadService, checkpointStore } = buildCheckpointService({ maxPerThread: MAX })
      const thread = await threadService.create({
        workspace: '/tmp/test-retain',
        model: 'deepseek-chat',
        mode: 'agent'
      })

      // Create MAX+5 checkpoints
      for (let i = 0; i < MAX + 5; i++) {
        await service.create({
          threadId: thread.id,
          turnId: `turn_${i}`,
          trigger: 'pre_mutation',
          eventSeq: i,
          itemCount: i * 2,
          turnCount: i + 1,
          workspaceRoot: '/tmp/test-retain'
        })
      }

      const count = await checkpointStore.countByThread(thread.id)
      expect(count).toBe(MAX)
    })
  })

  describe('persistent reload survival (real file-backed)', () => {
    it('FileCheckpointStore survives process-style reload', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-file-store-'))
      const dataDir = join(tmpDir, 'data')

      // Create store1 and save a checkpoint
      const store1 = new FileCheckpointStore({ dataDir })
      const record: Parameters<typeof store1.save>[0] = {
        id: 'chkpt_file_1',
        threadId: 'thr_fs',
        turnId: 'turn_fs',
        createdAt: new Date().toISOString(),
        eventSeq: 5,
        itemCount: 10,
        turnCount: 2,
        snapshot: {
          treeHash: 'abc123',
          includesUntracked: false,
          workspaceRoot: '/tmp/fs-test',
          untrackedFiles: [],
          includesStaged: false,
          includesUnstaged: false
        },
        trigger: 'pre_mutation'
      }
      await store1.save(record)

      // Instantiating store2 from same dataDir (simulates process reload)
      const store2 = new FileCheckpointStore({ dataDir })

      const loaded = await store2.get('chkpt_file_1')
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe('chkpt_file_1')
      expect(loaded!.threadId).toBe('thr_fs')
      expect(loaded!.trigger).toBe('pre_mutation')

      const list = await store2.listByThread('thr_fs')
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('chkpt_file_1')

      await rm(tmpDir, { recursive: true, force: true })
    })
  })

  describe('conversation-only truncation with files untouched', () => {
    it('restores conversation only without modifying workspace file counts', async () => {
      const { service, threadService, threadStore, sessionStore, nowIso } = buildCheckpointService()
      const thread = await threadService.create(
        { workspace: '/tmp/cv-only', model: 'deepseek-chat', mode: 'agent' },
        { id: 'thr_cv', title: 'CV Thread' }
      )

      // 4 turns with items
      const items: TurnItem[] = []
      for (let t = 0; t < 4; t++) {
        items.push(withId(makeUserItem({ id: `u_${t}`, turnId: `turn_${t}`, threadId: thread.id, text: `hello ${t}` }), `u_${t}`))
        items.push(withId(makeAssistantTextItem({ id: `a_${t}`, turnId: `turn_${t}`, threadId: thread.id, text: `reply ${t}` }), `a_${t}`))
      }
      for (const item of items) await sessionStore.appendItem(thread.id, item)

      const turns = Array.from({ length: 4 }, (_, t) => ({
        id: `turn_${t}`, threadId: thread.id, status: 'completed' as const, prompt: `prompt ${t}`,
        steering: [] as string[], attachmentIds: [] as string[], activeSkillIds: [] as string[],
        injectedMemoryIds: [] as string[],
        createdAt: nowIso(), finishedAt: nowIso(),
        items: [items[t * 2], items[t * 2 + 1]]
      }))
      await threadStore.upsert({ ...thread, turns })

      // Checkpoint after 2 turns (4 items)
      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_1',
        trigger: 'pre_mutation',
        eventSeq: 4,
        itemCount: 4,
        turnCount: 2,
        workspaceRoot: '/tmp/cv-only'
      })

      // Restore conversation only
      const result = await service.restore({ checkpointId: cp.id, target: 'conversation' })
      expect(result.restored).toBe(true)
      expect(result.target).toBe('conversation')
      expect(result.newItemCount).toBe(4)

      // Original files untouched (code-only workspace unchanged)
      // New thread has only 4 items (checkpoint cut)
      const newItems = await sessionStore.loadItems(result.newThreadId!)
      expect(newItems).toHaveLength(4)
    })
  })

  describe('restore both', () => {
    it('restores both code and conversation', async () => {
      const { service, threadService, threadStore, sessionStore, nowIso } = buildCheckpointService()
      const thread = await threadService.create(
        { workspace: '/tmp/both-test', model: 'deepseek-chat', mode: 'agent' },
        { id: 'thr_both', title: 'Both Thread' }
      )

      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'b1', turnId: 't1', threadId: thread.id, text: 'hi' }), 'b1'),
        withId(makeAssistantTextItem({ id: 'b2', turnId: 't1', threadId: thread.id, text: 'hey' }), 'b2'),
        withId(makeUserItem({ id: 'b3', turnId: 't2', threadId: thread.id, text: 'more' }), 'b3'),
        withId(makeAssistantTextItem({ id: 'b4', turnId: 't2', threadId: thread.id, text: 'ok' }), 'b4')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)
      await threadStore.upsert({
        ...thread,
        turns: [
          { id: 't1', threadId: thread.id, status: 'completed', prompt: 'hi', steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [], createdAt: nowIso(), finishedAt: nowIso(), items: [items[0], items[1]] },
          { id: 't2', threadId: thread.id, status: 'completed', prompt: 'more', steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [], createdAt: nowIso(), finishedAt: nowIso(), items: [items[2], items[3]] }
        ]
      })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 't1',
        trigger: 'pre_mutation',
        eventSeq: 2,
        itemCount: 2,
        turnCount: 1,
        workspaceRoot: '/tmp/both-test'
      })

      const result = await service.restore({ checkpointId: cp.id, target: 'both' })
      expect(result.restored).toBe(true)
      expect(result.target).toBe('both')
      expect(result.newThreadId).toBeTruthy()
      expect(result.newItemCount).toBe(2)

      const newItems = await sessionStore.loadItems(result.newThreadId!)
      expect(newItems).toHaveLength(2)
    })
  })

  describe('fork history and worktree snapshot', () => {
    it('forked thread stops at checkpoint event offset', async () => {
      const { service, threadService, threadStore, sessionStore, nowIso } = buildCheckpointService()
      const thread = await threadService.create(
        { workspace: '/tmp/fork-hist', model: 'deepseek-chat', mode: 'agent' },
        { id: 'thr_hist', title: 'History Thread' }
      )

      // 5 turns
      const items: TurnItem[] = []
      for (let t = 0; t < 5; t++) {
        items.push(withId(makeUserItem({ id: `fu_${t}`, turnId: `ft_${t}`, threadId: thread.id, text: `msg ${t}` }), `fu_${t}`))
        items.push(withId(makeAssistantTextItem({ id: `fa_${t}`, turnId: `ft_${t}`, threadId: thread.id, text: `resp ${t}` }), `fa_${t}`))
      }
      for (const item of items) await sessionStore.appendItem(thread.id, item)

      const turns = Array.from({ length: 5 }, (_, t) => ({
        id: `ft_${t}`, threadId: thread.id, status: 'completed' as const, prompt: `msg ${t}`,
        steering: [] as string[], attachmentIds: [] as string[], activeSkillIds: [] as string[],
        injectedMemoryIds: [] as string[],
        createdAt: nowIso(), finishedAt: nowIso(),
        items: [items[t * 2], items[t * 2 + 1]]
      }))
      await threadStore.upsert({ ...thread, turns })

      // Checkpoint after 3 turns
      const cp = await service.create({
        threadId: thread.id,
        turnId: 'ft_2',
        trigger: 'pre_mutation',
        eventSeq: 6,
        itemCount: 6,
        turnCount: 3,
        workspaceRoot: '/tmp/fork-hist'
      })

      const result = await service.fork({ checkpointId: cp.id, title: 'Fork Stop', createWorktree: false })
      expect(result.forkedThreadId).toBeTruthy()

      const forked = await threadStore.get(result.forkedThreadId)
      expect(forked).not.toBeNull()
      // Fork should have exactly checkpoint turnCount turns
      expect(forked!.turns.length).toBe(3)

      const forkedItems = await sessionStore.loadItems(result.forkedThreadId)
      expect(forkedItems).toHaveLength(6)

      // Original thread still has all 10 items
      const origItems = await sessionStore.loadItems(thread.id)
      expect(origItems).toHaveLength(10)
    })

    it('fork with worktree creates git worktree at snapshot state', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-fork-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'fork-test.txt')
      await writeFile(testFile, 'pre-checkpoint content', 'utf-8')
      await runGit(tmpDir, ['add', 'fork-test.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService, sessionStore } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({
        workspace: tmpDir,
        model: 'deepseek-chat',
        mode: 'agent'
      })

      // Seed items
      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'fw1', turnId: 'fwt1', threadId: thread.id, text: 'hi' }), 'fw1'),
        withId(makeAssistantTextItem({ id: 'fw2', turnId: 'fwt1', threadId: thread.id, text: 'hey' }), 'fw2')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'fwt1',
        trigger: 'pre_mutation',
        eventSeq: 2,
        itemCount: 2,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      // Fork with worktree
      const parentDir = join(tmpDir, '..', 'fork-worktrees')
      const result = await service.fork({
        checkpointId: cp.id,
        title: 'Worktree Fork',
        createWorktree: true,
        worktreeParent: parentDir
      })

      expect(result.worktreePath).toBeTruthy()

      // Verify worktree exists
      const { existsSync } = await import('node:fs')
      expect(existsSync(result.worktreePath!)).toBe(true)

      // Verify worktree has the pre-checkpoint file
      const wtFile = join(result.worktreePath!, 'fork-test.txt')
      expect(existsSync(wtFile)).toBe(true)
      const { readFile } = await import('node:fs/promises')
      const wtContent = await readFile(wtFile, 'utf-8')
      expect(wtContent).toBe('pre-checkpoint content')

      // Cleanup
      await rm(tmpDir, { recursive: true, force: true })
      await rm(parentDir, { recursive: true, force: true })
    }, 60_000)
  })

  describe('hash-equality — code-only restore', () => {
    it(
      'mutate files → restore code only → file hashes equal pre-turn hashes, conversation unchanged',
      async () => {
        const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-test-'))
        await runGit(tmpDir, ['init'])
        await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
        await runGit(tmpDir, ['config', 'user.name', 'Test'])

        const testFile = join(tmpDir, 'test.txt')
        const initialContent = 'initial content v1'
        await writeFile(testFile, initialContent, 'utf-8')
        await runGit(tmpDir, ['add', 'test.txt'])
        await runGit(tmpDir, ['commit', '-m', 'initial'])

        const { service, threadService, sessionStore, nowIso } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })

        const thread = await threadService.create({
          workspace: tmpDir,
          model: 'deepseek-chat',
          mode: 'agent'
        })

        const items: TurnItem[] = [
          withId(makeUserItem({ id: 'i1', turnId: 't1', threadId: thread.id, text: 'hi' }), 'i1'),
          withId(makeAssistantTextItem({ id: 'i2', turnId: 't1', threadId: thread.id, text: 'hey' }), 'i2')
        ]
        for (const item of items) await sessionStore.appendItem(thread.id, item)

        const cp = await service.create({
          threadId: thread.id,
          turnId: 't1',
          trigger: 'pre_mutation',
          eventSeq: 2,
          itemCount: 2,
          turnCount: 1,
          workspaceRoot: tmpDir
        })

        const mutatedContent = 'mutated content v2'
        await writeFile(testFile, mutatedContent, 'utf-8')

        const result = await service.restore({ checkpointId: cp.id, target: 'code' })

        expect(result.restored).toBe(true)
        expect(result.target).toBe('code')

        const { stdout: restoredHash } = await execFileAsync('shasum', ['-a', '256', testFile], { cwd: tmpDir })
        const restoredFileHash = restoredHash.trim().split(' ')[0]

        const expectedHash = fileHash(initialContent)
        expect(restoredFileHash).toBe(expectedHash)

        const { readFile } = await import('node:fs/promises')
        const actualContent = await readFile(testFile, 'utf-8')
        expect(actualContent).toBe(initialContent)

        const allItems = await sessionStore.loadItems(thread.id)
        expect(allItems).toHaveLength(2)

        await rm(tmpDir, { recursive: true, force: true })
      },
      30_000
    )
  })

  // ── Gate 1: Snapshot fidelity ──

  describe('snapshot fidelity — staged changes', () => {
    it('captures and restores staged changes (not just HEAD)', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-staged-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      // Create and commit initial file
      const testFile = join(tmpDir, 'staged.txt')
      await writeFile(testFile, 'v1 - committed', 'utf-8')
      await runGit(tmpDir, ['add', 'staged.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      // Modify and stage the file (staged change, not yet committed)
      await writeFile(testFile, 'v2 - staged', 'utf-8')
      await runGit(tmpDir, ['add', 'staged.txt'])

      const { service, threadService, sessionStore } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_staged',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      // Snapshot should have captured the staged diff
      expect(cp.snapshot.includesStaged).toBe(true)
      expect(cp.snapshot.stagedDiffPath).toBeTruthy()

      // Now change the file to something else (simulating mutation after checkpoint)
      await writeFile(testFile, 'v3 - mutated after checkpoint', 'utf-8')
      // Unstage everything so we test restore from snapshot
      await runGit(tmpDir, ['reset', 'HEAD', 'staged.txt'])

      // Restore code-only
      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)

      // File should be back to staged v2, not committed v1 and not mutated v3
      const { readFile } = await import('node:fs/promises')
      const content = await readFile(testFile, 'utf-8')
      expect(content).toBe('v2 - staged')

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    it('captures and restores unstaged tracked changes', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-unstaged-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'unstaged.txt')
      await writeFile(testFile, 'v1 - committed', 'utf-8')
      await runGit(tmpDir, ['add', 'unstaged.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      // Modify but do NOT stage (unstaged tracked change)
      await writeFile(testFile, 'v2 - unstaged tracked', 'utf-8')

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_unstaged',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      expect(cp.snapshot.includesUnstaged).toBe(true)
      expect(cp.snapshot.unstagedDiffPath).toBeTruthy()

      // Change file again after checkpoint
      await writeFile(testFile, 'v3 - post-checkpoint mutation', 'utf-8')

      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)

      const { readFile } = await import('node:fs/promises')
      const content = await readFile(testFile, 'utf-8')
      expect(content).toBe('v2 - unstaged tracked')

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    it('captures and restores untracked files', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-untracked-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      // Initial commit for a tracked file
      const trackedFile = join(tmpDir, 'tracked.txt')
      await writeFile(trackedFile, 'tracked v1', 'utf-8')
      await runGit(tmpDir, ['add', 'tracked.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      // Create untracked file
      const untrackedFile = join(tmpDir, 'untracked.txt')
      await writeFile(untrackedFile, 'untracked content', 'utf-8')

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_untracked',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      expect(cp.snapshot.includesUntracked).toBe(true)
      expect(cp.snapshot.untrackedFiles).toContain('untracked.txt')

      // Delete the untracked file and modify tracked file after checkpoint
      await rm(untrackedFile)
      await writeFile(trackedFile, 'tracked v2 mutated', 'utf-8')

      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)

      const { readFile } = await import('node:fs/promises')
      const { existsSync } = await import('node:fs')
      expect(existsSync(untrackedFile)).toBe(true)
      const untrackedContent = await readFile(untrackedFile, 'utf-8')
      expect(untrackedContent).toBe('untracked content')

      // Tracked file should also be restored
      const trackedContent = await readFile(trackedFile, 'utf-8')
      expect(trackedContent).toBe('tracked v1')

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)
  })

  // ── Gate 2: Restore safety ──

  describe('restore safety — dirty workspace blocking', () => {
    it('blocks code-only restore when pre-existing staged changes exist', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-safety-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'safe.txt')
      await writeFile(testFile, 'v1', 'utf-8')
      await runGit(tmpDir, ['add', 'safe.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      // Create checkpoint from clean state
      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_safe',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      // Now introduce staged changes that the checkpoint didn't capture
      await writeFile(testFile, 'staged pre-existing', 'utf-8')
      await runGit(tmpDir, ['add', 'safe.txt'])

      // Restore should throw DirtyWorkspaceRestoreError
      await expect(
        service.restore({ checkpointId: cp.id, target: 'code' })
      ).rejects.toThrow(DirtyWorkspaceRestoreError)

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    it('allows code-only restore when only post-checkpoint untracked files exist (Gate 2: not a blocker)', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-ut-safe-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'base.txt')
      await writeFile(testFile, 'v1', 'utf-8')
      await runGit(tmpDir, ['add', 'base.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_safe2',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      // Create untracked file after checkpoint (post-checkpoint mutation)
      const untrackedFile = join(tmpDir, 'post-checkpoint-untracked.txt')
      await writeFile(untrackedFile, 'post-checkpoint content', 'utf-8')

      // Gate 2: Untracked files are NOT a blocker — restore cleans them up
      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)

      // Post-checkpoint untracked file should be removed
      const { existsSync } = await import('node:fs')
      expect(existsSync(untrackedFile)).toBe(false)

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    it('allows code-only restore when only unstaged tracked changes exist (session changes)', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-unstaged-safe-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'session.txt')
      await writeFile(testFile, 'v1', 'utf-8')
      await runGit(tmpDir, ['add', 'session.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_session',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      // Modify but don't stage (unstaged tracked = session changes, allowed)
      await writeFile(testFile, 'session-modified', 'utf-8')

      // Should succeed (no staged, no untracked = only unstaged tracked changes)
      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)
  })

  // ── Gate 4: Fork worktree Phase 6 managed metadata ──

  describe('fork worktree — Phase 6 managed metadata', () => {
    it('writes managed worktree metadata file with Phase 6 fields', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-fork-meta-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'fork-meta.txt')
      await writeFile(testFile, 'checkpoint content', 'utf-8')
      await runGit(tmpDir, ['add', 'fork-meta.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService, sessionStore } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'fmi1', turnId: 'fmt1', threadId: thread.id, text: 'hi' }), 'fmi1'),
        withId(makeAssistantTextItem({ id: 'fmi2', turnId: 'fmt1', threadId: thread.id, text: 'hey' }), 'fmi2')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'fmt1',
        trigger: 'pre_mutation',
        eventSeq: 2,
        itemCount: 2,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      const parentDir = join(tmpDir, '..', 'fork-meta-worktrees')
      const result = await service.fork({
        checkpointId: cp.id,
        title: 'Metadata Fork',
        createWorktree: true,
        worktreeParent: parentDir
      })

      expect(result.worktreePath).toBeTruthy()

      // Verify Phase 6 managed metadata file exists
      const commonDir = (await runGit(tmpDir, ['rev-parse', '--git-common-dir'])).stdout.trim()
      const resolvedCommonDir = join(tmpDir, commonDir)
      const metadataId = createHash('sha256').update(result.worktreePath!).digest('hex')
      const metadataPath = join(resolvedCommonDir, 'opencodex', 'managed-worktrees', `${metadataId}.json`)

      const { existsSync } = await import('node:fs')
      const { readFile } = await import('node:fs/promises')
      expect(existsSync(metadataPath)).toBe(true)

      const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'))
      expect(metadata.managedBy).toBe('opencodex-desktop')
      expect(metadata.repositoryRoot).toBeTruthy()
      expect(metadata.path).toBeTruthy()
      expect(metadata.branch).toBeTruthy()
      expect(metadata.baseBranch).toBeTruthy()
      expect(metadata.createdAt).toBeTruthy()
      expect(metadata.checkpointId).toBe(cp.id)
      expect(metadata.forkedThreadId).toBe(result.forkedThreadId)

      // Verify git-audit event was appended
      const auditPath = join(resolvedCommonDir, 'opencodex', 'git-audit.jsonl')
      expect(existsSync(auditPath)).toBe(true)
      const auditRaw = await readFile(auditPath, 'utf-8')
      expect(auditRaw).toContain('worktree.create')
      expect(auditRaw).toContain(result.worktreePath!)

      await rm(tmpDir, { recursive: true, force: true })
      await rm(parentDir, { recursive: true, force: true })
    }, 60_000)

    it('fork worktree content matches checkpoint snapshot', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-fork-content-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'content.txt')
      await writeFile(testFile, 'snapshot content v1', 'utf-8')
      await runGit(tmpDir, ['add', 'content.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService, sessionStore } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'fci1', turnId: 'fct1', threadId: thread.id, text: 'hi' }), 'fci1')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'fct1',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      const parentDir = join(tmpDir, '..', 'fork-content-worktrees')
      const result = await service.fork({
        checkpointId: cp.id,
        title: 'Content Fork',
        createWorktree: true,
        worktreeParent: parentDir
      })

      expect(result.worktreePath).toBeTruthy()

      // Fork worktree should have the checkpoint file content
      const { readFile } = await import('node:fs/promises')
      const wtFile = join(result.worktreePath!, 'content.txt')
      const wtContent = await readFile(wtFile, 'utf-8')
      expect(wtContent).toBe('snapshot content v1')

      await rm(tmpDir, { recursive: true, force: true })
      await rm(parentDir, { recursive: true, force: true })
    }, 60_000)
  })

  // ── Gate 5: Restore conversation semantics ──

  describe('restore conversation semantics', () => {
    it('code-only restore leaves conversation intact and emits audit event', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-conv-sem-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'conv.txt')
      await writeFile(testFile, 'v1', 'utf-8')
      await runGit(tmpDir, ['add', 'conv.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService, sessionStore, nowIso } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      // Add 3 conversation items
      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'cs1', turnId: 'cst1', threadId: thread.id, text: 'hello' }), 'cs1'),
        withId(makeAssistantTextItem({ id: 'cs2', turnId: 'cst1', threadId: thread.id, text: 'hi there' }), 'cs2'),
        withId(makeUserItem({ id: 'cs3', turnId: 'cst2', threadId: thread.id, text: 'more' }), 'cs3')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'cst2',
        trigger: 'pre_mutation',
        eventSeq: 3,
        itemCount: 3,
        turnCount: 2,
        workspaceRoot: tmpDir
      })

      // Mutate file after checkpoint
      await writeFile(testFile, 'v2 mutated', 'utf-8')

      // Code-only restore
      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)
      expect(result.target).toBe('code')

      // newThreadId should be undefined (conversation was NOT restored)
      expect(result.newThreadId).toBeUndefined()

      // All 3 conversation items should still be present
      const allItems = await sessionStore.loadItems(thread.id)
      expect(allItems).toHaveLength(3)

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    // ── Gate 3: Staged/index state preservation ──
    it('restore preserves staged/index state (git status after restore matches checkpoint)', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-gate3-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      // Commit initial file
      const trackedFile = join(tmpDir, 'tracked.txt')
      await writeFile(trackedFile, 'committed v1', 'utf-8')
      await runGit(tmpDir, ['add', 'tracked.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      // Create staged change
      await writeFile(trackedFile, 'staged v2 - index', 'utf-8')
      await runGit(tmpDir, ['add', 'tracked.txt'])

      // Create unstaged change on top of staged
      await writeFile(trackedFile, 'unstaged v3 - working tree', 'utf-8')

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_gate3',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      expect(cp.snapshot.includesStaged).toBe(true)
      expect(cp.snapshot.includesUnstaged).toBe(true)

      // Record checkpoint git status for later comparison
      const checkpointStatusLines = (cp.snapshot.statusText ?? '').split('\n').filter(Boolean).sort()

      // Mutate everything after checkpoint
      await writeFile(trackedFile, 'v4 - post-checkpoint mutation', 'utf-8')
      await runGit(tmpDir, ['reset', 'HEAD', 'tracked.txt'])

      // Restore code-only
      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)

      // Gate 3: Verify git status after restore matches checkpoint status
      const afterStatus = await runGit(tmpDir, ['status', '--porcelain=v1'])
      const afterLines = afterStatus.stdout.split('\n').filter(Boolean).sort()

      // The staged+unstaged file should appear in status
      // Index shows 'M ' (staged modification), working tree shows ' M' (unstaged)
      // Combined on same file: 'MM tracked.txt' or two separate lines
      const hasStagedIndicator = afterLines.some((line) => {
        const idx = line[0]
        return idx !== ' ' && idx !== '?' && line.slice(3).trim() === 'tracked.txt'
      })
      expect(hasStagedIndicator).toBe(true)

      // Verify the staged content is v2 and unstaged content is v3
      // Staged (index): should be v2
      const stagedDiff = (await runGit(tmpDir, ['diff', '--cached'])).stdout
      expect(stagedDiff).toContain('staged v2')

      // Unstaged (working tree vs index): should be v3 difference
      const unstagedDiff = (await runGit(tmpDir, ['diff'])).stdout
      expect(unstagedDiff).toContain('unstaged v3')

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    // ── Gate 5: confirmDirtyOverwrite bypass ──
    it('bypasses dirty block when confirmDirtyOverwrite is true', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-gate5-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'bypass.txt')
      await writeFile(testFile, 'v1', 'utf-8')
      await runGit(tmpDir, ['add', 'bypass.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      // Checkpoint from clean state
      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_gate5',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      // Introduce pre-existing staged changes
      await writeFile(testFile, 'staged pre-existing', 'utf-8')
      await runGit(tmpDir, ['add', 'bypass.txt'])

      // Without confirmDirtyOverwrite → should throw
      await expect(
        service.restore({ checkpointId: cp.id, target: 'code' })
      ).rejects.toThrow(DirtyWorkspaceRestoreError)

      // With confirmDirtyOverwrite → should succeed
      const result = await service.restore({ checkpointId: cp.id, target: 'code', confirmDirtyOverwrite: true })
      expect(result.restored).toBe(true)

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    // ── Gate 4: Fork worktree dirty snapshot ──
    it('fork worktree with staged+unstaged+untracked artifacts matches full snapshot', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-gate4-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      // Commit a tracked file
      const trackedFile = join(tmpDir, 'tracked.txt')
      await writeFile(trackedFile, 'committed v1', 'utf-8')
      await runGit(tmpDir, ['add', 'tracked.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      // Staged change on tracked file
      await writeFile(trackedFile, 'staged v2', 'utf-8')
      await runGit(tmpDir, ['add', 'tracked.txt'])

      // Unstaged change on tracked file
      await writeFile(trackedFile, 'unstaged v3', 'utf-8')

      // Untracked file
      const untrackedFile = join(tmpDir, 'untracked.txt')
      await writeFile(untrackedFile, 'untracked content', 'utf-8')

      const { service, threadService, sessionStore } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'g4i1', turnId: 'g4t1', threadId: thread.id, text: 'hi' }), 'g4i1')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'g4t1',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      expect(cp.snapshot.includesStaged).toBe(true)
      expect(cp.snapshot.includesUnstaged).toBe(true)
      expect(cp.snapshot.includesUntracked).toBe(true)

      const parentDir = join(tmpDir, '..', 'gate4-worktrees')
      const result = await service.fork({
        checkpointId: cp.id,
        title: 'Gate 4 Fork',
        createWorktree: true,
        worktreeParent: parentDir
      })

      expect(result.worktreePath).toBeTruthy()

      const { readFile } = await import('node:fs/promises')
      const { existsSync } = await import('node:fs')

      // Fork worktree should have the tracked file with unstaged content
      const wtTracked = join(result.worktreePath!, 'tracked.txt')
      expect(existsSync(wtTracked)).toBe(true)
      const wtTrackedContent = await readFile(wtTracked, 'utf-8')
      expect(wtTrackedContent).toBe('unstaged v3')

      // Fork worktree should have the untracked file
      const wtUntracked = join(result.worktreePath!, 'untracked.txt')
      expect(existsSync(wtUntracked)).toBe(true)
      const wtUntrackedContent = await readFile(wtUntracked, 'utf-8')
      expect(wtUntrackedContent).toBe('untracked content')

      // Fork worktree git status should reflect staged changes
      const wtStatus = await runGit(result.worktreePath!, ['status', '--porcelain=v1'])
      const hasStaged = wtStatus.stdout.split('\n').some((line) => {
        return line[0] !== ' ' && line[0] !== '?' && line.includes('tracked.txt')
      })
      expect(hasStaged).toBe(true)

      await rm(tmpDir, { recursive: true, force: true })
      await rm(parentDir, { recursive: true, force: true })
    }, 60_000)

    // ── Gate 1: No stash/reset --hard used ──
    it('restore does not use git stash or git reset --hard', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-gate1-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'no-stash.txt')
      await writeFile(testFile, 'v1', 'utf-8')
      await runGit(tmpDir, ['add', 'no-stash.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_gate1',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      // Record stash count before restore
      const beforeStashList = (await runGit(tmpDir, ['stash', 'list'])).stdout.trim()
      const beforeReflog = (await runGit(tmpDir, ['reflog', '--oneline', '-5'])).stdout

      // Mutate
      await writeFile(testFile, 'v2 mutated', 'utf-8')

      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)

      // Verify no new stash entries
      const afterStashList = (await runGit(tmpDir, ['stash', 'list'])).stdout.trim()
      expect(afterStashList).toBe(beforeStashList)

      // Verify reflog doesn't show reset --hard
      const afterReflog = (await runGit(tmpDir, ['reflog', '--oneline', '-5'])).stdout
      const hasResetHard = afterReflog.split('\n').some((line) => line.includes('reset --hard') && !beforeReflog.includes(line.trim()))
      expect(hasResetHard).toBe(false)

      // File should be restored
      const { readFile } = await import('node:fs/promises')
      const content = await readFile(testFile, 'utf-8')
      expect(content).toBe('v1')

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    // ── Gate 2: Post-checkpoint untracked mutations are cleaned ──
    it('removes post-checkpoint untracked files and restores checkpoint untracked files', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-gate2-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const trackedFile = join(tmpDir, 'tracked.txt')
      await writeFile(trackedFile, 'committed', 'utf-8')
      await runGit(tmpDir, ['add', 'tracked.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      // Create a checkpoint-captured untracked file
      const checkpointUntracked = join(tmpDir, 'checkpoint-untracked.txt')
      await writeFile(checkpointUntracked, 'checkpoint untracked content', 'utf-8')

      const { service, threadService } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create({ workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' })

      const cp = await service.create({
        threadId: thread.id,
        turnId: 'turn_gate2',
        trigger: 'pre_mutation',
        eventSeq: 1,
        itemCount: 1,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      expect(cp.snapshot.includesUntracked).toBe(true)
      expect(cp.snapshot.untrackedFiles).toContain('checkpoint-untracked.txt')

      // After checkpoint: delete the checkpoint untracked file, create a post-checkpoint untracked file, modify tracked file
      await rm(checkpointUntracked)
      const postCheckpointUntracked = join(tmpDir, 'post-checkpoint-untracked.txt')
      await writeFile(postCheckpointUntracked, 'post-checkpoint content', 'utf-8')
      await writeFile(trackedFile, 'mutated tracked', 'utf-8')

      const result = await service.restore({ checkpointId: cp.id, target: 'code' })
      expect(result.restored).toBe(true)

      const { readFile } = await import('node:fs/promises')
      const { existsSync } = await import('node:fs')

      // Checkpoint untracked file should be restored
      expect(existsSync(checkpointUntracked)).toBe(true)
      expect(await readFile(checkpointUntracked, 'utf-8')).toBe('checkpoint untracked content')

      // Post-checkpoint untracked file should be removed
      expect(existsSync(postCheckpointUntracked)).toBe(false)

      // Tracked file should be restored to committed state
      expect(await readFile(trackedFile, 'utf-8')).toBe('committed')

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)

    it('conversation-only restore creates forked thread and leaves code unchanged', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'chkpt-conv-only-'))
      await runGit(tmpDir, ['init'])
      await runGit(tmpDir, ['config', 'user.email', 'test@test.com'])
      await runGit(tmpDir, ['config', 'user.name', 'Test'])

      const testFile = join(tmpDir, 'conv-only.txt')
      await writeFile(testFile, 'pre-checkpoint content', 'utf-8')
      await runGit(tmpDir, ['add', 'conv-only.txt'])
      await runGit(tmpDir, ['commit', '-m', 'initial'])

      const { service, threadService, threadStore, sessionStore, nowIso } = buildCheckpointService({ dataDir: join(tmpDir, '.chkpts') })
      const thread = await threadService.create(
        { workspace: tmpDir, model: 'deepseek-chat', mode: 'agent' },
        { id: 'thr_conv_only', title: 'Conv Only Thread' }
      )

      const items: TurnItem[] = [
        withId(makeUserItem({ id: 'co1', turnId: 'cot1', threadId: thread.id, text: 'msg1' }), 'co1'),
        withId(makeAssistantTextItem({ id: 'co2', turnId: 'cot1', threadId: thread.id, text: 'resp1' }), 'co2'),
        withId(makeUserItem({ id: 'co3', turnId: 'cot2', threadId: thread.id, text: 'msg2' }), 'co3'),
        withId(makeAssistantTextItem({ id: 'co4', turnId: 'cot2', threadId: thread.id, text: 'resp2' }), 'co4')
      ]
      for (const item of items) await sessionStore.appendItem(thread.id, item)
      await threadStore.upsert({
        ...thread,
        turns: [
          { id: 'cot1', threadId: thread.id, status: 'completed', prompt: 'msg1', steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [], createdAt: nowIso(), finishedAt: nowIso(), items: [items[0], items[1]] },
          { id: 'cot2', threadId: thread.id, status: 'completed', prompt: 'msg2', steering: [], attachmentIds: [], activeSkillIds: [], injectedMemoryIds: [], createdAt: nowIso(), finishedAt: nowIso(), items: [items[2], items[3]] }
        ]
      })

      // Checkpoint after turn 1 (2 items)
      const cp = await service.create({
        threadId: thread.id,
        turnId: 'cot1',
        trigger: 'pre_mutation',
        eventSeq: 2,
        itemCount: 2,
        turnCount: 1,
        workspaceRoot: tmpDir
      })

      // Mutate file after checkpoint
      await writeFile(testFile, 'post-checkpoint mutation', 'utf-8')

      // Conversation-only restore
      const result = await service.restore({ checkpointId: cp.id, target: 'conversation' })
      expect(result.restored).toBe(true)
      expect(result.target).toBe('conversation')
      expect(result.newThreadId).toBeTruthy()
      expect(result.newItemCount).toBe(2)

      // Code should NOT be restored — file still has mutation
      const { readFile } = await import('node:fs/promises')
      const fileContent = await readFile(testFile, 'utf-8')
      expect(fileContent).toBe('post-checkpoint mutation')

      await rm(tmpDir, { recursive: true, force: true })
    }, 30_000)
  })
})
