/**
 * Plan-mode checkpoint isolation tests and checkpoint-loop integration.
 */
import { describe, expect, it } from 'vitest'
import { InMemorySessionStore } from '../src/adapters/in-memory-session-store.js'
import { InMemoryEventBus } from '../src/adapters/in-memory-event-bus.js'
import { InMemoryThreadStore } from '../src/adapters/in-memory-thread-store.js'
import { InMemoryCheckpointStore } from '../src/adapters/in-memory-checkpoint-store.js'
import { SequentialIdGenerator } from '../src/ports/id-generator.js'
import { CheckpointService } from '../src/services/checkpoint-service.js'
import { RuntimeEventRecorder } from '../src/services/runtime-event-recorder.js'
import { AgentLoop } from '../src/loop/agent-loop.js'
import type { AgentLoopOptions } from '../src/loop/agent-loop.js'
import { InMemoryApprovalGate } from '../src/adapters/in-memory-approval-gate.js'
import { InMemoryUserInputGate } from '../src/adapters/in-memory-user-input-gate.js'
import { LocalToolHost, buildDefaultLocalTools, LocalToolHost as LTH, type LocalTool } from '../src/adapters/tool/local-tool-host.js'
import { ContextCompactor } from '../src/loop/context-compactor.js'
import { InflightTracker } from '../src/loop/inflight-tracker.js'
import { SteeringQueue } from '../src/loop/steering-queue.js'
import { ThreadService } from '../src/services/thread-service.js'
import { TurnService } from '../src/services/turn-service.js'
import { UsageService } from '../src/services/usage-service.js'
import { createImmutablePrefix } from '../src/cache/immutable-prefix.js'
import type { ModelClient, ModelStreamChunk } from '../src/ports/model-client.js'

// Test tools with specific tool kinds
const testMutateTool: LocalTool = {
  name: 'test_mutate',
  description: 'A mutating test tool',
  inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
  toolKind: 'file_change',
  policy: 'auto' as const,
  planModeAllowed: false,
  execute: async (args) => ({ output: { mutated: args.value } })
}

const testReadonlyTool: LocalTool = {
  name: 'test_readonly',
  description: 'A read-only test tool',
  inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
  toolKind: 'tool_call',
  policy: 'auto' as const,
  planModeAllowed: true,
  execute: async (args) => ({ output: { read: args.value } })
}

const TEST_TOOLS: LocalTool[] = [...buildDefaultLocalTools(), testMutateTool, testReadonlyTool]

const TEXT_ONLY_MODEL: ModelClient = {
  model: 'test-model',
  provider: 'test',
  stream: async function* (): AsyncGenerator<ModelStreamChunk> {
    yield { kind: 'assistant_text_delta', text: 'OK.' }
    yield { kind: 'completed', stopReason: 'stop' }
  }
}

function writeToolModel(): ModelClient {
  let called = false
  return {
    model: 'test-model',
    provider: 'test',
    stream: async function* (): AsyncGenerator<ModelStreamChunk> {
      if (!called) {
        called = true
        yield { kind: 'tool_call_complete', callId: 'c1', toolName: 'test_mutate', arguments: { value: 'x' } }
        yield { kind: 'completed', stopReason: 'tool_calls' }
      } else {
        yield { kind: 'assistant_text_delta', text: 'Done.' }
        yield { kind: 'completed', stopReason: 'stop' }
      }
    }
  }
}

function twoMutationModel(): ModelClient {
  let step = 0
  return {
    model: 'test-model',
    provider: 'test',
    stream: async function* (): AsyncGenerator<ModelStreamChunk> {
      if (step === 0) {
        yield { kind: 'tool_call_complete', callId: 'c1', toolName: 'test_mutate', arguments: { value: 'a' } }
        step += 1
        yield { kind: 'completed', stopReason: 'tool_calls' }
      } else if (step === 1) {
        yield { kind: 'tool_call_complete', callId: 'c2', toolName: 'test_mutate', arguments: { value: 'b' } }
        step += 1
        yield { kind: 'completed', stopReason: 'tool_calls' }
      } else {
        yield { kind: 'assistant_text_delta', text: 'Done.' }
        yield { kind: 'completed', stopReason: 'stop' }
      }
    }
  }
}

function mutationThenReadModel(): ModelClient {
  let step = 0
  return {
    model: 'test-model',
    provider: 'test',
    stream: async function* (): AsyncGenerator<ModelStreamChunk> {
      if (step === 0) {
        yield { kind: 'tool_call_complete', callId: 'cm', toolName: 'test_mutate', arguments: { value: 'x' } }
        step += 1
        yield { kind: 'completed', stopReason: 'tool_calls' }
      } else if (step === 1) {
        yield { kind: 'tool_call_complete', callId: 'cr', toolName: 'test_readonly', arguments: { value: 'y' } }
        step += 1
        yield { kind: 'completed', stopReason: 'tool_calls' }
      } else {
        yield { kind: 'assistant_text_delta', text: 'Done.' }
        yield { kind: 'completed', stopReason: 'stop' }
      }
    }
  }
}

function buildSharedStores() {
  const bus = new InMemoryEventBus()
  const threadStore = new InMemoryThreadStore()
  const sessionStore = new InMemorySessionStore()
  const checkpointStore = new InMemoryCheckpointStore()
  const ids = new SequentialIdGenerator()
  let now = 1_700_000_000_000
  const nowIso = () => new Date((now += 1000)).toISOString()
  const allocateSeq = (tid: string) => bus.allocateSeq(tid)
  const events = new RuntimeEventRecorder({ eventBus: bus, sessionStore, allocateSeq, nowIso })
  const svc = new CheckpointService({ checkpointStore, threadStore, sessionStore, events, ids, nowIso, maxPerThread: 20, maxTotal: 200 })
  return { bus, threadStore, sessionStore, checkpointStore, ids, nowIso, allocateSeq, events, checkpointService: svc }
}

function buildOpts(overrides: Partial<AgentLoopOptions> = {}): AgentLoopOptions {
  const s = buildSharedStores()
  const prefix = createImmutablePrefix({ systemPrompt: 'Test.', pinnedConstraints: [] })
  const turnService = new TurnService({ threadStore: s.threadStore, sessionStore: s.sessionStore, events: s.events, inflight: new InflightTracker(), steering: new SteeringQueue(), compactor: new ContextCompactor({}), ids: s.ids, nowIso: s.nowIso })
  return {
    threadStore: s.threadStore, sessionStore: s.sessionStore,
    approvalGate: new InMemoryApprovalGate(), userInputGate: new InMemoryUserInputGate(),
    model: TEXT_ONLY_MODEL, toolHost: new LocalToolHost({ tools: TEST_TOOLS, readTracker: true }),
    usage: new UsageService(), events: s.events, turns: turnService,
    inflight: new InflightTracker(), steering: new SteeringQueue(), compactor: new ContextCompactor({}),
    prefix, ids: s.ids, nowIso: s.nowIso,
    checkpointService: s.checkpointService,
    ...overrides
  }
}

describe('Checkpoint-loop integration', () => {
  it('plan mode: no checkpoint even with mutating tool', async () => {
    const o = buildOpts()
    const ts = new ThreadService({ threadStore: o.threadStore, sessionStore: o.sessionStore, events: o.events, ids: o.ids, nowIso: o.nowIso })
    const thr = await ts.create({ workspace: '/tmp/pw', model: 'test-model', mode: 'plan' }, { id: 'tp1', title: 'Plan' })
    const sr = await o.turns.startTurn({ threadId: thr.id, request: { prompt: 'X', mode: 'plan' } })
    const loop = new AgentLoop({ ...o, model: writeToolModel() })
    await loop.runTurn(thr.id, sr.turnId)
    // Use the shared checkpoint store from buildOpts
    const cps = await o.checkpointService!.list(thr.id)
    expect(cps.length).toBe(0)
  })

  it('execute mode: checkpoint before first mutating tool call', async () => {
    const o = buildOpts()
    const ts = new ThreadService({ threadStore: o.threadStore, sessionStore: o.sessionStore, events: o.events, ids: o.ids, nowIso: o.nowIso })
    const thr = await ts.create({ workspace: '/tmp/aw', model: 'test-model', mode: 'agent' }, { id: 'ta1', title: 'Agent' })
    const sr = await o.turns.startTurn({ threadId: thr.id, request: { prompt: 'X', mode: 'agent' } })
    const loop = new AgentLoop({ ...o, model: writeToolModel() })
    await loop.runTurn(thr.id, sr.turnId)
    const list = await o.checkpointService!.list(thr.id)
    expect(list.length).toBe(1)
    expect(list[0].trigger).toBe('pre_mutation')
  })

  it('no checkpoint for read-only-only turns', async () => {
    const o = buildOpts()
    const ts = new ThreadService({ threadStore: o.threadStore, sessionStore: o.sessionStore, events: o.events, ids: o.ids, nowIso: o.nowIso })
    const thr = await ts.create({ workspace: '/tmp/rw', model: 'test-model', mode: 'agent' }, { id: 'tr1', title: 'RO' })
    const sr = await o.turns.startTurn({ threadId: thr.id, request: { prompt: 'X', mode: 'agent' } })
    const loop = new AgentLoop({ ...o, model: TEXT_ONLY_MODEL })
    await loop.runTurn(thr.id, sr.turnId)
    const cps = await o.checkpointService!.list(thr.id)
    expect(cps.length).toBe(0)
  })

  it('single checkpoint per turn with multiple mutations', async () => {
    const o = buildOpts()
    const ts = new ThreadService({ threadStore: o.threadStore, sessionStore: o.sessionStore, events: o.events, ids: o.ids, nowIso: o.nowIso })
    const thr = await ts.create({ workspace: '/tmp/mw', model: 'test-model', mode: 'agent' }, { id: 'tm1', title: 'Multi' })
    const sr = await o.turns.startTurn({ threadId: thr.id, request: { prompt: 'X', mode: 'agent' } })
    const loop = new AgentLoop({ ...o, model: twoMutationModel() })
    await loop.runTurn(thr.id, sr.turnId)
    const list = await o.checkpointService!.list(thr.id)
    expect(list.length).toBe(1)
  })

  it('no re-trigger on read-only after mutation', async () => {
    const o = buildOpts()
    const ts = new ThreadService({ threadStore: o.threadStore, sessionStore: o.sessionStore, events: o.events, ids: o.ids, nowIso: o.nowIso })
    const thr = await ts.create({ workspace: '/tmp/pw2', model: 'test-model', mode: 'agent' }, { id: 'tp2', title: 'Phase' })
    const sr = await o.turns.startTurn({ threadId: thr.id, request: { prompt: 'X', mode: 'agent' } })
    const loop = new AgentLoop({ ...o, model: mutationThenReadModel() })
    await loop.runTurn(thr.id, sr.turnId)
    const list = await o.checkpointService!.list(thr.id)
    expect(list.length).toBe(1)
  })
})
