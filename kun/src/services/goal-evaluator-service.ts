import type { GoalEvaluator, GoalEvaluatorContext } from '../ports/goal-evaluator.js'
import type { ModelClient } from '../ports/model-client.js'
import type { IdGenerator } from '../ports/id-generator.js'
import type {
  GoalEvalConfig,
  GoalEvalResult,
  GoalEvalAuditEvent,
  GoalEvalDecision
} from '../contracts/automations.js'
import { makeUserItem } from '../domain/item.js'

export class ToolFreeGoalEvaluator implements GoalEvaluator {
  private readonly audits = new Map<string, GoalEvalAuditEvent[]>()

  constructor(
    private readonly model: ModelClient,
    private readonly ids: IdGenerator,
    private readonly nowIso: () => string
  ) {}

  async evaluate(
    context: GoalEvaluatorContext,
    config: GoalEvalConfig
  ): Promise<GoalEvalResult> {
    const prompt = buildGoalEvalPrompt(context)
    const systemPrompt = buildGoalEvalSystemPrompt()

    let text = ''
    try {
      const requestItem = makeUserItem({
        id: this.ids.next('goal_eval_req'),
        turnId: context.threadId,
        threadId: context.threadId,
        text: prompt
      })

      const abortController = new AbortController()
      for await (const chunk of this.model.stream({
        threadId: context.threadId,
        turnId: context.threadId,
        model: config.model,
        systemPrompt,
        prefix: [],
        history: [requestItem],
        tools: [], // TOOL-FREE: no tools registered
        stream: true,
        maxTokens: config.budget.maxTokensPerEval,
        temperature: 0,
        reasoningEffort: 'off',
        abortSignal: abortController.signal
      })) {
        if (chunk.kind === 'assistant_text_delta') {
          text += chunk.text
        }
        if (chunk.kind === 'error') {
          text = ''
          break
        }
      }
    } catch {
      // Evaluation failure defaults to continue with low confidence
      return {
        decision: 'continue',
        reason: 'Goal evaluation failed; continuing by default.',
        confidence: 0.1,
        needsAttention: true
      }
    }

    const parsed = parseGoalEvalResponse(text)
    return parsed ?? {
      decision: 'continue',
      reason: 'Could not parse evaluator response; continuing by default.',
      confidence: 0.1,
      needsAttention: true
    }
  }

  checkBudget(
    context: GoalEvaluatorContext,
    config: GoalEvalConfig
  ): { exhausted: boolean; kind: GoalEvalAuditEvent['budgetKind'] } {
    if (context.iterationCount >= config.budget.totalMaxIterations) {
      return { exhausted: true, kind: 'iteration_cap' }
    }
    if (context.evalTokensUsed >= config.budget.totalMaxTokens) {
      return { exhausted: true, kind: 'token_cap' }
    }
    if (context.evalCostUsd >= config.budget.totalMaxCostUsd) {
      return { exhausted: true, kind: 'cost_cap' }
    }
    return { exhausted: false, kind: 'none' }
  }

  async recordAudit(event: GoalEvalAuditEvent): Promise<void> {
    const threadAudits = this.audits.get(event.threadId) ?? []
    threadAudits.push(event)
    if (threadAudits.length > 1000) {
      threadAudits.splice(0, threadAudits.length - 1000)
    }
    this.audits.set(event.threadId, threadAudits)
  }

  async auditEvents(threadId: string): Promise<GoalEvalAuditEvent[]> {
    return [...(this.audits.get(threadId) ?? [])]
  }
}

function buildGoalEvalSystemPrompt(): string {
  return [
    'You are a goal-completion evaluator. Your job is to judge whether a task is done, should continue, or is blocked.',
    'You have NO access to tools. You only see the transcript.',
    'Return ONLY a JSON object with this exact shape:',
    '{"decision":"done|continue|blocked","reason":"concise reason","confidence":0.0-1.0,"evidence":["fact1","fact2"],"needsAttention":false}',
    '',
    'Decision rules:',
    '- "done": the objective is demonstrably achieved with evidence in the transcript.',
    '- "continue": work is in progress with concrete forward motion; another turn is warranted.',
    '- "blocked": the same obstacle appeared 3+ times OR user input / external change is clearly needed. Do NOT block on the first obstacle.',
    '',
    'Confidence: 0 = pure guess, 1 = absolute certainty.',
    'Evidence: list key transcript facts supporting your decision (max 5).',
    'needsAttention: true if the user should be notified (budget warnings, repeated errors, irreversible action pending).',
    '',
    'No markdown. No prose outside the JSON.'
  ].join('\n')
}

function buildGoalEvalPrompt(context: GoalEvaluatorContext): string {
  const budgetInfo = context.tokenBudget == null
    ? 'No token budget set.'
    : `Token budget: ${context.tokensUsed} / ${context.tokenBudget} used.`
  return [
    `Objective: ${context.objective}`,
    '',
    `Iteration: ${context.iterationCount}`,
    budgetInfo,
    `Cost used so far: $${context.costUsedUsd.toFixed(4)}`,
    `Had tool calls this turn: ${context.hadToolCalls}`,
    '',
    'Recent transcript:',
    context.recentTranscript || '(empty)',
    '',
    'Evaluate: is this goal done, should it continue, or is it blocked?'
  ].join('\n')
}

function parseGoalEvalResponse(raw: string): GoalEvalResult | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Try to extract JSON from markdown fences
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed

  // Find the outermost JSON object
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null

    const decision = normalizeDecision(parsed.decision)
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim()
      : `Evaluator returned ${decision}.`
    const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5
    const evidence = Array.isArray(parsed.evidence)
      ? parsed.evidence.filter((e): e is string => typeof e === 'string').slice(0, 10)
      : undefined
    const needsAttention = typeof parsed.needsAttention === 'boolean'
      ? parsed.needsAttention
      : decision === 'blocked'

    return { decision, reason, confidence, evidence, needsAttention }
  } catch {
    return null
  }
}

function normalizeDecision(value: unknown): GoalEvalDecision {
  if (typeof value !== 'string') return 'continue'
  const lower = value.trim().toLowerCase()
  if (lower === 'done' || lower === 'complete' || lower === 'completed') return 'done'
  if (lower === 'blocked' || lower === 'stuck' || lower === 'block') return 'blocked'
  return 'continue'
}
