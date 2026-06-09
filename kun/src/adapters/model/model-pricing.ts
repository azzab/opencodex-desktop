export type ModelPricingUsdPerMillion = {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export type ModelUsdCost = {
  costUsd: number
}

const TOKENS_PER_MILLION = 1_000_000

export function estimateModelUsageCost(input: {
  model: string
  pricingUsdPerMillion: ModelPricingUsdPerMillion
  cacheHitTokens?: number
  cacheMissTokens?: number
  inputTokens?: number
  outputTokens: number
}): ModelUsdCost {
  const cacheHitTokens = nonNegativeTokens(input.cacheHitTokens)
  const cacheMissTokens = input.cacheMissTokens === undefined
    ? Math.max(nonNegativeTokens(input.inputTokens) - cacheHitTokens, 0)
    : nonNegativeTokens(input.cacheMissTokens)
  const outputTokens = nonNegativeTokens(input.outputTokens)
  const cacheInputPrice = input.pricingUsdPerMillion.cacheRead ?? input.pricingUsdPerMillion.input
  return {
    costUsd: roundCurrency(
      tokenCost(cacheHitTokens, cacheInputPrice) +
      tokenCost(cacheMissTokens, input.pricingUsdPerMillion.input) +
      tokenCost(outputTokens, input.pricingUsdPerMillion.output)
    )
  }
}

export function estimateModelCacheSavings(input: {
  model: string
  pricingUsdPerMillion: ModelPricingUsdPerMillion
  cacheHitTokens: number
}): ModelUsdCost {
  const cacheRead = input.pricingUsdPerMillion.cacheRead
  if (cacheRead === undefined) return { costUsd: 0 }
  return {
    costUsd: roundCurrency(
      tokenCost(
        nonNegativeTokens(input.cacheHitTokens),
        Math.max(0, input.pricingUsdPerMillion.input - cacheRead)
      )
    )
  }
}

function tokenCost(tokens: number, pricePerMillion: number): number {
  return (tokens / TOKENS_PER_MILLION) * pricePerMillion
}

function nonNegativeTokens(value: number | undefined): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value ?? 0 : 0))
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000
}
