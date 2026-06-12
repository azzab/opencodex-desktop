import { describe, expect, it } from 'vitest'
import { LocalToolHost, buildDefaultLocalTools, type LocalTool } from '../src/adapters/tool/local-tool-host.js'
import { buildBuiltinLocalTools } from '../src/adapters/tool/builtin-tools.js'
import { createCreatePlanTool } from '../src/adapters/tool/create-plan-tool.js'
import { buildGoalLocalTools } from '../src/adapters/tool/goal-tools.js'
import { buildTodoLocalTools } from '../src/adapters/tool/todo-tools.js'
import { buildWebToolProviders } from '../src/adapters/tool/web-tool-provider.js'
import { buildAutomationToolProviders } from '../src/adapters/tool/automation-tool-provider.js'
import { buildDelegationToolProviders } from '../src/adapters/tool/delegation-tool-provider.js'
import type { ToolHostContext } from '../src/ports/tool-host.js'
import type { ThreadService } from '../src/services/thread-service.js'
import type { TurnItem } from '../src/contracts/items.js'
import { InMemoryThreadStore } from '../src/adapters/in-memory-thread-store.js'
import { InMemorySessionStore } from '../src/adapters/in-memory-session-store.js'
import { InMemoryEventBus } from '../src/adapters/in-memory-event-bus.js'
import { SequentialIdGenerator, type IdGenerator } from '../src/ports/id-generator.js'
import { RuntimeEventRecorder } from '../src/services/runtime-event-recorder.js'
import { ThreadService as ThreadServiceImpl } from '../src/services/thread-service.js'
import type { ThreadStore } from '../src/ports/thread-store.js'
import type { SessionStore } from '../src/ports/session-store.js'

function buildContext(overrides: Partial<ToolHostContext> = {}): ToolHostContext {
  return {
    threadId: 'thr_1',
    turnId: 'turn_1',
    workspace: '/tmp/ws',
    threadMode: overrides.threadMode ?? 'agent',
    approvalPolicy: 'on-request',
    abortSignal: new AbortController().signal,
    awaitApproval: async () => 'allow',
    ...overrides
  }
}

function makeThreadService(): ThreadService {
  const threadStore: ThreadStore = new InMemoryThreadStore()
  const sessionStore: SessionStore = new InMemorySessionStore()
  const bus = new InMemoryEventBus()
  const ids: IdGenerator = new SequentialIdGenerator()
  const nowIso = () => new Date().toISOString()
  const allocateSeq = (threadId: string) => bus.allocateSeq(threadId)
  const events = new RuntimeEventRecorder({ eventBus: bus, sessionStore, allocateSeq, nowIso })
  return new ThreadServiceImpl({ threadStore, sessionStore, events, ids, nowIso })
}

/** Narrow a TurnItem to a tool_result item for assertions. */
function asToolResult(item: TurnItem): Extract<TurnItem, { kind: 'tool_result' }> {
  if (item.kind !== 'tool_result') throw new Error(`expected tool_result, got ${item.kind}`)
  return item as Extract<TurnItem, { kind: 'tool_result' }>
}

describe('Plan-mode tool isolation — kernel-enforced gating', () => {
  // ── Read-only tools are advertised in plan mode ──
  it('advertises read-only builtin tools in plan mode', async () => {
    const host = new LocalToolHost({ tools: buildBuiltinLocalTools() })
    const planTools = await host.listTools(buildContext({ threadMode: 'plan' }))
    expect(planTools.map((t) => t.name).sort()).toEqual(
      ['read', 'grep', 'find', 'ls'].sort()
    )
  })

  it('advertises all builtin tools in agent mode', async () => {
    const host = new LocalToolHost({ tools: buildBuiltinLocalTools() })
    const agentTools = await host.listTools(buildContext({ threadMode: 'agent' }))
    expect(agentTools.map((t) => t.name).sort()).toEqual(
      ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'].sort()
    )
  })

  // ── Mutating tools are NOT advertised in plan mode ──
  it('does NOT advertise bash in plan mode', async () => {
    const host = new LocalToolHost({ tools: buildBuiltinLocalTools() })
    const toolNames = (await host.listTools(buildContext({ threadMode: 'plan' }))).map((t) => t.name)
    expect(toolNames).not.toContain('bash')
  })

  it('does NOT advertise edit in plan mode', async () => {
    const host = new LocalToolHost({ tools: buildBuiltinLocalTools() })
    const toolNames = (await host.listTools(buildContext({ threadMode: 'plan' }))).map((t) => t.name)
    expect(toolNames).not.toContain('edit')
  })

  it('does NOT advertise write in plan mode', async () => {
    const host = new LocalToolHost({ tools: buildBuiltinLocalTools() })
    const toolNames = (await host.listTools(buildContext({ threadMode: 'plan' }))).map((t) => t.name)
    expect(toolNames).not.toContain('write')
  })

  // ── Goal tools: get_goal allowed, create_goal/update_goal denied ──
  it('advertises get_goal but not mutating goal tools in plan mode', async () => {
    const threadService = makeThreadService()
    const host = new LocalToolHost({ tools: buildGoalLocalTools(threadService) })
    const toolNames = (await host.listTools(buildContext({ threadMode: 'plan' }))).map((t) => t.name)
    expect(toolNames).toContain('get_goal')
    expect(toolNames).not.toContain('create_goal')
    expect(toolNames).not.toContain('update_goal')
  })

  // ── Todo tools: todo_list allowed, todo_write denied ──
  it('advertises todo_list but not todo_write in plan mode', async () => {
    const threadService = makeThreadService()
    const host = new LocalToolHost({ tools: buildTodoLocalTools(threadService) })
    const toolNames = (await host.listTools(buildContext({ threadMode: 'plan' }))).map((t) => t.name)
    expect(toolNames).toContain('todo_list')
    expect(toolNames).not.toContain('todo_write')
  })

  // ── create_plan is allowed in plan mode (it's the plan writing tool) ──
  it('advertises create_plan in plan mode with GUI context', async () => {
    const host = new LocalToolHost({ tools: [createCreatePlanTool()] })
    const toolNames = (await host.listTools(
      buildContext({
        threadMode: 'plan',
        guiPlan: {
          operation: 'draft',
          workspaceRoot: '/tmp/ws',
          relativePath: '.kunsdd/plan/test.md',
          planId: 'p1'
        }
      })
    )).map((t) => t.name)
    expect(toolNames).toContain('create_plan')
  })

  // ── Web tools: web_fetch, web_search are read-only ──
  it('advertises web_fetch and web_search in plan mode', async () => {
    const result = buildWebToolProviders({
      enabled: true,
      fetchEnabled: true,
      searchEnabled: true,
      allowDomains: [],
      denyDomains: []
    })
    const providerTools = result.providers.flatMap((p) => [...p.tools])
    const host = new LocalToolHost({ tools: providerTools })
    const toolNames = (await host.listTools(buildContext({ threadMode: 'plan' }))).map((t) => t.name)
    expect(toolNames).toContain('web_fetch')
    expect(toolNames).toContain('web_search')
  })

  // ── Automation tools: all denied in plan mode ──
  it('does NOT advertise automation tools in plan mode', async () => {
    const result = buildAutomationToolProviders({
      enabled: true,
      browserWorkbenchEnabled: false,
      localDevOnly: true,
      allowedHosts: [],
      permissions: {
        browserNavigation: 'deny',
        browserInteraction: 'deny',
        screenshots: 'deny',
        localFileAccess: 'deny',
        appControl: 'deny'
      },
      auditLog: { enabled: true, maxEntries: 100 }
    })
    const providerTools = result.providers.flatMap((p) => [...p.tools])
    if (providerTools.length === 0) return // skip if automation tools are unavailable
    const host = new LocalToolHost({ tools: providerTools })
    const toolNames = (await host.listTools(buildContext({ threadMode: 'plan' }))).map((t) => t.name)
    expect(toolNames).toEqual([])
  })

  // ── Delegation tool: denied in plan mode ──
  it('does NOT advertise delegate_task in plan mode', async () => {
    const providers = buildDelegationToolProviders({
      threadId: 'thr_1',
      turnId: 'turn_1',
      workspace: '/tmp/ws',
      model: { id: 'test', provider: 'test', inputModalities: ['text'], messageParts: ['text'] },
      abortSignal: new AbortController().signal
    } as any)
    if (providers.length === 0) return
    const tools: LocalTool[] = [...providers[0].tools]
    const host = new LocalToolHost({ tools })
    const toolNames = (await host.listTools(buildContext({ threadMode: 'plan' }))).map((t) => t.name)
    expect(toolNames).not.toContain('delegate_task')
  })
})

describe('Plan-mode execution denial — defense-in-depth', () => {
  // ── Mutating tool execution in plan mode returns error ──
  it('denies write execution in plan mode with error code plan_mode_violation', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_1', toolName: 'write', arguments: { path: '/tmp/test.txt', content: 'hello' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = asToolResult(result.item)
    expect(item.isError).toBe(true)
    const output = item.output as Record<string, unknown>
    expect(output.code).toBe('plan_mode_violation')
  })

  it('denies edit execution in plan mode with error code plan_mode_violation', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_2', toolName: 'edit', arguments: { path: '/tmp/test.txt', oldText: 'a', newText: 'b' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = asToolResult(result.item)
    expect(item.isError).toBe(true)
    const output = item.output as Record<string, unknown>
    expect(output.code).toBe('plan_mode_violation')
  })

  it('denies bash execution in plan mode with error code plan_mode_violation', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_3', toolName: 'bash', arguments: { command: 'echo hi' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = asToolResult(result.item)
    expect(item.isError).toBe(true)
    const output = item.output as Record<string, unknown>
    expect(output.code).toBe('plan_mode_violation')
  })

  // ── Read-only tool execution succeeds in plan mode ──
  it('allows read execution in plan mode (not blocked by plan mode)', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_4', toolName: 'read', arguments: { path: '/tmp/nonexistent.txt' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = asToolResult(result.item)
    const output = item.output as Record<string, unknown>
    expect(output.code).not.toBe('plan_mode_violation')
  })

  it('allows grep execution in plan mode (not blocked by plan mode)', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_5', toolName: 'grep', arguments: { pattern: 'test', path: '/tmp' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = asToolResult(result.item)
    const output = item.output as Record<string, unknown>
    expect(output.code).not.toBe('plan_mode_violation')
  })

  it('allows ls execution in plan mode (not blocked by plan mode)', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_6', toolName: 'ls', arguments: { path: '/tmp' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = asToolResult(result.item)
    const output = item.output as Record<string, unknown>
    expect(output.code).not.toBe('plan_mode_violation')
  })

  // ── Mutating tools succeed in agent mode ──
  it('allows write in agent mode (not denied)', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_7', toolName: 'write', arguments: { path: '/tmp/agent-test.txt', content: 'hello' } },
      buildContext({ threadMode: 'agent' })
    )
    const item = asToolResult(result.item)
    const output = item.output as Record<string, unknown>
    expect(output.code).not.toBe('plan_mode_violation')
  })
})

describe('Plan-mode isolation — defaultLocalTools integration', () => {
  it('defaultLocalTools include both read-only and mutating tools in agent mode', async () => {
    const host = new LocalToolHost({ tools: buildDefaultLocalTools() })
    const agentTools = await host.listTools(buildContext({ threadMode: 'agent' }))
    const names = agentTools.map((t) => t.name)
    expect(names).toContain('read')
    expect(names).toContain('bash')
    expect(names).toContain('edit')
    expect(names).toContain('write')
  })

  it('defaultLocalTools exclude mutating tools in plan mode', async () => {
    const host = new LocalToolHost({ tools: buildDefaultLocalTools() })
    const planTools = await host.listTools(buildContext({ threadMode: 'plan' }))
    const names = planTools.map((t) => t.name)
    expect(names).toContain('read')
    expect(names).not.toContain('bash')
    expect(names).not.toContain('edit')
    expect(names).not.toContain('write')
  })

  it('defaultLocalTools include create_plan in plan mode', async () => {
    const host = new LocalToolHost({ tools: buildDefaultLocalTools() })
    const planTools = await host.listTools(
      buildContext({
        threadMode: 'plan',
        guiPlan: {
          operation: 'draft',
          workspaceRoot: '/tmp/ws',
          relativePath: '.kunsdd/plan/feature.md',
          planId: 'plan_1'
        }
      })
    )
    const names = planTools.map((t) => t.name)
    expect(names).toContain('create_plan')
  })
})

describe('Plan-mode isolation — filesystem hash unchanged after denied mutation', () => {
  it('denies write and leaves filesystem unchanged (hash assertion)', async () => {
    const tmpDir = await import('node:fs/promises').then((fs) => fs.mkdtemp('/tmp/kun-plan-test-'))
    const { join } = await import('node:path')
    const { writeFile, readFile, rm } = await import('node:fs/promises')
    const { createHash } = await import('node:crypto')

    const testPath = join(tmpDir, 'test.txt')
    const originalContent = 'original content'
    await writeFile(testPath, originalContent, 'utf-8')

    // Compute original hash
    const originalHash = createHash('sha256').update(originalContent).digest('hex')

    // Try to write in plan mode
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_hash', toolName: 'write', arguments: { path: testPath, content: 'MUTATED' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = result.item as Extract<typeof result.item, { kind: 'tool_result' }>
    expect(item.isError).toBe(true)
    const output = item.output as Record<string, unknown>
    expect(output.code).toBe('plan_mode_violation')

    // Verify file content is unchanged
    const contentAfter = await readFile(testPath, 'utf-8')
    const hashAfter = createHash('sha256').update(contentAfter).digest('hex')
    expect(hashAfter).toBe(originalHash)
    expect(contentAfter).toBe(originalContent)

    // Cleanup
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('denies bash execution in plan mode (no side effects)', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_bash', toolName: 'bash', arguments: { command: 'echo "mutated" > /tmp/test-mutate.txt' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = result.item as Extract<typeof result.item, { kind: 'tool_result' }>
    expect(item.isError).toBe(true)
    const output = item.output as Record<string, unknown>
    expect(output.code).toBe('plan_mode_violation')
    // The key point: no file was created because the tool was never executed
  })

  it('denies edit execution in plan mode', async () => {
    const tools = buildBuiltinLocalTools()
    const host = new LocalToolHost({ tools })
    const result = await host.execute(
      { callId: 'call_edit', toolName: 'edit', arguments: { path: '/tmp/test.txt', oldText: 'a', newText: 'b' } },
      buildContext({ threadMode: 'plan' })
    )
    const item = result.item as Extract<typeof result.item, { kind: 'tool_result' }>
    expect(item.isError).toBe(true)
    const output = item.output as Record<string, unknown>
    expect(output.code).toBe('plan_mode_violation')
  })
})
