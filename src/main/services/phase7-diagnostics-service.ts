import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { AppSettingsV1 } from '../../shared/app-settings'
import { redactSecretText, redactSecrets } from '../../shared/secret-redaction'
import type {
  Phase7CompatibilityDiagnostic,
  Phase7DiagnosticsResult,
  Phase7HookDiagnostic,
  Phase7MemoryDiagnostic,
  Phase7PluginDiagnostic,
  Phase7RuleDiagnostic,
  Phase7SkillDiagnostic
} from '../../shared/phase7-diagnostics'
import { listGuiSkills } from './skill-service'
import { expandHomePath } from './workspace-service'

export type Phase7DiagnosticsOptions = {
  workspaceRoot?: string
  homeDir?: string
  now?: () => Date
}

export async function getPhase7Diagnostics(
  settings: AppSettingsV1,
  options: Phase7DiagnosticsOptions = {}
): Promise<Phase7DiagnosticsResult> {
  try {
    const workspaceRoot = options.workspaceRoot || settings.workspaceRoot
    const homeDir = options.homeDir ?? homedir()
    const [skillResult, plugins] = await Promise.all([
      listGuiSkills(settings, workspaceRoot),
      listPluginDiagnostics(homeDir)
    ])
    const skills = skillResult.ok
      ? await Promise.all(skillResult.skills.map((skill) => skillDiagnostic(skill)))
      : []
    return {
      ok: true,
      generatedAt: (options.now ?? (() => new Date()))().toISOString(),
      skills,
      skillValidationErrors: skillResult.ok ? skillResult.validationErrors : [{ root: workspaceRoot, message: skillResult.message }],
      plugins,
      hooks: hookDiagnostics(),
      rules: ruleDiagnostics(settings),
      memory: memoryDiagnostics(),
      compatibilitySources: compatibilityDiagnostics(settings)
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

async function skillDiagnostic(skill: {
  id: string
  name: string
  description?: string
  root: string
  entryPath: string
  scope: 'project' | 'global'
  legacy: boolean
}): Promise<Phase7SkillDiagnostic> {
  return {
    ...skill,
    source: skillSource(skill.root),
    enabled: true,
    triggers: await readSkillTriggers(skill.entryPath)
  }
}

function skillSource(root: string): string {
  const normalized = root.replaceAll('\\', '/')
  if (normalized.includes('/.codex/plugins/cache/')) return 'codex-plugin-cache'
  if (normalized.includes('/.codex/skills')) return 'workspace-codex'
  if (normalized.includes('/.agents/skills')) return 'workspace-agents'
  if (normalized.endsWith('/skills') || normalized.includes('/skills/')) return 'workspace-skills'
  return 'configured-extra-root'
}

async function readSkillTriggers(entryPath: string): Promise<string[]> {
  try {
    const content = await readFile(entryPath, 'utf8')
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
    if (!match) return []
    const yaml = match[1] ?? ''
    const triggerLine = /^triggers:\s*(.+?)\s*$/m.exec(yaml)?.[1]
    if (!triggerLine) return []
    return triggerLine
      .split(',')
      .map((trigger) => trigger.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  } catch {
    return []
  }
}

async function listPluginDiagnostics(homeDir: string): Promise<Phase7PluginDiagnostic[]> {
  const cacheRoot = resolve(expandHomePath(join(homeDir, '.codex', 'plugins', 'cache')))
  const manifests: string[] = []
  await collectPluginManifests(cacheRoot, manifests, 0, 7)
  const plugins = await Promise.all(manifests.map(readPluginManifestDiagnostic))
  return plugins.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectPluginManifests(root: string, manifests: string[], depth: number, maxDepth: number): Promise<void> {
  if (depth > maxDepth || !existsSync(root)) return
  const pluginManifestPath = join(root, '.codex-plugin', 'plugin.json')
  if (existsSync(pluginManifestPath)) {
    manifests.push(pluginManifestPath)
    return
  }
  const directManifestPath = join(root, 'plugin.json')
  if (existsSync(directManifestPath) && basename(dirname(directManifestPath)) !== '.codex-plugin') {
    manifests.push(directManifestPath)
    return
  }
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => collectPluginManifests(join(root, entry.name), manifests, depth + 1, maxDepth)))
}

async function readPluginManifestDiagnostic(manifestPath: string): Promise<Phase7PluginDiagnostic> {
  const validationErrors: string[] = []
  let manifest: Record<string, unknown> = {}
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    validationErrors.push(error instanceof Error ? error.message : String(error))
  }
  const id = stringValue(manifest.id) || slug(stringValue(manifest.name) || basename(dirname(manifestPath)))
  const name = stringValue(manifest.name) || titleFromSlug(id)
  const version = stringValue(manifest.version)
  const description = stringValue(manifest.description)
  return {
    id,
    name,
    ...(version ? { version } : {}),
    ...(description ? { description } : {}),
    root: dirname(dirname(manifestPath)),
    manifestPath,
    enabled: validationErrors.length === 0,
    executesCode: false,
    redaction: 'secret-values-redacted',
    manifestPreview: redactSecrets(manifest),
    validationErrors
  }
}

function hookDiagnostics(): Phase7HookDiagnostic[] {
  return [
    hook('PreToolUse', true, true, 'Runs before Kun tool execution and can allow, deny, or rewrite arguments.'),
    hook('PostToolUse', true, false, 'Runs after Kun tool execution and can annotate or rewrite tool output.'),
    hook('PermissionRequest', false, true, 'Lifecycle contract for approval requests before privileged actions.'),
    hook('UserPromptSubmit', false, false, 'Lifecycle contract for deterministic user prompt validation.'),
    hook('SessionStart', false, false, 'Lifecycle contract for session initialization checks.'),
    hook('SessionStop', false, false, 'Lifecycle contract for session shutdown cleanup.'),
    hook('SubagentStart', false, false, 'Lifecycle contract for child-agent launch policy.'),
    hook('SubagentStop', false, false, 'Lifecycle contract for child-agent completion policy.'),
    hook('Compaction', false, false, 'Lifecycle contract for memory and summary compaction guardrails.')
  ]
}

function hook(
  phase: Phase7HookDiagnostic['phase'],
  implemented: boolean,
  mutating: boolean,
  description: string
): Phase7HookDiagnostic {
  return {
    id: phase,
    phase,
    enabled: implemented,
    implemented,
    executionOwner: 'kun',
    trustReviewRequired: true,
    timeoutMs: 5_000,
    mutating,
    audit: mutating ? 'required' : 'not_applicable',
    description
  }
}

function ruleDiagnostics(settings: AppSettingsV1): Phase7RuleDiagnostic[] {
  return [
    rule('code-prompt-prefix', 'project', 'codePromptPrefix', settings.codePromptPrefix),
    rule('claw-skill-prompt-prefix', 'user', 'claw.skills.promptPrefix', settings.claw.skills.promptPrefix),
    rule('schedule-prompt-prefix', 'user', 'schedule.promptPrefix', settings.schedule.promptPrefix)
  ].filter((rule) => rule.enabled)
}

function rule(
  id: string,
  scope: Phase7RuleDiagnostic['scope'],
  source: string,
  value: string
): Phase7RuleDiagnostic {
  const trimmed = value.trim()
  return {
    id,
    scope,
    source,
    enabled: Boolean(trimmed),
    redactedPreview: redactSecretText(trimmed)
  }
}

function memoryDiagnostics(): Phase7MemoryDiagnostic {
  return {
    enabled: true,
    scopes: ['user', 'workspace', 'project'],
    maxInjectedRecords: 8,
    controls: ['create', 'disable', 'delete'],
    redaction: 'secret-values-redacted'
  }
}

function compatibilityDiagnostics(settings: AppSettingsV1): Phase7CompatibilityDiagnostic[] {
  const imported = settings.agents.kun.userAgentStack
  return [
    {
      id: 'codex',
      label: 'Codex',
      status: 'ready',
      supportedInputs: ['.codex/skills', '.codex/config.toml', '.codex/mcp.json', '.codex/plugins/cache'],
      limitations: imported.validationErrors.map((error) => error.message)
    },
    {
      id: 'claude-code',
      label: 'Claude Code',
      status: 'partial',
      supportedInputs: ['SKILL.md-compatible skill folders', 'MCP-style server metadata'],
      limitations: ['Claude-specific settings and hook commands are inventoried before execution.']
    },
    {
      id: 'opencode',
      label: 'OpenCode',
      status: 'partial',
      supportedInputs: ['skill folders', 'MCP-compatible server metadata'],
      limitations: ['Unsupported fields are surfaced as diagnostics rather than executed.']
    },
    {
      id: 'mcp',
      label: 'MCP',
      status: 'ready',
      supportedInputs: ['stdio servers', 'streamable-http servers', 'sse servers'],
      limitations: ['Secret-like env, headers, args, and URL params are redacted in previews.']
    }
  ]
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'plugin'
}

function titleFromSlug(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
