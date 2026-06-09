import { describe, expect, it } from 'vitest'
import { selectConfiguredAutoRoute } from './auto-model-router.js'

const candidates = [
  {
    id: 'deepseek-v4-flash',
    providerId: 'deepseek',
    contextWindowTokens: 1_000_000,
    supportsToolCalling: true,
    supportsReasoning: false,
    pricingUsdPerMillion: {
      input: 0.14,
      output: 0.28,
      cacheRead: 0.0028
    },
    recommendedUse: ['chat', 'status']
  },
  {
    id: 'deepseek-v4-pro',
    providerId: 'deepseek',
    contextWindowTokens: 1_000_000,
    supportsToolCalling: true,
    supportsReasoning: true,
    pricingUsdPerMillion: {
      input: 0.435,
      output: 0.87,
      cacheRead: 0.003625
    },
    recommendedUse: ['coding', 'debugging', 'review']
  },
  {
    id: 'openai/gpt-4.1-mini',
    providerId: 'openrouter',
    contextWindowTokens: 1_047_576,
    supportsToolCalling: true,
    supportsReasoning: true,
    pricingUsdPerMillion: {
      input: 0.4,
      output: 1.6,
      cacheRead: 0.1
    },
    recommendedUse: ['coding', 'review', 'research']
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    providerId: 'openrouter',
    contextWindowTokens: 128_000,
    supportsToolCalling: false,
    supportsReasoning: false,
    pricingUsdPerMillion: {
      input: 0.05,
      output: 0.05
    },
    recommendedUse: ['chat']
  }
]

describe('configured auto model routing', () => {
  it('preserves DeepSeek flash for cheap status turns', () => {
    const route = selectConfiguredAutoRoute({
      candidates,
      latestRequest: 'quick status please',
      estimatedInputTokens: 800,
      requiresTools: false,
      reasoningNeed: 'low',
      taskType: 'status'
    })

    expect(route).toMatchObject({
      model: 'deepseek-v4-flash',
      source: 'configured-heuristic'
    })
  })

  it('chooses the cheapest capable reasoning model for coding review work', () => {
    const route = selectConfiguredAutoRoute({
      candidates,
      latestRequest: 'review the architecture and implement the fix with tests',
      estimatedInputTokens: 80_000,
      requiresTools: true,
      reasoningNeed: 'high',
      taskType: 'review'
    })

    expect(route).toMatchObject({
      model: 'openai/gpt-4.1-mini',
      reasoningEffort: 'high',
      source: 'configured-heuristic'
    })
  })

  it('excludes models that cannot fit the context or required tools', () => {
    const route = selectConfiguredAutoRoute({
      candidates,
      latestRequest: 'analyze this long tool-heavy transcript',
      estimatedInputTokens: 900_000,
      requiresTools: true,
      reasoningNeed: 'max',
      taskType: 'research'
    })

    expect(route.model).not.toBe('meta-llama/llama-3.3-70b-instruct')
    expect(route.model).toBe('deepseek-v4-pro')
  })
})
