import { describe, expect, it } from 'vitest'
import {
  defaultClawSettings,
  defaultKeyboardShortcuts,
  DEFAULT_OPENROUTER_BASE_URL,
  OPENROUTER_PROVIDER_ID,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  normalizeModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  resolveKunRuntimeSettings,
  type AppSettingsV1
} from './app-settings'

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: {
      ...defaultModelProviderSettings(),
      providers: [
        ...defaultModelProviderSettings().providers,
        {
          id: 'custom',
          name: 'Custom Provider',
          apiKey: 'sk-custom',
          baseUrl: 'https://custom.example/v1',
          models: ['custom-model'],
          catalogModels: []
        }
      ]
    },
    agents: {
      kun: {
        ...defaultKunRuntimeSettings(),
        providerId: 'custom',
        model: 'custom-model'
      }
    },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: defaultKeyboardShortcuts(),
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' },
    codePromptPrefix: ''
  }
}

describe('model provider settings', () => {
  it('keeps DeepSeek as default while adding OpenRouter as a built-in provider profile', () => {
    const provider = defaultModelProviderSettings()

    expect(provider.providers.map((profile) => profile.id)).toEqual([
      'deepseek',
      OPENROUTER_PROVIDER_ID
    ])
    expect(provider.providers[0]).toMatchObject({
      id: 'deepseek',
      name: 'DeepSeek'
    })
    expect(provider.providers[1]).toMatchObject({
      id: OPENROUTER_PROVIDER_ID,
      name: 'OpenRouter',
      baseUrl: DEFAULT_OPENROUTER_BASE_URL
    })
  })

  it('resolves Kun runtime credentials from the selected provider', () => {
    const runtime = resolveKunRuntimeSettings(settings())

    expect(runtime.apiKey).toBe('sk-custom')
    expect(runtime.baseUrl).toBe('https://custom.example/v1')
  })

  it('normalizes catalog-backed provider model metadata without exposing credentials', () => {
    const normalized = normalizeModelProviderSettings({
      providers: [{
        id: OPENROUTER_PROVIDER_ID,
        name: 'OpenRouter',
        apiKey: 'sk-or-secret',
        baseUrl: DEFAULT_OPENROUTER_BASE_URL,
        models: ['openai/gpt-4.1-mini'],
        catalogUpdatedAt: '2026-06-09T00:00:00.000Z',
        catalogModels: [{
          id: 'openai/gpt-4.1-mini',
          name: 'OpenAI: GPT-4.1 Mini',
          providerId: OPENROUTER_PROVIDER_ID,
          contextLength: 1047576,
          tokenizer: 'GPT',
          pricingUsdPerMillion: {
            input: 0.4,
            output: 1.6,
            cacheRead: 0.1,
            cacheWrite: 0.4
          },
          capabilities: {
            inputModalities: ['text'],
            outputModalities: ['text'],
            reasoning: true,
            tools: true,
            recommendedUse: ['coding', 'review']
          }
        }]
      }]
    })

    const openRouter = normalized.providers.find((profile) => profile.id === OPENROUTER_PROVIDER_ID)

    expect(openRouter?.catalogUpdatedAt).toBe('2026-06-09T00:00:00.000Z')
    expect(openRouter?.catalogModels).toEqual([
      expect.objectContaining({
        id: 'openai/gpt-4.1-mini',
        name: 'OpenAI: GPT-4.1 Mini',
        contextLength: 1047576,
        tokenizer: 'GPT',
        pricingUsdPerMillion: {
          input: 0.4,
          output: 1.6,
          cacheRead: 0.1,
          cacheWrite: 0.4
        },
        capabilities: expect.objectContaining({
          reasoning: true,
          tools: true,
          recommendedUse: ['coding', 'review']
        })
      })
    ])
    expect(JSON.stringify(openRouter?.catalogModels)).not.toContain('sk-or-secret')
  })
})
