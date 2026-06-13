import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  DEFAULT_MODEL_ENDPOINT_FORMAT,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../shared/app-settings'
import {
  fetchModelProviderCatalog,
  fetchUpstreamModelIds,
  parseOpenRouterModelCatalog,
  readConfiguredKunModelIds
} from './upstream-models'

function settings(dataDir: string, model = 'settings-model'): AppSettingsV1 {
  const provider = defaultModelProviderSettings()
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: {
      ...provider,
      providers: [
        ...provider.providers,
        {
          id: 'custom-provider',
          name: 'Custom Provider',
          apiKey: 'pk-fixture-custom',
          baseUrl: 'https://custom.example/v1',
          endpointFormat: DEFAULT_MODEL_ENDPOINT_FORMAT,
          models: ['custom-provider-model'],
          catalogModels: []
        }
      ]
    },
    agents: {
      kun: {
        ...defaultKunRuntimeSettings(),
        dataDir,
        model,
        providerId: 'custom-provider'
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

describe('upstream model picker list', () => {
  it('includes Kun config model profiles, aliases, and the configured agent model', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'deepseek-gui-models-'))
    await mkdir(dataDir, { recursive: true })
    await writeFile(
      join(dataDir, 'config.json'),
      JSON.stringify({
        contextCompaction: {
          modelProfiles: {
            'legacy-model': {}
          }
        },
        models: {
          profiles: {
            'custom-model': {
              aliases: ['vendor/custom-model']
            }
          }
        }
      }),
      'utf8'
    )

    const ids = await readConfiguredKunModelIds(settings(dataDir))

    expect(ids).toEqual(expect.arrayContaining([
      'auto',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'settings-model',
      'legacy-model',
      'custom-model',
      'vendor/custom-model'
    ]))
  })

  it('falls back to configured model ids when upstream cannot be queried', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'deepseek-gui-models-'))
    await mkdir(dataDir, { recursive: true })
    await writeFile(
      join(dataDir, 'config.json'),
      JSON.stringify({
        models: {
          profiles: {
            'deepseek-v4-flash': {
              aliases: ['deepseek-chat', 'deepseek-reasoner']
            }
          }
        }
      }),
      'utf8'
    )
    const result = await fetchUpstreamModelIds(settings(dataDir, 'local-only-model'), '')

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.modelIds).toContain('local-only-model')
      expect(result.modelIds).toContain('custom-provider-model')
      expect(result.modelGroups).toEqual(expect.arrayContaining([
        expect.objectContaining({
          providerId: 'custom-provider',
          label: 'Custom Provider',
          modelIds: expect.arrayContaining(['custom-provider-model'])
        }),
        expect.objectContaining({
          providerId: 'deepseek',
          label: 'DeepSeek',
          modelIds: expect.arrayContaining(['deepseek-chat', 'deepseek-reasoner'])
        })
      ]))
    }
  })

  it('maps OpenRouter catalog rows into durable model metadata', () => {
    const catalog = parseOpenRouterModelCatalog({
      data: [{
        id: 'openai/gpt-4.1-mini',
        name: 'OpenAI: GPT-4.1 Mini',
        context_length: 1047576,
        architecture: {
          input_modalities: ['text'],
          output_modalities: ['text'],
          tokenizer: 'GPT'
        },
        pricing: {
          prompt: '0.0000004',
          completion: '0.0000016',
          input_cache_read: '0.0000001',
          input_cache_write: '0.0000004'
        },
        supported_parameters: [
          'tools',
          'tool_choice',
          'reasoning',
          'include_reasoning',
          'response_format'
        ]
      }]
    })

    expect(catalog).toEqual([{
      id: 'openai/gpt-4.1-mini',
      name: 'OpenAI: GPT-4.1 Mini',
      providerId: 'openrouter',
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
        recommendedUse: ['coding', 'review', 'research']
      }
    }])
  })

  it('fetches OpenRouter models from the first-class catalog endpoint', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    const fetchImpl = async (url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      calls.push({
        url: String(url),
        headers: Object.fromEntries(new Headers(init?.headers).entries())
      })
      return new Response(JSON.stringify({
        data: [{
          id: 'anthropic/claude-sonnet-4.5',
          name: 'Anthropic: Claude Sonnet 4.5',
          context_length: 200000,
          architecture: {
            input_modalities: ['text'],
            output_modalities: ['text'],
            tokenizer: 'Claude'
          },
          pricing: {
            prompt: '0.000003',
            completion: '0.000015'
          },
          supported_parameters: ['tools', 'reasoning']
        }]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    const result = await fetchModelProviderCatalog({
      provider: {
        id: 'openrouter',
        name: 'OpenRouter',
        apiKey: 'pk-fixture-sentinel',
        baseUrl: 'https://openrouter.ai/api/v1',
        endpointFormat: DEFAULT_MODEL_ENDPOINT_FORMAT,
        models: []
      },
      fetchImpl,
      nowIso: () => '2026-06-09T00:00:00.000Z'
    })

    expect(result).toMatchObject({
      ok: true,
      providerId: 'openrouter',
      catalogUpdatedAt: '2026-06-09T00:00:00.000Z'
    })
    if (result.ok) {
      expect(result.catalogModels[0]).toMatchObject({
        id: 'anthropic/claude-sonnet-4.5',
        providerId: 'openrouter',
        pricingUsdPerMillion: {
          input: 3,
          output: 15
        }
      })
    }
    expect(calls).toEqual([{
      url: 'https://openrouter.ai/api/v1/models',
      headers: expect.objectContaining({
        accept: 'application/json',
        authorization: 'Bearer pk-fixture-sentinel'
      })
    }])
  })

  it('redacts provider secrets from catalog fetch errors', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response('Authorization: Bearer pk-fixture-sentinel token=pk-fixture-sentinel', {
        status: 401,
        headers: { 'content-type': 'text/plain' }
      })

    const result = await fetchModelProviderCatalog({
      provider: {
        id: 'openrouter',
        name: 'OpenRouter',
        apiKey: 'pk-fixture-sentinel',
        baseUrl: 'https://openrouter.ai/api/v1',
        endpointFormat: DEFAULT_MODEL_ENDPOINT_FORMAT,
        models: []
      },
      fetchImpl
    })

    expect(result).toMatchObject({ ok: false, providerId: 'openrouter' })
    if (!result.ok) {
      expect(result.message).toContain('<redacted>')
      expect(result.message).not.toContain('pk-fixture-sentinel')
    }
  })
})
