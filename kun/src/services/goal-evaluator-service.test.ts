import { describe, expect, it, beforeEach } from 'vitest'
import { ToolFreeGoalEvaluator } from './goal-evaluator-service.js'
import type { GoalEvalConfig } from '../contracts/automations.js'
import type { GoalEvaluatorContext } from '../ports/goal-evaluator.js'
import type { GoalEvaluator } from '../ports/goal-evaluator.js'
import { SequentialIdGenerator } from '../ports/id-generator.js'
import type { ModelClient, ModelStreamChunk, ModelRequest } from '../ports/model-client.js'

function createMockModel(
  responses: string[]
): ModelClient & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = []
  let callIndex = -1
  return {
    provider: 'mock',
    get model(): string {
      return 'mock-evaluator'
    },
    requests,
    async *stream(request: ModelRequest): AsyncGenerator<ModelStreamChunk> {
      requests.push(request)
      callIndex += 1
      const text = responses[callIndex] ?? responses[responses.length - 1] ?? ''

      // Verify tool-free: tools should be empty array
      expect(request.tools).toEqual([])

      yield { kind: 'assistant_text_delta', text }
      yield { kind: 'completed', stopReason: 'stop' }
    }
  } as ModelClient & { requests: ModelRequest[] }
}

const defaultConfig: GoalEvalConfig = {
  enabled: true,
  model: 'deepseek-v4-flash',
  maxContinuationTurns: 50,
  blockedRetryAfterTurns: 3,
  toolFree: true,
  budget: {
    maxIterations: 5,
    maxTokensPerEval: 512,
    maxCostUsdPerEval: 0.01,
    totalMaxIterations: 20,
    totalMaxTokens: 5000,
    totalMaxCostUsd: 0.5
  }
}

const defaultContext: GoalEvaluatorContext = {
  threadId: 'thread-1',
  objective: 'Create a React component that displays a counter.',
  recentTranscript: 'I created the Counter.tsx file with useState hook.',
  tokensUsed: 100,
  tokenBudget: 1000,
  costUsedUsd: 0.01,
  hadToolCalls: true,
  iterationCount: 1,
  evalTokensUsed: 0,
  evalCostUsd: 0
}

function makeEvaluator(responses: string[] = []): { evaluator: GoalEvaluator; model: ReturnType<typeof createMockModel>; ids: SequentialIdGenerator } {
  const ids = new SequentialIdGenerator()
  const model = createMockModel(responses)
  const evaluator = new ToolFreeGoalEvaluator(model as ModelClient, ids, () => new Date().toISOString())
  return { evaluator, model, ids }
}

describe('ToolFreeGoalEvaluator', () => {
  let evaluator: GoalEvaluator
  let model: ReturnType<typeof createMockModel>

  beforeEach(() => {
    const built = makeEvaluator()
    evaluator = built.evaluator
    model = built.model
  })

  describe('evaluate', () => {
    it('returns done when model says done', async () => {
      const built = makeEvaluator(['{"decision":"done","reason":"Counter component implemented","confidence":0.9,"evidence":["Counter.tsx created"],"needsAttention":false}'])
      const result = await built.evaluator.evaluate(defaultContext, defaultConfig)
      expect(result.decision).toBe('done')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result.needsAttention).toBe(false)
    })

    it('returns continue when model says continue', async () => {
      const built = makeEvaluator(['{"decision":"continue","reason":"Still working on tests","confidence":0.7}'])
      const result = await built.evaluator.evaluate(defaultContext, defaultConfig)
      expect(result.decision).toBe('continue')
    })

    it('returns blocked when model says blocked', async () => {
      const built = makeEvaluator(['{"decision":"blocked","reason":"Need API key from user","confidence":0.95,"needsAttention":true}'])
      const result = await built.evaluator.evaluate(defaultContext, defaultConfig)
      expect(result.decision).toBe('blocked')
      expect(result.needsAttention).toBe(true)
    })

    it('tools are empty (tool-free assertion)', async () => {
      const built = makeEvaluator(['{"decision":"done","reason":"done","confidence":1}'])
      await built.evaluator.evaluate(defaultContext, defaultConfig)
      expect(built.model.requests.length).toBeGreaterThan(0)
      const request = built.model.requests[0]
      expect(request).toBeDefined()
      expect(request!.tools).toEqual([])
      expect(request!.tools.length).toBe(0)
    })

    it('defaults to continue on parse failure', async () => {
      const built = makeEvaluator(['not json at all'])
      const result = await built.evaluator.evaluate(defaultContext, defaultConfig)
      expect(result.decision).toBe('continue')
      expect(result.confidence).toBeLessThanOrEqual(0.5)
    })

    it('defaults to continue on model error', async () => {
      const brokenModel = {
        provider: 'broken',
        model: 'broken',
        async *stream(): AsyncGenerator<ModelStreamChunk> {
          yield { kind: 'error', message: 'Model unavailable', code: '500' }
        }
      } as unknown as ModelClient
      const ids = new SequentialIdGenerator()
      const brokenEvaluator = new ToolFreeGoalEvaluator(brokenModel, ids, () => new Date().toISOString())
      const result = await brokenEvaluator.evaluate(defaultContext, defaultConfig)
      expect(result.decision).toBe('continue')
      expect(result.needsAttention).toBe(true)
    })
  })

  describe('checkBudget', () => {
    it('allows when under budget', () => {
      const result = evaluator.checkBudget(defaultContext, defaultConfig)
      expect(result.exhausted).toBe(false)
      expect(result.kind).toBe('none')
    })

    it('exhausts on iteration cap', () => {
      const context: GoalEvaluatorContext = { ...defaultContext, iterationCount: 25 }
      const result = evaluator.checkBudget(context, defaultConfig)
      expect(result.exhausted).toBe(true)
      expect(result.kind).toBe('iteration_cap')
    })

    it('exhausts on token cap', () => {
      const context: GoalEvaluatorContext = { ...defaultContext, evalTokensUsed: 6000 }
      const result = evaluator.checkBudget(context, defaultConfig)
      expect(result.exhausted).toBe(true)
      expect(result.kind).toBe('token_cap')
    })

    it('exhausts on cost cap', () => {
      const context: GoalEvaluatorContext = { ...defaultContext, evalCostUsd: 1.0 }
      const result = evaluator.checkBudget(context, defaultConfig)
      expect(result.exhausted).toBe(true)
      expect(result.kind).toBe('cost_cap')
    })
  })

  describe('recordAudit and auditEvents', () => {
    it('records and retrieves audit events', async () => {
      await evaluator.recordAudit({
        threadId: 'thread-1',
        turnId: 'turn-1',
        iteration: 1,
        decision: 'continue',
        reason: 'test',
        budgetExhausted: false,
        budgetKind: 'none',
        tokensUsed: 50,
        costUsd: 0.001,
        timestamp: new Date().toISOString()
      })
      const events = await evaluator.auditEvents('thread-1')
      expect(events.length).toBe(1)
      expect(events[0]!.decision).toBe('continue')
    })

    it('returns empty array for unknown thread', async () => {
      const events = await evaluator.auditEvents('unknown-thread')
      expect(events).toEqual([])
    })

    it('records audit with nonzero cost for budget cap enforcement', async () => {
      const audit = {
        threadId: 'thread-1',
        turnId: 'turn-2',
        iteration: 5,
        decision: 'blocked' as const,
        reason: 'Cost cap exceeded',
        budgetExhausted: true,
        budgetKind: 'cost_cap' as const,
        tokensUsed: 1200,
        costUsd: 0.75,
        timestamp: new Date().toISOString()
      }
      await evaluator.recordAudit(audit)
      const events = await evaluator.auditEvents('thread-1')
      expect(events.length).toBeGreaterThanOrEqual(1)
      const last = events[events.length - 1]!
      expect(last.decision).toBe('blocked')
      expect(last.budgetExhausted).toBe(true)
      expect(last.budgetKind).toBe('cost_cap')
      expect(last.costUsd).toBeGreaterThan(0)
    })

    it('records audit with iteration cap enforcement', async () => {
      const audit = {
        threadId: 'thread-1',
        turnId: 'turn-3',
        iteration: 21,
        decision: 'blocked' as const,
        reason: 'Iteration cap exceeded',
        budgetExhausted: true,
        budgetKind: 'iteration_cap' as const,
        tokensUsed: 800,
        costUsd: 0.05,
        timestamp: new Date().toISOString()
      }
      await evaluator.recordAudit(audit)
      const events = await evaluator.auditEvents('thread-1')
      expect(events.length).toBeGreaterThanOrEqual(1)
      const last = events[events.length - 1]!
      expect(last.decision).toBe('blocked')
      expect(last.budgetExhausted).toBe(true)
      expect(last.budgetKind).toBe('iteration_cap')
    })
  })

  describe('consumer cost and iteration in evaluator prompt', () => {
    it('includes nonzero costUsedUsd in the prompt', async () => {
      const built = makeEvaluator(['{"decision":"continue","reason":"budget low but work remains","confidence":0.8,"needsAttention":true}'])
      const ctx: GoalEvaluatorContext = {
        ...defaultContext,
        costUsedUsd: 0.42,
        iterationCount: 7
      }
      await built.evaluator.evaluate(ctx, defaultConfig)
      const request = built.model.requests[0]!
      const promptText = (request.history?.[0] as { text?: string } | undefined)?.text ?? ''
      expect(promptText).toContain('0.4200')
      expect(promptText).toContain('Iteration: 7')
    })

    it('shows zero cost in prompt when no usage yet', async () => {
      const built = makeEvaluator(['{"decision":"continue","reason":"just started","confidence":0.5}'])
      const ctx: GoalEvaluatorContext = {
        ...defaultContext,
        costUsedUsd: 0,
        iterationCount: 1
      }
      await built.evaluator.evaluate(ctx, defaultConfig)
      const request = built.model.requests[0]!
      const promptText = (request.history?.[0] as { text?: string } | undefined)?.text ?? ''
      expect(promptText).toContain('0.0000')
      expect(promptText).toContain('Iteration: 1')
    })
  })

  describe('iteration cap across multiple evaluations', () => {
    it('iterationCount > totalMaxIterations exhausts budget', () => {
      const ctx: GoalEvaluatorContext = {
        ...defaultContext,
        iterationCount: 21 // > totalMaxIterations: 20
      }
      const result = evaluator.checkBudget(ctx, defaultConfig)
      expect(result.exhausted).toBe(true)
      expect(result.kind).toBe('iteration_cap')
    })

    it('iterationCount at exactly cap exhausts budget', () => {
      const ctx: GoalEvaluatorContext = {
        ...defaultContext,
        iterationCount: 20 // == totalMaxIterations: 20
      }
      const result = evaluator.checkBudget(ctx, defaultConfig)
      expect(result.exhausted).toBe(true)
      expect(result.kind).toBe('iteration_cap')
    })

    it('iterationCount one below cap does not exhaust', () => {
      const ctx: GoalEvaluatorContext = {
        ...defaultContext,
        iterationCount: 19 // < totalMaxIterations: 20
      }
      const result = evaluator.checkBudget(ctx, defaultConfig)
      expect(result.exhausted).toBe(false)
    })

    it('costUsedUsd above totalMaxCostUsd causes cost cap (consumer cost matters)', () => {
      // When evalCostUsd exceeds totalMaxCostUsd, the evaluator budget is exhausted
      const ctx: GoalEvaluatorContext = {
        ...defaultContext,
        evalCostUsd: 1.25 // > totalMaxCostUsd: 0.5
      }
      const result = evaluator.checkBudget(ctx, defaultConfig)
      expect(result.exhausted).toBe(true)
      expect(result.kind).toBe('cost_cap')
    })

    it('costUsedUsd just at cap exhausts', () => {
      const ctx: GoalEvaluatorContext = {
        ...defaultContext,
        evalCostUsd: 0.5 // == totalMaxCostUsd: 0.5
      }
      const result = evaluator.checkBudget(ctx, defaultConfig)
      expect(result.exhausted).toBe(true)
      expect(result.kind).toBe('cost_cap')
    })

    it('costUsedUsd just below cap does not exhaust', () => {
      const ctx: GoalEvaluatorContext = {
        ...defaultContext,
        evalCostUsd: 0.49 // < totalMaxCostUsd: 0.5
      }
      const result = evaluator.checkBudget(ctx, defaultConfig)
      expect(result.exhausted).toBe(false)
    })
  })
})
