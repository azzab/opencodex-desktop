import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InMemorySessionStore } from '../src/adapters/in-memory-session-store.js'
import { InMemoryEventBus } from '../src/adapters/in-memory-event-bus.js'
import { InMemoryThreadStore } from '../src/adapters/in-memory-thread-store.js'
import { FileThreadStore } from '../src/adapters/file/file-thread-store.js'
import { SequentialIdGenerator } from '../src/ports/id-generator.js'
import { ThreadService } from '../src/services/thread-service.js'
import { RuntimeEventRecorder } from '../src/services/runtime-event-recorder.js'
import { createThreadRecord, touchThread } from '../src/domain/thread.js'
import { createTurnRecord, startTurn } from '../src/domain/turn.js'
import { makeAssistantTextItem, makeToolCallItem, makeToolResultItem, makeUserItem } from '../src/domain/item.js'
import type { TurnItem } from '../src/contracts/items.js'
import { DEFAULT_KUN_MODEL } from '../src/config/kun-config.js'

function buildService(): {
  service: ThreadService
  threadStore: InMemoryThreadStore
  sessionStore: InMemorySessionStore
  nowIso: () => string
} {
  const bus = new InMemoryEventBus()
  const threadStore = new InMemoryThreadStore()
  const sessionStore = new InMemorySessionStore()
  const ids = new SequentialIdGenerator()
  let now = 1_700_000_000_000
  const nowIso = () => new Date((now += 1000)).toISOString()
  const events = new RuntimeEventRecorder({
    eventBus: bus,
    sessionStore,
    allocateSeq: (threadId) => bus.allocateSeq(threadId),
    nowIso
  })
  return {
    service: new ThreadService({ threadStore, sessionStore, events, ids, nowIso }),
    threadStore,
    sessionStore,
    nowIso
  }
}

function withId(item: TurnItem, id: string): TurnItem {
  return { ...item, id }
}

async function seedParentWithTurns(
  service: ThreadService,
  threadStore: InMemoryThreadStore,
  sessionStore: InMemorySessionStore,
  nowIso: () => string,
  options: { parentId: string; inflight?: boolean }
): Promise<void> {
  await service.create(
    { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
    { id: options.parentId, title: 'Parent' }
  )
  const completed = startTurn(
    createTurnRecord({
      id: 'turn_completed',
      threadId: options.parentId,
      prompt: 'first ask',
      createdAt: nowIso()
    }),
    nowIso()
  )
  const completedItems: TurnItem[] = [
    withId(
      makeUserItem({ id: 'item_user_1', turnId: completed.id, threadId: options.parentId, text: 'first ask' }),
      'item_user_1'
    ),
    withId(
      makeAssistantTextItem({
        id: 'item_a_1',
        turnId: completed.id,
        threadId: options.parentId,
        text: 'first answer'
      }),
      'item_a_1'
    )
  ]
  completed.items = completedItems

  const running = startTurn(
    createTurnRecord({
      id: 'turn_inflight',
      threadId: options.parentId,
      prompt: 'mid-flight ask',
      createdAt: nowIso()
    }),
    nowIso()
  )
  const runningItems: TurnItem[] = [
    withId(
      makeUserItem({ id: 'item_user_2', turnId: running.id, threadId: options.parentId, text: 'mid-flight ask' }),
      'item_user_2'
    ),
    withId(
      makeAssistantTextItem({
        id: 'item_a_2',
        turnId: running.id,
        threadId: options.parentId,
        text: 'partial reasoning...',
        status: 'running'
      }),
      'item_a_2'
    ),
    withId(
      makeToolCallItem({
        id: 'item_t_2',
        turnId: running.id,
        threadId: options.parentId,
        callId: 'call_inflight',
        toolName: 'noop',
        arguments: { partial: true },
        status: 'running'
      }),
      'item_t_2'
    )
  ]
  running.items = runningItems

  const turns = options.inflight ? [completed, running] : [completed]
  const parent = await threadStore.get(options.parentId)
  if (!parent) throw new Error('parent missing')
  await threadStore.upsert(touchThread({ ...parent, turns }, nowIso()))
  for (const turn of turns) {
    for (const item of turn.items) {
      await sessionStore.appendItem(parent.id, item)
    }
  }
}

describe('ThreadService.fork with side relation', () => {
  it('sets parentThreadId and side relation on the new thread', async () => {
    const { service, threadStore } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
      { id: 'thr_1', title: 'Parent' }
    )
    const side = await service.fork('thr_1', { relation: 'side' })
    expect(side.relation).toBe('side')
    expect(side.parentThreadId).toBe('thr_1')
    expect(side.forkedFromThreadId).toBe('thr_1')
    expect(side.title).toBe('Parent · side')
    // The parent record must not be mutated by the spawn.
    const parent = await threadStore.get('thr_1')
    expect(parent?.relation ?? 'primary').toBe('primary')
    expect(parent?.parentThreadId).toBeUndefined()
  })

  it('tolerates a running parent turn and drops unfinished assistant/tool items from the clone', async () => {
    const { service, threadStore, sessionStore, nowIso } = buildService()
    await seedParentWithTurns(service, threadStore, sessionStore, nowIso, {
      parentId: 'thr_run',
      inflight: true
    })
    const parentTurnsBefore = (await threadStore.get('thr_run'))!.turns
    const parentItemsBefore = parentTurnsBefore.flatMap((turn) => turn.items)

    const side = await service.fork('thr_run', { relation: 'side' })

    expect(side.relation).toBe('side')
    expect(side.parentThreadId).toBe('thr_run')

    const clonedInflight = side.turns.find((turn) => turn.id === 'turn_inflight')
    expect(clonedInflight).toBeDefined()
    expect(clonedInflight?.status).toBe('aborted')
    // Only the user prompt survives; assistant/tool items are dropped.
    expect(clonedInflight?.items).toHaveLength(1)
    const surviving = clonedInflight?.items[0]
    expect(surviving?.kind).toBe('user_message')
    if (surviving && surviving.kind === 'user_message') {
      expect(surviving.text).toBe('mid-flight ask')
    }

    // Parent is untouched.
    const parentAfter = await threadStore.get('thr_run')
    const parentTurnsAfter = parentAfter!.turns
    expect(parentTurnsAfter).toEqual(parentTurnsBefore)
    expect(parentTurnsAfter.flatMap((turn) => turn.items)).toEqual(parentItemsBefore)
  })

  it('isolates side turns from the parent: side thread mutating its own items leaves parent items unchanged', async () => {
    const { service, threadStore, sessionStore, nowIso } = buildService()
    await seedParentWithTurns(service, threadStore, sessionStore, nowIso, {
      parentId: 'thr_iso',
      inflight: false
    })
    const side = await service.fork('thr_iso', { relation: 'side' })
    // Append a side-only item; parent's session store is untouched.
    const sideItem = withId(
      makeAssistantTextItem({
        id: 'item_side_a',
        turnId: 'turn_side',
        threadId: side.id,
        text: 'side-only reply'
      }),
      'item_side_a'
    )
    await sessionStore.appendItem(side.id, sideItem)
    const sideItems = await sessionStore.loadItems(side.id)
    expect(sideItems).toHaveLength(2)
    const parentItems = await sessionStore.loadItems('thr_iso')
    expect(parentItems).toHaveLength(2)
    expect(parentItems.map((item) => item.kind)).toEqual(['user_message', 'assistant_text'])
    expect(parentItems.find((item) => item.kind === 'user_message')).toMatchObject({
      text: 'first ask'
    })
  })

  it('defaults relation to fork for bodyless fork calls', async () => {
    const { service } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
      { id: 'thr_f', title: 'Forker' }
    )
    const fork = await service.fork('thr_f')
    expect(fork.relation).toBe('fork')
    expect(fork.parentThreadId).toBe('thr_f')
    expect(fork.title).toBe('Forker fork')
  })

  it('repairs malformed tool-call history when cloning a fork', async () => {
    const { service, threadStore, sessionStore, nowIso } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
      { id: 'thr_tools', title: 'Tool Parent' }
    )
    const turn = startTurn(
      createTurnRecord({
        id: 'turn_tools',
        threadId: 'thr_tools',
        prompt: 'use tools',
        createdAt: nowIso()
      }),
      nowIso()
    )
    const items: TurnItem[] = [
      makeUserItem({ id: 'item_user_tools', turnId: turn.id, threadId: 'thr_tools', text: 'use tools' }),
      makeToolResultItem({
        id: 'item_orphan_result',
        turnId: turn.id,
        threadId: 'thr_tools',
        callId: 'call_orphan',
        toolName: 'echo',
        output: 'orphan'
      }),
      makeToolCallItem({
        id: 'item_missing_call',
        turnId: turn.id,
        threadId: 'thr_tools',
        callId: 'call_missing',
        toolName: 'echo',
        arguments: { text: 'missing' }
      }),
      makeToolCallItem({
        id: 'item_valid_call',
        turnId: turn.id,
        threadId: 'thr_tools',
        callId: 'call_valid',
        toolName: 'echo',
        arguments: { text: 'ok' }
      }),
      makeToolResultItem({
        id: 'item_valid_result',
        turnId: turn.id,
        threadId: 'thr_tools',
        callId: 'call_valid',
        toolName: 'echo',
        output: 'ok'
      })
    ]
    turn.items = items
    const parent = await threadStore.get('thr_tools')
    if (!parent) throw new Error('parent missing')
    await threadStore.upsert(touchThread({ ...parent, turns: [turn] }, nowIso()))
    for (const item of items) {
      await sessionStore.appendItem('thr_tools', item)
    }

    const fork = await service.fork('thr_tools')
    const forkItems = fork.turns.flatMap((clonedTurn) => clonedTurn.items)
    const parentItems = await sessionStore.loadItems('thr_tools')

    expect(parentItems.some((item) => item.kind === 'tool_result' && item.callId === 'call_orphan')).toBe(true)
    expect(forkItems.some((item) => item.kind === 'tool_result' && item.callId === 'call_orphan')).toBe(false)
    expect(forkItems.some((item) => item.kind === 'tool_call' && item.callId === 'call_missing')).toBe(false)
    expect(forkItems.some((item) => item.kind === 'tool_call' && item.callId === 'call_valid')).toBe(true)
    expect(forkItems.some((item) => item.kind === 'tool_result' && item.callId === 'call_valid')).toBe(true)
  })

  it('respects a custom side title when provided', async () => {
    const { service } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
      { id: 'thr_t', title: 'Parent' }
    )
    const side = await service.fork('thr_t', { relation: 'side', title: 'My aside' })
    expect(side.title).toBe('My aside')
  })
})

describe('ThreadService goals', () => {
  it('sets, updates, and clears a thread goal', async () => {
    const { service, sessionStore } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
      { id: 'thr_goal', title: 'Goal thread' }
    )

    const goal = await service.setGoal('thr_goal', {
      objective: 'ship goal mode',
      status: 'active',
      tokenBudget: 5000
    })
    expect(goal).toMatchObject({
      threadId: 'thr_goal',
      objective: 'ship goal mode',
      status: 'active',
      tokenBudget: 5000,
      tokensUsed: 0,
      timeUsedSeconds: 0
    })
    expect((await service.getGoal('thr_goal'))?.objective).toBe('ship goal mode')

    const paused = await service.setGoal('thr_goal', { status: 'paused' })
    expect(paused.status).toBe('paused')
    expect(paused.objective).toBe('ship goal mode')

    expect(await service.clearGoal('thr_goal')).toBe(true)
    expect(await service.getGoal('thr_goal')).toBeNull()
    expect(await service.clearGoal('thr_goal')).toBe(false)

    const events = await sessionStore.loadEventsSince('thr_goal', 0)
    expect(events.map((event) => event.kind)).toContain('goal_updated')
    expect(events.map((event) => event.kind)).toContain('goal_cleared')
  })

  it('rejects status-only updates when no goal exists', async () => {
    const { service } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
      { id: 'thr_empty', title: 'Goal thread' }
    )

    await expect(service.setGoal('thr_empty', { status: 'paused' })).rejects.toThrow(/no goal exists/)
  })
})

describe('ThreadService todos', () => {
  it('syncs plan checklists, patches linked checkboxes, and preserves removed tasks', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'kun-todos-'))
    try {
      const relativePath = '.kunsdd/plan/demo.md'
      const absolutePath = join(workspace, relativePath)
      await mkdir(join(workspace, '.kunsdd', 'plan'), { recursive: true })
      const originalMarkdown = '# Plan\n\n- [ ] Build UI\n- [x] Add tests\n'
      await writeFile(absolutePath, originalMarkdown, 'utf-8')

      const { service, sessionStore } = buildService()
      await service.create(
        { workspace, model: 'deepseek-chat', mode: 'agent' },
        { id: 'thr_todos', title: 'Todos' }
      )

      const synced = await service.syncTodosFromPlan('thr_todos', {
        planId: 'plan_1',
        relativePath,
        markdown: originalMarkdown
      })
      expect(synced.items.map((item) => [item.content, item.status])).toEqual([
        ['Build UI', 'pending'],
        ['Add tests', 'completed']
      ])

      const toggled = await service.setTodos('thr_todos', {
        todos: synced.items.map((item) => ({
          id: item.id,
          content: item.content,
          status: item.content === 'Build UI' ? 'completed' : item.status,
          source: item.source
        }))
      })
      expect(toggled.items.find((item) => item.content === 'Build UI')?.status).toBe('completed')
      expect(await readFile(absolutePath, 'utf-8')).toContain('- [x] Build UI')

      const rewrittenMarkdown = '# Plan\n\n- [ ] Add tests\n'
      const rewritten = await service.syncTodosFromPlan('thr_todos', {
        planId: 'plan_1',
        relativePath,
        markdown: rewrittenMarkdown
      })
      const removed = rewritten.items.find((item) => item.content === 'Build UI')
      expect(removed?.status).toBe('completed')
      expect(removed?.source).toBeUndefined()
      expect(rewritten.items.find((item) => item.content === 'Add tests')?.status).toBe('completed')

      const events = await sessionStore.loadEventsSince('thr_todos', 0)
      expect(events.some((event) => event.kind === 'todos_updated')).toBe(true)
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
})

describe('ThreadService plan persistence and approval', () => {
  it('sets and retrieves a plan artifact', async () => {
    const { service } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'plan' },
      { id: 'thr_plan', title: 'Plan thread' }
    )

    const plan = await service.setPlan('thr_plan', {
      planId: 'plan_1',
      relativePath: '.kunsdd/plan/feature.md',
      title: 'Feature plan',
      workspaceRoot: '/tmp/p',
      sourceRequest: 'Build feature X'
    })

    expect(plan.planId).toBe('plan_1')
    expect(plan.relativePath).toBe('.kunsdd/plan/feature.md')
    expect(plan.title).toBe('Feature plan')
    expect(plan.status).toBe('ready')
    expect(plan.createdAt).toBeTruthy()
    expect(plan.updatedAt).toBeTruthy()

    const retrieved = await service.getPlan('thr_plan')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.planId).toBe('plan_1')
    expect(retrieved!.status).toBe('ready')
  })

  it('plan status defaults to existing status when not provided', async () => {
    const { service } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'plan' },
      { id: 'thr_plan2', title: 'Plan thread 2' }
    )

    await service.setPlan('thr_plan2', {
      planId: 'plan_2',
      relativePath: '.kunsdd/plan/feature2.md',
      status: 'drafting'
    })

    // Second set without status should preserve drafting
    const updated = await service.setPlan('thr_plan2', {
      planId: 'plan_2',
      relativePath: '.kunsdd/plan/feature2.md',
      title: 'Updated title'
    })
    expect(updated.status).toBe('drafting')
    expect(updated.title).toBe('Updated title')
  })

  it('structured plan artifact survives a full thread-store reload with persistent FileThreadStore', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'kun-plan-persist-'))
    try {
      // Build first service with a persistent FileThreadStore
      const threadStore1 = new FileThreadStore({ dataDir })
      const sessionStore1 = new InMemorySessionStore()
      const bus1 = new InMemoryEventBus()
      const ids1 = new SequentialIdGenerator()
      let now = 1_700_000_000_000
      const nowIso1 = () => new Date((now += 1000)).toISOString()
      const events1 = new RuntimeEventRecorder({
        eventBus: bus1,
        sessionStore: sessionStore1,
        allocateSeq: (threadId) => bus1.allocateSeq(threadId),
        nowIso: nowIso1
      })
      const service1 = new ThreadService({
        threadStore: threadStore1,
        sessionStore: sessionStore1,
        events: events1,
        ids: ids1,
        nowIso: nowIso1
      })

      await service1.create(
        { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'plan' },
        { id: 'thr_persist', title: 'Persist test' }
      )

      await service1.setPlan('thr_persist', {
        planId: 'plan_persist',
        relativePath: '.kunsdd/plan/persist.md',
        title: 'Persist plan',
        workspaceRoot: '/tmp/p',
        sourceRequest: 'Test persistence across reload',
        status: 'ready'
      })

      // Simulate full restart: create new stores from the same dataDir
      const threadStore2 = new FileThreadStore({ dataDir })
      const sessionStore2 = new InMemorySessionStore()
      const bus2 = new InMemoryEventBus()
      const ids2 = new SequentialIdGenerator()
      const nowIso2 = () => new Date().toISOString()
      const events2 = new RuntimeEventRecorder({
        eventBus: bus2,
        sessionStore: sessionStore2,
        allocateSeq: (threadId) => bus2.allocateSeq(threadId),
        nowIso: nowIso2
      })
      const service2 = new ThreadService({
        threadStore: threadStore2,
        sessionStore: sessionStore2,
        events: events2,
        ids: ids2,
        nowIso: nowIso2
      })

      // After reload, getPlan must return the same plan fields
      const plan = await service2.getPlan('thr_persist')
      expect(plan).not.toBeNull()
      expect(plan!.planId).toBe('plan_persist')
      expect(plan!.status).toBe('ready')
      expect(plan!.title).toBe('Persist plan')
      expect(plan!.relativePath).toBe('.kunsdd/plan/persist.md')
      expect(plan!.workspaceRoot).toBe('/tmp/p')
      expect(plan!.sourceRequest).toBe('Test persistence across reload')
      expect(plan!.createdAt).toBeTruthy()
      expect(plan!.updatedAt).toBeTruthy()

      // Also verify the reloaded thread is intact
      const thread = await service2.get('thr_persist')
      expect(thread).not.toBeNull()
      expect(thread!.mode).toBe('plan')
      expect(thread!.title).toBe('Persist test')
    } finally {
      await rm(dataDir, { recursive: true, force: true })
    }
  })

  it('approvePlan transitions thread to agent mode and records approval event', async () => {
    const { service, sessionStore } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'plan' },
      { id: 'thr_approve', title: 'Approve test' }
    )

    await service.setPlan('thr_approve', {
      planId: 'plan_approve',
      relativePath: '.kunsdd/plan/approve.md',
      title: 'Approve me',
      status: 'ready'
    })

    const approved = await service.approvePlan('thr_approve')
    expect(approved.status).toBe('approved')

    // Verify thread mode changed
    const thread = await service.get('thr_approve')
    expect(thread).not.toBeNull()
    expect(thread!.mode).toBe('agent')
    expect(thread!.plan?.status).toBe('approved')

    // Verify approval event was recorded
    const events = await sessionStore.loadEventsSince('thr_approve', 0)
    const approvalEvents = events.filter((e) => e.kind === 'approval_resolved' && e.toolName === 'plan_approve')
    expect(approvalEvents.length).toBe(1)
    expect((approvalEvents[0] as any).status).toBe('allowed')

    // Verify thread_updated event includes mode
    const threadUpdatedEvents = events.filter((e) => e.kind === 'thread_updated')
    const modeEvent = threadUpdatedEvents.find((e) => (e as any).mode === 'agent')
    expect(modeEvent).toBeDefined()
  })

  it('approvePlan throws when no plan exists', async () => {
    const { service } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'plan' },
      { id: 'thr_no_plan', title: 'No plan thread' }
    )

    await expect(service.approvePlan('thr_no_plan')).rejects.toThrow(/no plan to approve/)
  })

  it('getPlan returns null when no plan exists', async () => {
    const { service } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'plan' },
      { id: 'thr_empty_plan', title: 'Empty plan' }
    )

    const plan = await service.getPlan('thr_empty_plan')
    expect(plan).toBeNull()
  })
})

describe('ThreadService.list with relation filter', () => {
  it('hides side threads by default and includes them with includeSide', async () => {
    const { service } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
      { id: 'thr_main', title: 'Main' }
    )
    const side = await service.fork('thr_main', { relation: 'side' })
    const fork = await service.fork('thr_main', { relation: 'fork' })
    const def = await service.list()
    const ids = def.map((t) => t.id).sort()
    expect(ids).toEqual(['thr_main', fork.id].sort())
    expect(def.find((t) => t.id === side.id)).toBeUndefined()

    const all = await service.list({ includeSide: true })
    const allIds = all.map((t) => t.id).sort()
    expect(allIds).toEqual(['thr_main', fork.id, side.id].sort())
  })
})

describe('ThreadService.resumeSession', () => {
  it('uses the Kun default model when resuming item-only legacy sessions', async () => {
    const { service, sessionStore } = buildService()
    await sessionStore.appendItem(
      'legacy_session',
      makeUserItem({
        id: 'item_legacy_user',
        turnId: 'turn_legacy',
        threadId: 'legacy_session',
        text: 'legacy prompt'
      })
    )

    const result = await service.resumeSession('legacy_session')

    expect(result.thread.model).toBe(DEFAULT_KUN_MODEL)
  })
})

describe('ThreadService.update relation', () => {
  it('clears parentThreadId when promoting a side thread to primary', async () => {
    const { service, threadStore } = buildService()
    await service.create(
      { workspace: '/tmp/p', model: 'deepseek-chat', mode: 'agent' },
      { id: 'thr_p', title: 'Parent' }
    )
    const side = await service.fork('thr_p', { relation: 'side' })
    expect(side.parentThreadId).toBe('thr_p')
    const promoted = await service.update(side.id, { relation: 'primary' })
    expect(promoted.relation).toBe('primary')
    expect(promoted.parentThreadId).toBeUndefined()
    const fetched = await threadStore.get(side.id)
    expect(fetched?.relation).toBe('primary')
  })
})

describe('ThreadService + domain factory relation defaults', () => {
  it('createThreadRecord defaults relation to primary when unspecified', () => {
    const thread = createThreadRecord({
      id: 'thr_default',
      title: 'Default',
      workspace: '/tmp',
      model: 'deepseek-chat'
    })
    expect(thread.relation).toBe('primary')
    expect(thread.parentThreadId).toBeUndefined()
  })
})
