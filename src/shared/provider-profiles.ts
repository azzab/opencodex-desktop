/**
 * Standardized provider profile definitions for all first-class providers.
 *
 * These serve as the single source of truth for built-in provider defaults:
 *   - base URL, endpoint format, model discovery URL
 *   - capability hints (tools, vision, reasoning)
 *   - known model IDs for static fallback when discovery is unavailable
 *
 * Custom providers and the existing DeepSeek / OpenRouter profiles are
 * managed separately through the existing M2 credential and settings machinery.
 */

import type { ModelEndpointFormat } from '../../kun/src/contracts/model-endpoint-format'

export type BuiltInProviderProfileDef = {
  id: string
  name: string
  baseUrl: string
  endpointFormat: ModelEndpointFormat
  /** Path for model listing (relative to base, e.g. '/v1/models'). */
  modelsPath: string
  /** Whether this provider requires an API key. Ollama / LM Studio do not. */
  requiresKey: boolean
  /** Whether this provider follows the OpenAI-compatible /v1/chat/completions convention. */
  openAiCompat: boolean
  /** Known model IDs for static fallback when discovery is unavailable. */
  fallbackModelIds: string[]
  /** Human-readable description for the UI. */
  description: string
  /** Capability hints applied to all models from this provider when discovery data is sparse. */
  capabilityHints: {
    tools: boolean
    vision: boolean
    reasoning: boolean
    maxContextHint: number
  }
  /** Provider website URL shown to users who need to create an API key. */
  signupUrl: string
  /** Whether this provider is local (runs on user's hardware). */
  local: boolean
}

export const BUILT_IN_PROVIDER_PROFILES: BuiltInProviderProfileDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    endpointFormat: 'messages',
    modelsPath: '/v1/models',
    requiresKey: true,
    openAiCompat: false,
    fallbackModelIds: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-haiku-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022'
    ],
    description: 'Anthropic Claude models — strong reasoning, long context, and safety-focused.',
    capabilityHints: { tools: true, vision: true, reasoning: true, maxContextHint: 200000 },
    signupUrl: 'https://console.anthropic.com/',
    local: false
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    endpointFormat: 'chat_completions',
    modelsPath: '/v1/models',
    requiresKey: true,
    openAiCompat: true,
    fallbackModelIds: [
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'o3',
      'o4-mini'
    ],
    description: 'OpenAI GPT models — broad capability, strong tool-use, and multimodal support.',
    capabilityHints: { tools: true, vision: true, reasoning: true, maxContextHint: 200000 },
    signupUrl: 'https://platform.openai.com/api-keys',
    local: false
  },
  {
    id: 'google-gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    endpointFormat: 'chat_completions',
    modelsPath: '/v1/models',
    requiresKey: true,
    openAiCompat: false,
    fallbackModelIds: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite'
    ],
    description: 'Google Gemini models — large context windows and strong multimodal capabilities.',
    capabilityHints: { tools: true, vision: true, reasoning: true, maxContextHint: 1000000 },
    signupUrl: 'https://aistudio.google.com/apikey',
    local: false
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    endpointFormat: 'chat_completions',
    modelsPath: '/v1/models',
    requiresKey: true,
    openAiCompat: true,
    fallbackModelIds: [
      'grok-4',
      'grok-4-fast',
      'grok-3',
      'grok-3-mini',
      'grok-3-fast'
    ],
    description: 'xAI Grok models — fast reasoning and large context.',
    capabilityHints: { tools: true, vision: true, reasoning: true, maxContextHint: 1000000 },
    signupUrl: 'https://console.x.ai/',
    local: false
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    endpointFormat: 'chat_completions',
    modelsPath: '/v1/models',
    requiresKey: true,
    openAiCompat: false,
    fallbackModelIds: [
      'mistral-large-latest',
      'mistral-medium-latest',
      'mistral-small-latest',
      'codestral-latest',
      'pixtral-large-latest'
    ],
    description: 'Mistral AI models — strong code generation and multilingual support.',
    capabilityHints: { tools: true, vision: true, reasoning: false, maxContextHint: 128000 },
    signupUrl: 'https://console.mistral.ai/',
    local: false
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    endpointFormat: 'chat_completions',
    modelsPath: '/v1/models',
    requiresKey: true,
    openAiCompat: true,
    fallbackModelIds: [
      'llama-4-maverick-17b-128e-instruct',
      'llama-4-scout-17b-16e-instruct',
      'deepseek-r1-distill-llama-70b',
      'mixtral-8x7b-32768',
      'gemma2-9b-it'
    ],
    description: 'Groq — ultra-fast inference with LPU hardware for open models.',
    capabilityHints: { tools: true, vision: false, reasoning: true, maxContextHint: 128000 },
    signupUrl: 'https://console.groq.com/keys',
    local: false
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    endpointFormat: 'chat_completions',
    modelsPath: '/v1/models',
    requiresKey: true,
    openAiCompat: true,
    fallbackModelIds: [
      'deepseek-ai/DeepSeek-V3',
      'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
      'Qwen/Qwen2.5-72B-Instruct'
    ],
    description: 'Together AI — open-source model hosting with competitive pricing.',
    capabilityHints: { tools: true, vision: false, reasoning: false, maxContextHint: 131072 },
    signupUrl: 'https://api.together.xyz/',
    local: false
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    endpointFormat: 'chat_completions',
    modelsPath: '/v1/models',
    requiresKey: true,
    openAiCompat: true,
    fallbackModelIds: [
      'accounts/fireworks/models/llama-v3p1-405b-instruct',
      'accounts/fireworks/models/mixtral-8x22b-instruct',
      'accounts/fireworks/models/deepseek-v3',
      'accounts/fireworks/models/qwen2p5-72b-instruct'
    ],
    description: 'Fireworks AI — fast, serverless inference for open models.',
    capabilityHints: { tools: true, vision: false, reasoning: false, maxContextHint: 131072 },
    signupUrl: 'https://fireworks.ai/',
    local: false
  }
]

export type LocalProviderDef = {
  id: string
  name: string
  defaultPort: number
  apiPath: string
  /** Whether auto-detection should attempt to hit /api/tags or similar endpoint. */
  discoveryPath: string
  description: string
  signupUrl: string
  local: true
}

export const LOCAL_PROVIDERS: LocalProviderDef[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    defaultPort: 11434,
    apiPath: 'http://127.0.0.1:11434',
    discoveryPath: '/api/tags',
    description: 'Ollama — run open-source models locally on your hardware. No API key needed.',
    signupUrl: 'https://ollama.com/',
    local: true
  },
  {
    id: 'lm-studio',
    name: 'LM Studio',
    defaultPort: 1234,
    apiPath: 'http://127.0.0.1:1234',
    discoveryPath: '/v1/models',
    description: 'LM Studio — local LLM server with a built-in model catalog. No API key needed.',
    signupUrl: 'https://lmstudio.ai/',
    local: true
  }
]

/**
 * Build a safe profile ID from a BuiltInProviderProfileDef or LocalProviderDef.
 */
export function providerProfileId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Look up a built-in profile by id.
 */
export function getBuiltInProfile(id: string): BuiltInProviderProfileDef | undefined {
  return BUILT_IN_PROVIDER_PROFILES.find((p) => p.id === id)
}

/**
 * Look up a local provider def by id.
 */
export function getLocalProviderDef(id: string): LocalProviderDef | undefined {
  return LOCAL_PROVIDERS.find((p) => p.id === id)
}
