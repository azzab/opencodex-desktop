import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { InMemoryEventBus } from '../src/adapters/in-memory-event-bus.js'
import { InMemorySessionStore } from '../src/adapters/in-memory-session-store.js'
import { CapabilityRegistry } from '../src/adapters/tool/capability-registry.js'
import { buildDelegationToolProviders } from '../src/adapters/tool/delegation-tool-provider.js'
import { LocalToolHost } from '../src/adapters/tool/local-tool-host.js'
import { KunCapabilitiesConfig } from '../src/contracts/capabilities.js'
import { DelegationRuntime, FileDelegationStore } from '../src/delegation/delegation-runtime.js'
import { RuntimeEventRecorder } from '../src/services/runtime-event-recorder.js'

describe('DelegationRuntime', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kun-delegation-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates child runs, persists records, and emits child event metadata', async () => {
    const sessionStore = new InMemorySessionStore()
    const externalUsage: unknown[] = []
    const runtime = createRuntime({
      sessionStore,
      recordExternalUsage: (_threadId, usage) => {
        externalUsage.push(usage)
      }
    })
    const result = await runtime.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      label: 'research',
      prompt: 'Research A',
      workspace: '/tmp/ws',
      signal: new AbortController().signal
    })

    expect(result).toMatchObject({ status: 'completed', summary: 'done: Research A' })
    expect((await runtime.diagnostics('thr_1')).childRuns).toHaveLength(1)
    const events = await sessionStore.loadEventsSince('thr_1', 0)
    expect(events.some((event) => event.child?.childId === result.id && event.child.childStatus === 'completed')).toBe(true)
    expect(externalUsage).toHaveLength(1)
    expect(externalUsage[0]).toMatchObject({ totalTokens: 3 })
  })

  it('denies disabled delegation and exhausted child budgets', async () => {
    const disabled = createRuntime({ enabled: false })
    await expect(disabled.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      prompt: 'x',
      signal: new AbortController().signal
    })).rejects.toThrow(/disabled/)

    const budgeted = createRuntime({ maxChildRuns: 1 })
    await budgeted.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      prompt: 'first',
      signal: new AbortController().signal
    })
    await expect(budgeted.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      prompt: 'second',
      signal: new AbortController().signal
    })).rejects.toThrow(/budget/)
  })

  it('executes delegate_task through the normal tool host', async () => {
    const runtime = createRuntime()
    const host = new LocalToolHost({
      registry: new CapabilityRegistry(buildDelegationToolProviders(runtime))
    })
    const result = await host.execute({
      callId: 'call_1',
      toolName: 'delegate_task',
      arguments: { label: 'A', prompt: 'Investigate A' }
    }, {
      threadId: 'thr_1',
      turnId: 'turn_1',
      workspace: '/tmp/ws',
      approvalPolicy: 'auto',
      abortSignal: new AbortController().signal,
      awaitApproval: async () => 'allow'
    })

    expect(result.item).toMatchObject({ kind: 'tool_result', isError: false })
    if (result.item.kind === 'tool_result') {
      expect(result.item.output).toMatchObject({
        status: 'completed',
        summary: 'done: Investigate A',
        usage: { totalTokens: 3 }
      })
    }
  })

  it('warns when delegate_task is spawned repeatedly in one parent thread', async () => {
    const runtime = createRuntime()
    const host = new LocalToolHost({
      registry: new CapabilityRegistry(buildDelegationToolProviders(runtime))
    })
    const context = {
      threadId: 'thr_1',
      turnId: 'turn_1',
      workspace: '/tmp/ws',
      approvalPolicy: 'auto' as const,
      abortSignal: new AbortController().signal,
      awaitApproval: async () => 'allow' as const
    }
    await host.execute({
      callId: 'call_1',
      toolName: 'delegate_task',
      arguments: { prompt: 'first' }
    }, context)
    const second = await host.execute({
      callId: 'call_2',
      toolName: 'delegate_task',
      arguments: { prompt: 'second' }
    }, context)

    expect(second.item.kind === 'tool_result' ? second.item.output : {}).toMatchObject({
      warning: expect.stringContaining('spawn #2')
    })
  })

  it('aggregates child runs by label and model for dashboards', async () => {
    const runtime = createRuntime()
    await runtime.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      label: 'research',
      prompt: 'first',
      model: 'deepseek-v4-flash',
      signal: new AbortController().signal
    })
    await runtime.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      label: 'research',
      prompt: 'second',
      model: 'deepseek-v4-flash',
      signal: new AbortController().signal
    })

    const diagnostics = await runtime.diagnostics('thr_1')
    expect(diagnostics.aggregates[0]).toMatchObject({
      key: 'research:deepseek-v4-flash',
      runs: 2,
      completed: 2,
      totalTokens: 6,
      cacheHitTokens: 2,
      cacheMissTokens: 4,
      cacheHitRate: 2 / 6,
      summaries: ['done: first', 'done: second'],
      averageTotalTokens: 3
    })
    expect(diagnostics.usage).toMatchObject({
      totalTokens: 6,
      cacheHitTokens: 2,
      cacheMissTokens: 4,
      costUsd: 0.006
    })
  })

  it('stops new child runs when aggregate token or cost budget is exhausted', async () => {
    const tokenBudgeted = createRuntime({ maxTotalChildTokens: 3 })
    await tokenBudgeted.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      prompt: 'first',
      signal: new AbortController().signal
    })
    await expect(tokenBudgeted.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      prompt: 'second',
      signal: new AbortController().signal
    })).rejects.toThrow(/token budget/i)

    const costBudgeted = createRuntime({ maxChildCostUsd: 0.003 })
    await costBudgeted.runChild({
      parentThreadId: 'thr_2',
      parentTurnId: 'turn_1',
      prompt: 'first',
      signal: new AbortController().signal
    })
    await expect(costBudgeted.runChild({
      parentThreadId: 'thr_2',
      parentTurnId: 'turn_1',
      prompt: 'second',
      signal: new AbortController().signal
    })).rejects.toThrow(/cost budget/i)
  })

  it('records parent usage events for completed child runs', async () => {
    const sessionStore = new InMemorySessionStore()
    const usageEvents: unknown[] = []
    const runtime = createRuntime({
      sessionStore,
      recordExternalUsage: (_threadId, usage) => {
        usageEvents.push(usage)
        return usage
      }
    })
    const result = await runtime.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      label: 'review',
      prompt: 'review it',
      signal: new AbortController().signal
    })

    expect(result.status).toBe('completed')
    expect(usageEvents).toEqual([expect.objectContaining({ totalTokens: 3, costUsd: 0.003 })])
    const events = await sessionStore.loadEventsSince('thr_1', 0)
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'usage',
        usage: expect.objectContaining({ totalTokens: 3, costUsd: 0.003 })
      })
    ]))
  })

  it('aborts child runs when the per-agent timeout is reached', async () => {
    const runtime = createRuntime({
      perAgentTimeoutMs: 5,
      executor: ({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('child observed timeout')), { once: true })
        setTimeout(() => resolve({ summary: 'late' }), 100)
      })
    })

    await expect(runtime.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      prompt: 'slow',
      signal: new AbortController().signal
    })).resolves.toMatchObject({
      status: 'aborted',
      error: expect.stringMatching(/timed out|timeout|aborted/i)
    })
  })

  it('records child failure and parent interruption states', async () => {
    const failed = createRuntime({
      executor: async () => {
        throw new Error('child failed')
      }
    })
    await expect(failed.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      prompt: 'fail',
      signal: new AbortController().signal
    })).resolves.toMatchObject({ status: 'failed', error: 'child failed' })

    const controller = new AbortController()
    controller.abort()
    const aborted = createRuntime({
      executor: async ({ signal }) => {
        if (signal.aborted) throw new Error('aborted')
        return { summary: 'unreachable' }
      }
    })
    await expect(aborted.runChild({
      parentThreadId: 'thr_1',
      parentTurnId: 'turn_1',
      prompt: 'abort',
      signal: controller.signal
    })).resolves.toMatchObject({ status: 'aborted' })
  })

  function createRuntime(options: {
    enabled?: boolean
    maxChildRuns?: number
    maxTotalChildTokens?: number
    maxChildCostUsd?: number
    perAgentTimeoutMs?: number
    sessionStore?: InMemorySessionStore
    executor?: ConstructorParameters<typeof DelegationRuntime>[0]['executor']
    recordExternalUsage?: ConstructorParameters<typeof DelegationRuntime>[0]['recordExternalUsage']
  } = {}) {
    const sessionStore = options.sessionStore ?? new InMemorySessionStore()
    const bus = new InMemoryEventBus()
    const recorder = new RuntimeEventRecorder({
      eventBus: bus,
      sessionStore,
      allocateSeq: (threadId) => bus.allocateSeq(threadId),
      nowIso: () => '2026-06-03T00:00:00.000Z'
    })
    const config = KunCapabilitiesConfig.parse({
      subagents: {
        enabled: options.enabled ?? true,
        maxParallel: 1,
        maxChildRuns: options.maxChildRuns ?? 3,
        maxTotalChildTokens: options.maxTotalChildTokens ?? 0,
        maxChildCostUsd: options.maxChildCostUsd ?? 0,
        perAgentTimeoutMs: options.perAgentTimeoutMs ?? 0
      }
    }).subagents
    return new DelegationRuntime({
      config,
      store: new FileDelegationStore(join(dir, 'children')),
      events: recorder,
      nowIso: () => '2026-06-03T00:00:00.000Z',
      idGenerator: () => `child_${Math.random().toString(36).slice(2, 8)}`,
      recordExternalUsage: options.recordExternalUsage,
      executor: options.executor ?? (async ({ prompt }) => ({
        summary: `done: ${prompt}`,
        usage: {
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
          cacheHitTokens: 1,
          cacheMissTokens: 2,
          cacheHitRate: 1 / 3,
          costUsd: 0.003
        }
      }))
    })
  }
})
