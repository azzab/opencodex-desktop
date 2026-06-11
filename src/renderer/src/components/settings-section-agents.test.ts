import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  type ModelProviderProfileV1
} from '@shared/app-settings'
import {
  AgentsSettingsSection,
  modelProvidersSettingsPatch
} from './settings-section-agents'

const labels: Record<string, string> = {
  agentsQuickBase: 'Base',
  agentsQuickSkill: 'Skills',
  agentsQuickMcp: 'MCP',
  agentsQuickPermissions: 'Permissions',
  agentsQuickUserStack: 'User stack',
  agents: 'Agents',
  userAgentStack: 'User Agent Stack',
  userAgentStackDesc: 'Import a redacted local agent setup into Kun settings.',
  userAgentStackImport: 'Import stack',
  userAgentStackRefresh: 'Refresh preview',
  userAgentStackImported: 'Imported {{date}}',
  userAgentStackNeverImported: 'Not imported yet',
  userAgentStackSummary: 'Skills {{skills}} · MCP {{mcp}} · CLI {{cli}}',
  userAgentStackCliReady: 'Ready CLI',
  userAgentStackCliMissing: 'Missing CLI',
  userAgentStackPreview: 'Redacted preview',
  userAgentStackPreviewDesc: 'Preview never shows secret values.',
  userAgentStackPreviewEmpty: 'Refresh to preview importable skills, MCP servers, and CLI status.',
  userAgentStackImporting: 'Importing',
  userAgentStackRefreshing: 'Refreshing',
  kunProvider: 'Provider',
  kunProviderDesc: 'Provider description',
  kunApiKey: 'Kun API key',
  kunApiKeyDesc: 'Kun API key description',
  kunApiKeyPlaceholder: 'Inherit API key',
  kunApiKeyInherited: 'Inherited API key',
  kunApiKeyMissing: 'Missing API key',
  kunApiKeyOverride: 'Override API key',
  kunBaseUrl: 'Kun base URL',
  kunBaseUrlDesc: 'Kun base URL description',
  kunBaseUrlPlaceholder: 'Inherit base URL',
  kunBaseUrlOfficial: 'Official base URL',
  kunBaseUrlInherited: 'Inherited base URL',
  kunBaseUrlOverride: 'Override base URL',
  kunAssistantAdvanced: 'Assistant advanced settings',
  kunAssistantAdvancedDesc: 'Assistant advanced settings description',
  autoStart: 'Auto start',
  autoStartDesc: 'Auto start description',
  port: 'Port',
  portDesc: 'Port description',
  kunBinary: 'Kun binary',
  kunBinaryDesc: 'Kun binary description',
  kunBinaryPlaceholder: 'Bundled Kun',
  kunDataDir: 'Data dir',
  kunDataDirDesc: 'Data dir description',
  kunModel: 'Model',
  kunModelDesc: 'Model description',
  kunModelPicker: 'Model picker',
  kunModelPickerDesc: 'Pick a catalog model and filter by provider, context, price, reasoning, tools, and use.',
  modelPickerProviderFilter: 'Provider filter',
  modelPickerAllProviders: 'All providers',
  modelPickerMinContext: 'Minimum context',
  modelPickerMaxInputPrice: 'Max input price',
  modelPickerReasoning: 'Reasoning',
  modelPickerTools: 'Tools',
  modelPickerRecommendedUse: 'Recommended use',
  modelPickerAnyUse: 'Any use',
  modelPickerRefreshCatalog: 'Refresh catalog',
  modelPickerRefreshing: 'Refreshing catalog',
  modelPickerContext: 'Context',
  modelPickerInputPrice: 'Input',
  modelPickerOutputPrice: 'Output',
  modelPickerReasoningBadge: 'Reasoning',
  modelPickerToolsBadge: 'Tools',
  modelPickerEmpty: 'No matching models',
  kunTokenEconomy: 'Token-saving mode',
  kunTokenEconomyDesc: 'Token-saving mode description',
  kunTokenEconomySavings: 'Saved {{tokens}} / {{cost}}',
  kunTokenEconomySavingsLoading: 'Loading savings',
  kunTokenEconomySavingsEmpty: 'Savings empty',
  kunTokenEconomyAdvanced: 'Token-saving advanced settings',
  kunTokenEconomyAdvancedDesc: 'Token-saving advanced settings description',
  kunTokenEconomyOptions: 'Token-saving options',
  kunTokenEconomyOptionsDesc: 'Token-saving options description',
  kunCompressToolDescriptions: 'Compress tool descriptions',
  kunCompressToolResults: 'Compress tool results',
  kunConciseResponses: 'Concise responses',
  kunHistoryHygiene: 'History guard',
  kunHistoryHygieneDesc: 'History guard description',
  kunHistoryMaxResultLines: 'Max result lines',
  kunHistoryMaxResultBytes: 'Max result bytes',
  kunHistoryMaxResultTokens: 'Max result tokens',
  kunHistoryMaxArgumentBytes: 'Max argument bytes',
  kunHistoryMaxArgumentTokens: 'Max argument tokens',
  kunHistoryMaxArrayItems: 'Max array items',
  runtimeToken: 'Runtime token',
  runtimeTokenDesc: 'Runtime token description',
  showSecret: 'Show',
  hideSecret: 'Hide',
  kunInsecure: 'Insecure',
  kunInsecureDesc: 'Insecure description',
  kunInsecureForcedDesc: 'Insecure forced',
  kunAdvanced: 'Advanced runtime settings',
  kunAdvancedDetails: 'Storage, model context, and tool guards',
  kunAdvancedDetailsDesc: 'Per-model context policy comes from models.profiles',
  kunStorageBackend: 'Storage backend',
  kunStorageBackendDesc: 'Storage backend description',
  kunStorageHybrid: 'Hybrid storage',
  kunStorageFile: 'Pure JSONL file storage',
  kunStorageSqlitePath: 'SQLite path',
  kunStorageSqlitePathDesc: 'SQLite path description',
  kunStorageSqlitePathPlaceholder: 'Automatic SQLite path',
  kunModelContextProfile: 'Current model context policy',
  kunModelContextProfileDesc: 'Current model context policy description',
  kunModelContextModel: 'Matched model',
  kunModelContextWindow: 'Context window',
  kunModelContextSoft: 'Model soft threshold',
  kunModelContextHard: 'Model hard threshold',
  kunModelContextSourceBuiltIn: 'Built-in model config',
  kunModelContextSourceFallback: 'Fallback model config',
  kunCompactionThresholds: 'Fallback compaction thresholds',
  kunCompactionThresholdsDesc: 'Fallback compaction thresholds description',
  kunCompactionSoftThreshold: 'Fallback soft threshold',
  kunCompactionHardThreshold: 'Fallback hard threshold',
  kunCompactionSummary: 'Compaction summary',
  kunCompactionSummaryDesc: 'Compaction summary description',
  kunCompactionSummaryMode: 'Summary mode',
  kunCompactionSummaryHeuristic: 'Heuristic summary',
  kunCompactionSummaryModel: 'Model summary',
  kunCompactionSummaryTimeout: 'Summary timeout',
  kunCompactionSummaryMaxTokens: 'Summary max tokens',
  kunCompactionSummaryInputBytes: 'Summary input bytes',
  kunToolStorm: 'Tool storm',
  kunToolStormDesc: 'Tool storm description',
  kunToolStormLimits: 'Tool storm limits',
  kunToolStormLimitsDesc: 'Tool storm limits description',
  kunToolStormWindowSize: 'Tool storm window',
  kunToolStormThreshold: 'Tool storm threshold',
  kunToolArgumentRepair: 'Tool argument repair',
  kunToolArgumentRepairDesc: 'Tool argument repair description',
  kunSubagents: 'Subagents',
  kunSubagentsDesc: 'Delegate bounded child agent work through Kun.',
  kunSubagentsEnabled: 'Enable delegate_task',
  kunSubagentsEnabledDesc: 'Advertise delegate_task when budgets allow it.',
  kunSubagentDefaultModel: 'Child model',
  kunSubagentDefaultModelDesc: 'Default cheap child model.',
  kunSubagentDefaultPreset: 'Default preset',
  kunSubagentDefaultPresetDesc: 'Default workflow preset.',
  kunSubagentBudgets: 'Subagent budgets',
  kunSubagentBudgetsDesc: 'Hard child-agent budget limits.',
  kunSubagentMaxParallel: 'Max parallel agents',
  kunSubagentMaxRuns: 'Max child runs',
  kunSubagentMaxTokens: 'Max child tokens',
  kunSubagentMaxCost: 'Max child cost',
  kunSubagentTimeout: 'Per-agent timeout',
  kunSubagentPresets: 'Workflow presets',
  kunSubagentPresetsDesc: 'Preset budget profiles.',
  subagentPresetReviewSwarm: 'Review swarm',
  subagentPresetImplementationSplit: 'Implementation split',
  subagentPresetResearchSplit: 'Research split',
  subagentPresetAuditSplit: 'Audit split',
  kunAutomation: 'Automation foundation',
  kunAutomationDesc: 'Safe browser automation and future computer control stay behind Kun gates.',
  kunAutomationEnabled: 'Experimental automation',
  kunAutomationEnabledDesc: 'Advertise sidecar-backed automation tools only after explicit opt-in.',
  kunAutomationBrowserWorkbench: 'Browser workbench panel',
  kunAutomationBrowserWorkbenchDesc: 'Manual browser preview remains a renderer view, not an automation executor.',
  kunAutomationLocalDevOnly: 'Local/dev targets only',
  kunAutomationLocalDevOnlyDesc: 'Navigation is limited to localhost and configured development hosts.',
  kunAutomationAllowedHosts: 'Allowed dev hosts',
  kunAutomationAllowedHostsDesc: 'Hostnames allowed while local/dev-only mode is active.',
  kunAutomationPermissions: 'Automation permission gates',
  kunAutomationPermissionsDesc: 'Each action class can be denied, approval-gated, or allowed.',
  kunAutomationBrowserNavigation: 'Browser navigation',
  kunAutomationBrowserInteraction: 'Click and type',
  kunAutomationScreenshots: 'Screenshots',
  kunAutomationLocalFileAccess: 'Local file access',
  kunAutomationAppControl: 'App/computer control',
  kunAutomationAuditLog: 'Automation audit log',
  kunAutomationAuditLogDesc: 'Automation requests, decisions, sidecar calls, and results are recorded as Kun audit events.',
  automationPermissionDeny: 'Deny',
  automationPermissionAsk: 'Ask',
  automationPermissionAllow: 'Allow',
  kunDiagnostics: 'Kun diagnostics',
  kunDiagnosticsAdvanced: 'Detailed diagnostics',
  kunDiagnosticsAdvancedDesc: 'Detailed diagnostics description',
  kunRuntimeCapabilities: 'Runtime capabilities',
  kunRuntimeCapabilitiesDesc: 'Runtime capabilities description',
  kunRuntimeModel: 'Runtime model',
  kunRuntimePid: 'Runtime PID',
  kunDiagnosticsRefresh: 'Refresh diagnostics',
  kunToolDiagnostics: 'Tool diagnostics',
  kunToolDiagnosticsDesc: 'Tool diagnostics description',
  kunDiagnosticsProviders: 'Providers',
  kunDiagnosticsMcpServers: 'MCP servers',
  kunDiagnosticsSkills: 'Discovered Skills',
  kunDiagnosticsAttachments: 'Attachments',
  kunMemoryRecords: 'Memory records',
  kunMemoryRecordsDesc: 'Memory records description',
  kunMemoryEmpty: 'No memories',
  kunMemoryDisable: 'Disable memory',
  kunMemoryDelete: 'Delete memory',
  kunMemoryDisabled: 'Disabled',
  skill: 'Skill',
  skillsLocation: 'Skill location',
  skillsLocationDesc: 'Skill location description',
  skillsPath: 'Skills path',
  skillsPathDesc: 'Skills path description',
  skillsRootUnavailable: 'Unavailable',
  skillsScanDirs: 'Scan dirs',
  skillsScanDirsDesc: 'Scan dirs description',
  skillsActions: 'Skill actions',
  skillsActionsDesc: 'Skill actions description',
  skillsOpenRoot: 'Open root',
  skillsOpenPlugins: 'Open plugins',
  mcp: 'MCP',
  mcpSearchEnabled: 'MCP search enabled',
  mcpSearchEnabledDesc: 'MCP search description',
  mcpAdvanced: 'MCP advanced settings',
  mcpAdvancedDesc: 'MCP advanced settings description',
  mcpSearchMode: 'MCP search mode',
  mcpSearchModeDesc: 'MCP search mode description',
  mcpSearchModeAuto: 'Auto mode',
  mcpSearchModeSearch: 'Search mode',
  mcpSearchModeDirect: 'Direct mode',
  mcpSearchLimits: 'MCP search limits',
  mcpSearchLimitsDesc: 'MCP search limits description',
  mcpSearchAutoThreshold: 'Auto threshold',
  mcpSearchTopKDefault: 'Default results',
  mcpSearchTopKMax: 'Max results',
  mcpSearchMinScore: 'Minimum score',
  mcpSearchDiagnostics: 'MCP search diagnostics',
  mcpSearchDiagnosticsDesc: 'MCP search diagnostics description',
  mcpSearchStatus: 'MCP search status',
  mcpSearchActive: 'Active',
  mcpSearchInactive: 'Inactive',
  mcpSearchIndexed: 'Indexed',
  mcpSearchAdvertised: 'Advertised',
  configFilePath: 'External tool config path',
  mcpPathDesc: 'MCP JSON path description',
  mcpEditor: 'MCP editor',
  mcpEditorDesc: 'Model and API credentials do not live in this MCP file',
  mcpFileStatusReady: 'MCP config ready',
  mcpFileStatusMissing: 'MCP config missing',
  loading: 'Loading',
  mcpActions: 'MCP actions',
  mcpRuntimeHint: 'MCP runtime hint',
  mcpSave: 'Save MCP config',
  mcpReload: 'Reload MCP config',
  mcpOpenDir: 'Open MCP directory',
  permissions: 'Permissions',
  approvalPolicy: 'Approval policy',
  approvalPolicyDesc: 'Approval policy description',
  approvalAuto: 'Auto',
  approvalOnRequest: 'On request',
  approvalUntrusted: 'Untrusted',
  approvalSuggest: 'Suggest',
  approvalNever: 'Never',
  sandboxMode: 'Sandbox mode',
  sandboxModeDesc: 'Sandbox description',
  sandboxWorkspaceWrite: 'Workspace write',
  sandboxReadOnly: 'Read only',
  sandboxFullAccess: 'Full access',
  sandboxExternal: 'External sandbox'
}

function t(key: string, options?: Record<string, unknown>): string {
  let value = labels[key] ?? key
  for (const [optionKey, optionValue] of Object.entries(options ?? {})) {
    value = value.replace(new RegExp(`{{${optionKey}}}`, 'g'), String(optionValue))
  }
  return value
}

function baseCtx(): Record<string, unknown> {
  const noop = () => undefined
  const asyncNoop = async () => undefined
  const ref = { current: null }
  const kun = {
    ...defaultKunRuntimeSettings(),
    autoStart: true,
    runtimeToken: '',
    insecure: true
  }
  return {
    t,
    tCommon: t,
    form: { claw: { skills: { extraDirs: ['/tmp/project/.agents/skills'] } } },
    kun,
    activeApiKey: '',
    update: noop,
    updateKun: noop,
    updateSharedCredential: noop,
    sharedApiKey: '',
    sharedBaseUrl: '',
    showApiKey: false,
    setShowApiKey: noop,
    showRuntimeToken: false,
    setShowRuntimeToken: noop,
    portError: '',
    selectControlClass: 'select',
    openOnboardingPreview: noop,
    pickWorkspace: asyncNoop,
    resetWorkspaceToDefault: noop,
    workspacePickerError: '',
    guiUpdateInfo: null,
    checkingGuiUpdate: false,
    downloadingGuiUpdate: false,
    installingGuiUpdate: false,
    guiUpdateDownloaded: false,
    guiUpdateProgress: null,
    guiUpdateError: null,
    checkGuiUpdate: asyncNoop,
    downloadGuiUpdate: asyncNoop,
    installGuiUpdate: asyncNoop,
    logPath: '',
    logDirOpenError: '',
    setLogDirOpenError: noop,
    pickWriteWorkspace: asyncNoop,
    resetWriteWorkspaceToDefault: noop,
    writeWorkspacePickerError: '',
    writeInlineBaseUrlInherited: false,
    effectiveWriteInlineBaseUrl: '',
    writeInlineModelInherited: false,
    effectiveWriteInlineModel: '',
    setWriteDebugModalOpen: noop,
    loadWriteDebugEntries: asyncNoop,
    scrollToAgentSection: noop,
    agentsSectionRef: ref,
    skillSectionRef: ref,
    mcpSectionRef: ref,
    permissionsSectionRef: ref,
    selectedSkillRoot: {
      id: 'workspace',
      label: 'Workspace',
      path: '/tmp/project/.agents/skills',
      available: true
    },
    skillRootOptions: [
      {
        id: 'workspace',
        label: 'Workspace',
        path: '/tmp/project/.agents/skills',
        available: true
      }
    ],
    skillRootId: 'workspace',
    setSkillRootId: noop,
    skillNotice: null,
    openSkillRoot: asyncNoop,
    openPlugins: noop,
    mcpConfigPath: '/tmp/project/.kun/mcp.json',
    mcpConfigExists: true,
    mcpConfigText: '{"mcpServers":{}}',
    setMcpConfigText: noop,
    mcpLoading: false,
    mcpBusy: false,
    mcpNotice: null,
    saveMcpConfig: asyncNoop,
    loadMcpConfig: asyncNoop,
    openMcpConfigDir: asyncNoop,
    runtimeInfo: null,
    toolDiagnostics: null,
    memoryRecords: [],
    runtimeDiagnosticsBusy: false,
    runtimeDiagnosticsNotice: null,
    refreshKunDiagnostics: asyncNoop,
    disableMemoryRecord: asyncNoop,
    deleteMemoryRecord: asyncNoop,
    userAgentStackPreview: {
      enabled: true,
      importedAt: '2026-06-09T00:00:00.000Z',
      refreshedAt: '2026-06-09T00:00:00.000Z',
      sourcePaths: ['/tmp/codex-config.json'],
      skillRoots: [{
        path: '/tmp/project/.codex/skills',
        scope: 'project',
        source: 'workspace-codex',
        available: true
      }],
      mcpServers: [{
        id: 'github',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: '<redacted>' },
        trustScope: 'user',
        sourcePath: '/tmp/codex-config.json'
      }],
      cli: [
        { name: 'git', available: true, path: '/usr/bin/git', version: 'git version 2.50.0' },
        { name: 'hcloud', available: false }
      ],
      redactedPreviewJson: '{\n  "GITHUB_TOKEN": "<redacted>"\n}',
      validationErrors: []
    },
    userAgentStackBusy: false,
    userAgentStackNotice: null,
    previewUserAgentStack: asyncNoop,
    importUserAgentStack: asyncNoop,
    pickClawWorkspace: asyncNoop,
    resetClawWorkspaceToDefault: noop,
    clawWorkspacePickerError: '',
    splitSettingsList: (value: string) => value.split('\n').filter(Boolean),
    listSettingsText: (value: string[]) => value.join('\n')
  }
}

describe('AgentsSettingsSection Kun diagnostics smoke', () => {
  it('builds one settings patch when selecting a newly added provider', () => {
    const provider = defaultModelProviderSettings()
    const nextProvider: ModelProviderProfileV1 = {
      id: 'custom-provider-3',
      name: 'Custom provider',
      apiKey: '',
      baseUrl: 'https://custom.example/v1',
      endpointFormat: 'chat_completions',
      models: [],
      catalogModels: []
    }

    expect(modelProvidersSettingsPatch({
      provider,
      providers: [...provider.providers, nextProvider],
      kun: { providerId: nextProvider.id }
    })).toEqual({
      provider: {
        apiKey: provider.providers[0].apiKey,
        baseUrl: provider.providers[0].baseUrl,
        providers: [...provider.providers, nextProvider]
      },
      agents: {
        kun: {
          providerId: 'custom-provider-3'
        }
      }
    })
  })

  it('keeps advanced agent controls behind collapsed disclosures', () => {
    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx: baseCtx() }))

    expect(html).toContain('Assistant advanced settings')
    expect(html).toContain('Token-saving advanced settings')
    expect(html).toContain('MCP advanced settings')
    expect(html).not.toContain('<details open')
  })

  it('renders User Agent Stack import status and a redacted preview', () => {
    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx: baseCtx() }))

    expect(html).toContain('User Agent Stack')
    expect(html).toContain('Import stack')
    expect(html).toContain('Refresh preview')
    expect(html).toContain('Skills 1')
    expect(html).toContain('MCP 1')
    expect(html).toContain('Ready CLI')
    expect(html).toContain('Missing CLI')
    expect(html).toContain('&lt;redacted&gt;')
    expect(html).not.toContain('ghp_secret')
  })

  it('renders pure JSONL as a selectable storage backend', () => {
    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx: baseCtx() }))

    expect(html).toContain('Storage backend')
    expect(html).toContain('<option value="hybrid"')
    expect(html).toContain('Hybrid storage')
    expect(html).toContain('<option value="file"')
    expect(html).toContain('Pure JSONL file storage')
  })

  it('shows DeepSeek V4 model compaction thresholds from the model profile', () => {
    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx: baseCtx() }))

    expect(html).toContain('Current model context policy')
    expect(html).toContain('deepseek-v4-pro')
    expect(html).toContain('Built-in model config')
    expect(html).toContain('1,000,000')
    expect(html).toContain('980,000')
    expect(html).toContain('990,000')
    expect(html).toContain('Fallback compaction thresholds')
  })

  it('renders a catalog-backed Kun model picker with provider, context, price, reasoning, and tool filters', () => {
    const ctx = {
      ...baseCtx(),
      provider: {
        apiKey: '',
        baseUrl: 'https://api.deepseek.com',
        providers: [
          {
            id: 'deepseek',
            name: 'DeepSeek',
            apiKey: '',
            baseUrl: 'https://api.deepseek.com',
            models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
            catalogModels: []
          },
          {
            id: 'openrouter',
            name: 'OpenRouter',
            apiKey: '',
            baseUrl: 'https://openrouter.ai/api/v1',
            models: ['openai/gpt-4.1-mini'],
            catalogUpdatedAt: '2026-06-09T00:00:00.000Z',
            catalogModels: [{
              id: 'openai/gpt-4.1-mini',
              name: 'OpenAI: GPT-4.1 Mini',
              providerId: 'openrouter',
              contextLength: 1047576,
              tokenizer: 'GPT',
              pricingUsdPerMillion: {
                input: 0.4,
                output: 1.6,
                cacheRead: 0.1
              },
              capabilities: {
                inputModalities: ['text'],
                outputModalities: ['text'],
                reasoning: true,
                tools: true,
                recommendedUse: ['coding', 'review']
              }
            }]
          }
        ]
      }
    }
    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx }))

    expect(html).toContain('Model picker')
    expect(html).toContain('Provider filter')
    expect(html).toContain('Minimum context')
    expect(html).toContain('Max input price')
    expect(html).toContain('Recommended use')
    expect(html).toContain('OpenRouter')
    expect(html).toContain('OpenAI: GPT-4.1 Mini')
    expect(html).toContain('openai/gpt-4.1-mini')
    expect(html).toContain('Reasoning')
    expect(html).toContain('Tools')
    expect(html).toContain('$0.40')
    expect(html).not.toContain('sk-openrouter-secret')
  })

  it('renders subagent enablement, cheap child model, budgets, and workflow presets', () => {
    const ctx = {
      ...baseCtx(),
      kun: {
        ...(baseCtx().kun as any),
        subagents: {
          ...defaultKunRuntimeSettings().subagents,
          enabled: true,
          defaultModel: 'deepseek-v4-flash',
          defaultPreset: 'review_swarm',
          maxParallel: 3,
          maxChildRuns: 8,
          maxTotalChildTokens: 77_000,
          maxChildCostUsd: 2.75,
          perAgentTimeoutMs: 90_000
        }
      }
    }

    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx }))

    expect(html).toContain('Subagents')
    expect(html).toContain('Enable delegate_task')
    expect(html).toContain('Child model')
    expect(html).toContain('deepseek-v4-flash')
    expect(html).toContain('Max parallel agents')
    expect(html).toContain('Max child tokens')
    expect(html).toContain('Max child cost')
    expect(html).toContain('Per-agent timeout')
    expect(html).toContain('Review swarm')
    expect(html).toContain('Implementation split')
    expect(html).toContain('Research split')
    expect(html).toContain('Audit split')
  })

  it('renders experimental automation settings and explicit permission gates', () => {
    const ctx = {
      ...baseCtx(),
      kun: {
        ...(baseCtx().kun as any),
        automation: {
          ...defaultKunRuntimeSettings().automation,
          enabled: true,
          permissions: {
            ...defaultKunRuntimeSettings().automation.permissions,
            browserNavigation: 'allow',
            screenshots: 'ask'
          }
        }
      }
    }

    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx }))

    expect(html).toContain('Automation foundation')
    expect(html).toContain('Experimental automation')
    expect(html).toContain('Browser workbench panel')
    expect(html).toContain('Local/dev targets only')
    expect(html).toContain('Allowed dev hosts')
    expect(html).toContain('Browser navigation')
    expect(html).toContain('Click and type')
    expect(html).toContain('Screenshots')
    expect(html).toContain('Local file access')
    expect(html).toContain('App/computer control')
    expect(html).toContain('Automation audit log')
  })

  it('renders MCP, Skill, web, attachment, and memory diagnostics', () => {
    const ctx = {
      ...baseCtx(),
      runtimeInfo: {
        pid: 123,
        capabilities: {
          model: { id: 'deepseek-chat' },
          mcp: { status: 'available', configuredServers: 2, connectedServers: 2 },
          web: { status: 'available', provider: 'brave-search' },
          skills: { status: 'available' },
          subagents: { status: 'available' },
          attachments: { status: 'available' },
          memory: { status: 'available' }
        }
      },
      toolDiagnostics: {
        providers: [{ id: 'builtin' }, { id: 'mcp' }, { id: 'web' }, { id: 'memory' }],
        mcpServers: [{ id: 'github' }],
        skills: { skills: [{ id: 'skill_docs' }] },
        attachments: { count: 1 }
      },
      memoryRecords: [
        {
          id: 'mem_1',
          content: 'Prefer pnpm for this workspace',
          scope: 'workspace',
          tags: ['tooling']
        }
      ]
    }

    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx }))

    expect(html).toContain('Kun diagnostics')
    expect(html).toContain('MCP')
    expect(html).toContain('available')
    expect(html).toContain('2/2')
    expect(html).toContain('brave-search')
    expect(html).toContain('Providers')
    expect(html).toContain('MCP servers')
    expect(html).toContain('Discovered Skills')
    expect(html).toContain('Prefer pnpm for this workspace')
    expect(html).toContain('mem_1')
    expect(html).toContain('Disable memory')
    expect(html).toContain('Delete memory')
  })

  it('describes MCP config as an external-tool JSON file instead of model credentials', () => {
    const html = renderToStaticMarkup(createElement(AgentsSettingsSection, { ctx: baseCtx() }))

    expect(html).toContain('External tool config path')
    expect(html).toContain('/tmp/project/.kun/mcp.json')
    expect(html).toContain('Model and API credentials do not live in this MCP file')
    expect(html).not.toContain('DeepSeek auth')
    expect(html).not.toContain('Base URL are stored in this file')
    expect(html).not.toContain('config.toml')
  })
})
