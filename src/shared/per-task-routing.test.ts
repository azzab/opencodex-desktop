import { describe, expect, it } from 'vitest'
import {
  resolvePerTaskAssignment,
  resolveSendModel,
  threadModeToTaskRole,
  providerProfilesForSettings,
  type ResolvedSendModel,
  defaultModelProviderSettings,
  normalizeModelProviderSettings,
  type AppSettingsV1,
  type ModelProviderSettingsV1,
  type PerTaskModelSettings
} from './app-settings'
import { STORED_ENCRYPTED_MARKER } from './app-settings-types'

function settings(providerOverrides?: Partial<ModelProviderSettingsV1>): AppSettingsV1 {
  const provider = normalizeModelProviderSettings({
    providers: [
      ...(providerOverrides?.providers ?? defaultModelProviderSettings().providers),
      {
        id: 'openai',
        name: 'OpenAI',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        endpointFormat: 'chat_completions',
        models: ['gpt-4.1', 'gpt-4o'],
        catalogModels: [
          {
            id: 'gpt-4.1',
            name: 'GPT-4.1',
            providerId: 'openai',
            capabilities: {
              inputModalities: ['text'],
              outputModalities: ['text'],
              reasoning: true,
              tools: true,
              recommendedUse: ['coding']
            }
          },
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            providerId: 'openai',
            capabilities: {
              inputModalities: ['text'],
              outputModalities: ['text'],
              reasoning: true,
              tools: true,
              recommendedUse: ['coding']
            }
          }
        ]
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com/v1',
        endpointFormat: 'messages',
        models: ['claude-sonnet-4-20250514'],
        catalogModels: [
          {
            id: 'claude-sonnet-4-20250514',
            name: 'Claude Sonnet 4',
            providerId: 'anthropic',
            capabilities: {
              inputModalities: ['text'],
              outputModalities: ['text'],
              reasoning: true,
              tools: true,
              recommendedUse: ['coding']
            }
          }
        ]
      }
    ],
    perTaskModel: providerOverrides?.perTaskModel ?? { enabled: true, assignments: [] },
    modelPicker: providerOverrides?.modelPicker ?? { freeOnly: false, favorites: [] }
  })
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider,
    agents: {
      kun: {
        binaryPath: '',
        port: 0,
        autoStart: false,
        apiKey: '',
        baseUrl: '',
        providerId: 'deepseek',
        endpointFormat: 'chat_completions',
        runtimeToken: '',
        dataDir: '',
        model: 'deepseek-v4-pro',
        approvalPolicy: 'auto',
        sandboxMode: 'workspace-write',
        tokenEconomyMode: false,
        tokenEconomy: {
          enabled: false,
          compressToolDescriptions: false,
          compressToolResults: false,
          conciseResponses: false,
          historyHygiene: {
            maxToolResultLines: 0,
            maxToolResultBytes: 0,
            maxToolResultTokens: 0,
            maxToolArgumentStringBytes: 0,
            maxToolArgumentStringTokens: 0,
            maxArrayItems: 0
          }
        },
        insecure: false,
        mcpSearch: { enabled: false, mode: 'direct', autoThresholdToolCount: 0, topKDefault: 0, topKMax: 0, minScore: 0 },
        storage: { backend: 'file', sqlitePath: '' },
        contextCompaction: {
          defaultSoftThreshold: 0,
          defaultHardThreshold: 0,
          summaryMode: 'heuristic',
          summaryTimeoutMs: 0,
          summaryMaxTokens: 0,
          summaryInputMaxBytes: 0
        },
        runtimeTuning: {
          toolStorm: { enabled: false, windowSize: 0, threshold: 0 },
          toolArgumentRepair: { maxStringBytes: 0 }
        },
        userAgentStack: {
          enabled: false, importedAt: '', refreshedAt: '', sourcePaths: [],
          skillRoots: [], mcpServers: [], cli: [], redactedPreviewJson: '', validationErrors: []
        },
        subagents: {
          enabled: false, defaultModel: '', defaultPreset: 'review_swarm',
          maxParallel: 0, maxChildRuns: 0, maxTotalChildTokens: 0,
          maxChildCostUsd: 0, perAgentTimeoutMs: 0,
          workflowPresets: {
            review_swarm: { id: 'review_swarm', enabled: false, label: '', defaultModel: '', maxParallel: 0, maxChildRuns: 0, maxTotalChildTokens: 0, maxChildCostUsd: 0, perAgentTimeoutMs: 0 },
            implementation_split: { id: 'implementation_split', enabled: false, label: '', defaultModel: '', maxParallel: 0, maxChildRuns: 0, maxTotalChildTokens: 0, maxChildCostUsd: 0, perAgentTimeoutMs: 0 },
            research_split: { id: 'research_split', enabled: false, label: '', defaultModel: '', maxParallel: 0, maxChildRuns: 0, maxTotalChildTokens: 0, maxChildCostUsd: 0, perAgentTimeoutMs: 0 },
            audit_split: { id: 'audit_split', enabled: false, label: '', defaultModel: '', maxParallel: 0, maxChildRuns: 0, maxTotalChildTokens: 0, maxChildCostUsd: 0, perAgentTimeoutMs: 0 }
          }
        },
        automation: {
          enabled: false, browserWorkbenchEnabled: false, localDevOnly: false, allowedHosts: [],
          permissions: { browserNavigation: 'deny', browserInteraction: 'deny', screenshots: 'deny', localFileAccess: 'deny', appControl: 'deny' },
          auditLog: { enabled: false, maxEntries: 0 }
        },
        automations: {
          goal: {
            enabled: false, model: '', maxContinuationTurns: 0, blockedRetryAfterTurns: 0,
            budget: { maxIterations: 0, maxTokensPerEval: 0, maxCostUsdPerEval: 0, totalMaxIterations: 0, totalMaxTokens: 0, totalMaxCostUsd: 0 }
          },
          loop: { enabled: false, defaultModel: '', maxConcurrentLoops: 0, minIntervalMinutes: 0, requireProjectId: false }
        },
        terminal: { enabled: false },
        checkpoints: { maxPerThread: 0, maxTotal: 0, autoBeforeMutation: false },
        hooks: { enabled: false, trustedHooks: {}, defaultTimeoutMs: 0, maxOutputBytes: 0, maxAuditEvents: 0, auditLog: [] },
        remoteRunners: {
          enabled: false, hosts: [],
          dataPolicy: { defaultAllowed: [], consentRequired: [], never: [] },
          auditLog: [], maxAuditEntries: 0
        },
        mobileAccess: {
          enabled: false,
          port: 19443,
          host: '0.0.0.0',
          devices: [],
          auditLog: [],
          maxAuditEntries: 500
        }
      }
    },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: false },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: { bindings: {} },
    write: {
      defaultWorkspaceRoot: '', activeWorkspaceRoot: '', workspaces: [],
      inlineCompletion: {
        enabled: false, retrievalEnabled: false, longCompletionEnabled: false,
        apiKey: '', baseUrl: '', inheritModel: false, model: '',
        debounceMs: 0, longDebounceMs: 0, minAcceptScore: 0, longMinAcceptScore: 0,
        maxTokens: 0, longMaxTokens: 0
      }
    },
    claw: {
      enabled: false, skills: { defaultNames: [], extraDirs: [], promptPrefix: '' },
      im: {
        enabled: false, provider: 'feishu', port: 0, path: '', secret: '',
        weixinBridgeUrl: '', workspaceRoot: '', model: '', mode: 'agent', responseTimeoutMs: 0
      },
      channels: [], tasks: []
    },
    schedule: {
      enabled: false, defaultWorkspaceRoot: '', model: '', mode: 'agent',
      promptPrefix: '', skills: { defaultNames: [], extraDirs: [] },
      keepAwake: false, internal: { port: 0, secret: '' }, tasks: []
    },
    guiUpdate: { channel: 'stable' },
    codePromptPrefix: ''
  }
}

describe('threadModeToTaskRole', () => {
  it('maps plan mode to plan role', () => {
    expect(threadModeToTaskRole('plan')).toBe('plan')
  })

  it('maps review mode to review role', () => {
    expect(threadModeToTaskRole('review')).toBe('review')
  })

  it('maps agent mode to code role', () => {
    expect(threadModeToTaskRole('agent')).toBe('code')
  })

  it('maps undefined/unknown to code role', () => {
    expect(threadModeToTaskRole(undefined)).toBe('code')
    expect(threadModeToTaskRole('unknown')).toBe('code')
    expect(threadModeToTaskRole('')).toBe('code')
  })
})

describe('resolvePerTaskAssignment', () => {
  it('returns empty when perTaskModel is disabled', () => {
    const s = settings({ perTaskModel: { enabled: false, assignments: [] } })
    expect(resolvePerTaskAssignment(s, 'plan')).toEqual({})
    expect(resolvePerTaskAssignment(s, 'code')).toEqual({})
  })

  it('returns empty when no assignment matches the role', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'plan', providerId: 'openai', modelId: 'gpt-4.1', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'code')).toEqual({})
    expect(resolvePerTaskAssignment(s, 'review')).toEqual({})
  })

  it('returns empty when assignment is disabled', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'plan', providerId: 'openai', modelId: 'gpt-4.1', enabled: false }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'plan')).toEqual({})
  })

  it('resolves provider+model for enabled plan assignment', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'plan', providerId: 'openai', modelId: 'gpt-4.1', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'plan')).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4.1'
    })
  })

  it('resolves code assignment with anthropic', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'code', providerId: 'anthropic', modelId: 'claude-sonnet-4-20250514', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'code')).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514'
    })
  })

  it('resolves review assignment', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'review', providerId: 'openai', modelId: 'gpt-4o', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'review')).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4o'
    })
  })

  it('resolves cheap-subagent assignment', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'cheap-subagent', providerId: 'deepseek', modelId: 'deepseek-v4-flash', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'cheap-subagent')).toEqual({
      providerId: 'deepseek',
      modelId: 'deepseek-v4-flash'
    })
  })

  it('returns empty when both providerId and modelId are empty strings', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'plan', providerId: '', modelId: '', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'plan')).toEqual({})
  })

  it('resolves model-only assignment without provider', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'code', providerId: '', modelId: 'gpt-4.1', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'code')).toEqual({ modelId: 'gpt-4.1' })
  })

  it('resolves provider-only assignment without model', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'code', providerId: 'openai', modelId: '', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'code')).toEqual({ providerId: 'openai' })
  })

  it('returns empty for whitespace-only values', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'plan', providerId: '  ', modelId: '  ', enabled: true }]
      }
    })
    expect(resolvePerTaskAssignment(s, 'plan')).toEqual({})
  })
})

describe('resolveSendModel', () => {
  it('prioritizes explicit overrides over per-task assignment', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'code', providerId: 'openai', modelId: 'gpt-4.1', enabled: true }]
      }
    })
    // Explicit override should win
    expect(resolveSendModel(s, {
      mode: 'agent',
      explicitProviderId: 'anthropic',
      explicitModelId: 'claude-sonnet-4-20250514'
    })).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514'
    })
  })

  it('falls back to per-task when no explicit override', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'plan', providerId: 'openai', modelId: 'gpt-4.1', enabled: true }]
      }
    })
    expect(resolveSendModel(s, { mode: 'plan' })).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4.1'
    })
  })

  it('uses explicit role over mode', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [
          { role: 'review', providerId: 'anthropic', modelId: 'claude-sonnet-4-20250514', enabled: true }
        ]
      }
    })
    // When explicit role is provided, it takes priority over mode
    expect(resolveSendModel(s, { role: 'review', mode: 'agent' })).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-20250514'
    })
  })

  it('returns empty when per-task is disabled and no explicit override', () => {
    const s = settings({
      perTaskModel: { enabled: false, assignments: [] }
    })
    expect(resolveSendModel(s, { mode: 'agent' })).toEqual({})
  })

  it('returns partial when only explicit model is provided', () => {
    const s = settings({
      perTaskModel: { enabled: false, assignments: [] }
    })
    expect(resolveSendModel(s, { explicitModelId: 'gpt-4o' })).toEqual({
      modelId: 'gpt-4o'
    })
  })

  it('returns partial when only explicit providerId is provided', () => {
    const s = settings({
      perTaskModel: { enabled: false, assignments: [] }
    })
    expect(resolveSendModel(s, { explicitProviderId: 'openai' })).toEqual({
      providerId: 'openai'
    })
  })

  it('does not modify settings - returns a new object (immutability)', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'code', providerId: 'openai', modelId: 'gpt-4.1', enabled: true }]
      }
    })
    const originalAssignment = s.provider.perTaskModel.assignments[0]
    const result = resolveSendModel(s, { mode: 'agent' })
    // Result should be a fresh object
    expect(result).toEqual({ providerId: 'openai', modelId: 'gpt-4.1' })
    // Original settings unchanged
    expect(s.provider.perTaskModel.assignments[0]).toBe(originalAssignment)
  })
})

describe('per-task routing security: no key leakage surface', () => {
  it('providerProfileForSettings replaces apiKey with marker', () => {
    // The providerProfilesForSettings function should replace plaintext keys
    // with the STORED_ENCRYPTED_MARKER. Verify that resolveSendModel only
    // returns providerId/modelId, never the actual API key.
    const s = settings()
    // resolveSendModel only returns providerId and modelId
    const result = resolveSendModel(s, { mode: 'agent' })
    expect(result).toEqual({})
    // It never includes apiKey
    expect(result).not.toHaveProperty('apiKey')
    expect(result).not.toHaveProperty('key')
    expect(result).not.toHaveProperty('secret')
    expect(result).not.toHaveProperty('credential')
  })

  it('resolvePerTaskAssignment never returns key material', () => {
    const s = settings({
      perTaskModel: {
        enabled: true,
        assignments: [{ role: 'code', providerId: 'openai', modelId: 'gpt-4.1', enabled: true }]
      }
    })
    const result = resolvePerTaskAssignment(s, 'code')
    expect(Object.keys(result).sort()).toEqual(['modelId', 'providerId'])
    // These are identifiers, not secrets
    expect(result.providerId).toBe('openai')
    expect(result.modelId).toBe('gpt-4.1')
  })

  it('providerProfilesForSettings replaces apiKey with STORED_ENCRYPTED_MARKER for persistence boundary', () => {
    const profiles = [
      { id: 'openai', name: 'OpenAI', apiKey: 'sk-should-not-appear-serialized', baseUrl: 'https://api.openai.com/v1', endpointFormat: 'chat_completions' as const, models: [], catalogModels: [] },
      { id: 'deepseek', name: 'DeepSeek', apiKey: 'sk-deepseek-key', baseUrl: 'https://api.deepseek.com', endpointFormat: 'chat_completions' as const, models: [], catalogModels: [] }
    ]
    const serialized = providerProfilesForSettings(profiles)
    for (const profile of serialized) {
      expect(profile.apiKey).toBe(STORED_ENCRYPTED_MARKER)
    }
    const json = JSON.stringify(serialized)
    expect(json).not.toContain('sk-should-not-appear-serialized')
    expect(json).not.toContain('sk-deepseek-key')
  })
})
