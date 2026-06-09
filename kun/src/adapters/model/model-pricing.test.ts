import { describe, expect, it } from 'vitest'
import {
  estimateModelCacheSavings,
  estimateModelUsageCost
} from './model-pricing.js'

describe('model pricing', () => {
  it('estimates OpenRouter usage with cache-read pricing when cache telemetry is present', () => {
    const cost = estimateModelUsageCost({
      model: 'openai/gpt-4.1-mini',
      pricingUsdPerMillion: {
        input: 0.4,
        output: 1.6,
        cacheRead: 0.1
      },
      cacheHitTokens: 200,
      cacheMissTokens: 800,
      outputTokens: 500
    })

    expect(cost).toEqual({
      costUsd: 0.00114
    })
  })

  it('uses input pricing for providers that do not expose separate cache-read pricing', () => {
    const cost = estimateModelUsageCost({
      model: 'some/openrouter-model',
      pricingUsdPerMillion: {
        input: 2,
        output: 8
      },
      cacheHitTokens: 200,
      cacheMissTokens: 800,
      outputTokens: 500
    })

    expect(cost).toEqual({
      costUsd: 0.006
    })
  })

  it('estimates cache savings from the delta between uncached and cache-read input prices', () => {
    const savings = estimateModelCacheSavings({
      model: 'openai/gpt-4.1-mini',
      pricingUsdPerMillion: {
        input: 0.4,
        output: 1.6,
        cacheRead: 0.1
      },
      cacheHitTokens: 1000
    })

    expect(savings).toEqual({
      costUsd: 0.0003
    })
  })
})
