export type Phase7Scope = 'project' | 'user' | 'plugin' | 'runtime'

export type Phase7SkillDiagnostic = {
  id: string
  name: string
  description?: string
  root: string
  entryPath: string
  scope: 'project' | 'global'
  source: string
  enabled: boolean
  legacy: boolean
  triggers: string[]
}

export type Phase7PluginDiagnostic = {
  id: string
  name: string
  version?: string
  description?: string
  root: string
  manifestPath: string
  enabled: boolean
  executesCode: false
  redaction: 'secret-values-redacted'
  manifestPreview: unknown
  validationErrors: string[]
}

export type Phase7HookPhase =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PermissionRequest'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionStop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'Compaction'

export type Phase7HookDiagnostic = {
  id: string
  phase: Phase7HookPhase
  enabled: boolean
  implemented: boolean
  executionOwner: 'kun'
  trustReviewRequired: boolean
  timeoutMs: number
  mutating: boolean
  audit: 'required' | 'not_applicable'
  description: string
}

export type Phase7RuleDiagnostic = {
  id: string
  scope: Phase7Scope
  source: string
  enabled: boolean
  redactedPreview: string
}

export type Phase7MemoryDiagnostic = {
  enabled: boolean
  scopes: Array<'user' | 'workspace' | 'project'>
  maxInjectedRecords: number
  controls: Array<'create' | 'disable' | 'delete'>
  redaction: 'secret-values-redacted'
}

export type Phase7CompatibilityDiagnostic = {
  id: 'codex' | 'claude-code' | 'opencode' | 'mcp'
  label: string
  status: 'ready' | 'partial'
  supportedInputs: string[]
  limitations: string[]
}

export type Phase7DiagnosticsResult =
  | {
      ok: true
      generatedAt: string
      skills: Phase7SkillDiagnostic[]
      skillValidationErrors: Array<{ root: string; message: string }>
      plugins: Phase7PluginDiagnostic[]
      hooks: Phase7HookDiagnostic[]
      rules: Phase7RuleDiagnostic[]
      memory: Phase7MemoryDiagnostic
      compatibilitySources: Phase7CompatibilityDiagnostic[]
    }
  | {
      ok: false
      message: string
    }
