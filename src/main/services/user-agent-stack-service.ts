import { execFile as execFileCallback } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type {
  UserAgentStackCliStatusV1,
  UserAgentStackMcpServerV1,
  UserAgentStackProfileV1,
  UserAgentStackSkillRootScopeV1,
  UserAgentStackSkillRootV1,
  UserAgentStackValidationErrorV1
} from '../../shared/app-settings'
import { REDACTED_SECRET, redactSecretText } from '../../shared/secret-redaction'
import { expandHomePath } from './workspace-service'

const execFileAsync = promisify(execFileCallback)
const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|bearer|client[-_]?secret|password|secret|token)/i
const SECRET_FLAG_PATTERN = /^--?(?:api[-_]?key|authorization|bearer|client[-_]?secret|password|secret|token)$/i
const URL_SECRET_PARAM_PATTERN = /([?&](?:api[-_]?key|access[-_]?token|auth[-_]?token|token|key|secret)=)([^&#]+)/gi

export const DEFAULT_USER_AGENT_STACK_CLI_NAMES = [
  'codex',
  'gh',
  'hcloud',
  'node',
  'npm',
  'pnpm',
  'bun',
  'git',
  'docker',
  'python',
  'python3',
  'uv',
  'npx',
  'playwright',
  'claude',
  'gemini',
  'aider',
  'opencode',
  'goose',
  'cursor',
  'windsurf',
  'amp'
] as const

type ExecFileResult = { stdout?: string | Buffer; stderr?: string | Buffer }
type ExecFileLike = (
  command: string,
  args?: readonly string[],
  options?: { timeout?: number }
) => Promise<ExecFileResult>

export type UserAgentStackDiscoveryOptions = {
  homeDir?: string
  workspaceRoot?: string
  cliNames?: readonly string[]
  execFile?: ExecFileLike
  now?: () => Date
}

export async function discoverUserAgentStackProfile(
  options: UserAgentStackDiscoveryOptions = {}
): Promise<UserAgentStackProfileV1> {
  const baseHome = options.homeDir ?? homedir()
  const workspaceRoot = normalizePath(options.workspaceRoot)
  const now = (options.now ?? (() => new Date()))().toISOString()
  const validationErrors: UserAgentStackValidationErrorV1[] = []
  const [skillRoots, mcpDiscovery, cli] = await Promise.all([
    discoverUserAgentStackSkillRoots(baseHome, workspaceRoot),
    discoverUserAgentStackMcpServers(baseHome, workspaceRoot),
    checkUserAgentStackCli(options.cliNames ?? DEFAULT_USER_AGENT_STACK_CLI_NAMES, options.execFile ?? execFileAsync)
  ])
  validationErrors.push(...mcpDiscovery.validationErrors)
  const previewValue = redactUserAgentStackValue({
    sourcePaths: mcpDiscovery.sourcePaths,
    skillRoots,
    mcpServers: mcpDiscovery.mcpServers,
    cli,
    validationErrors
  })
  return {
    enabled: true,
    importedAt: now,
    refreshedAt: now,
    sourcePaths: mcpDiscovery.sourcePaths,
    skillRoots,
    mcpServers: mcpDiscovery.mcpServers,
    cli,
    redactedPreviewJson: JSON.stringify(previewValue, null, 2),
    validationErrors
  }
}

async function discoverUserAgentStackSkillRoots(
  homeDir: string,
  workspaceRoot: string
): Promise<UserAgentStackSkillRootV1[]> {
  const roots: UserAgentStackSkillRootV1[] = []
  if (workspaceRoot) {
    roots.push(
      skillRoot(join(workspaceRoot, '.codex', 'skills'), 'project', 'workspace-codex'),
      skillRoot(join(workspaceRoot, '.agents', 'skills'), 'project', 'workspace-agents'),
      skillRoot(join(workspaceRoot, 'skills'), 'project', 'workspace-skills')
    )
  }
  roots.push(
    skillRoot(join(homeDir, '.codex', 'skills'), 'user', 'codex-user'),
    skillRoot(join(homeDir, '.agents', 'skills'), 'user', 'agents-user')
  )
  for (const root of await discoverCodexPluginSkillRoots(join(homeDir, '.codex', 'plugins', 'cache'))) {
    roots.push(skillRoot(root, 'plugin', 'codex-plugin-cache'))
  }
  return uniqueSkillRoots(roots.filter((root) => root.available))
}

function skillRoot(path: string, scope: UserAgentStackSkillRootScopeV1, source: string): UserAgentStackSkillRootV1 {
  return {
    path: resolve(path),
    scope,
    source,
    available: skillRootHasPackages(path)
  }
}

async function discoverCodexPluginSkillRoots(cacheRoot: string): Promise<string[]> {
  const roots: string[] = []
  await collectSkillRoots(cacheRoot, roots, 0, 6)
  return roots
}

async function collectSkillRoots(root: string, roots: string[], depth: number, maxDepth: number): Promise<void> {
  if (depth > maxDepth || !existsSync(root)) return
  if (basename(root) === 'skills' && skillRootHasPackages(root)) {
    roots.push(root)
    return
  }
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => collectSkillRoots(join(root, entry.name), roots, depth + 1, maxDepth)))
}

function skillRootHasPackages(root: string): boolean {
  if (existsSync(join(root, 'SKILL.md')) || existsSync(join(root, 'skill.json'))) return true
  try {
    return readdirSync(root, { withFileTypes: true }).some((entry) =>
      entry.isDirectory() &&
      (existsSync(join(root, entry.name, 'SKILL.md')) || existsSync(join(root, entry.name, 'skill.json')))
    )
  } catch {
    return false
  }
}

type McpDiscoveryResult = {
  sourcePaths: string[]
  mcpServers: UserAgentStackMcpServerV1[]
  validationErrors: UserAgentStackValidationErrorV1[]
}

async function discoverUserAgentStackMcpServers(
  homeDir: string,
  workspaceRoot: string
): Promise<McpDiscoveryResult> {
  const configPaths = uniqueStrings([
    join(homeDir, '.codex', 'config.toml'),
    join(homeDir, '.codex', 'config.json'),
    join(homeDir, '.codex', 'mcp.json'),
    join(homeDir, '.agents', 'mcp.json'),
    workspaceRoot ? join(workspaceRoot, '.codex', 'config.toml') : '',
    workspaceRoot ? join(workspaceRoot, '.codex', 'mcp.json') : ''
  ].filter(Boolean))
  const sourcePaths: string[] = []
  const validationErrors: UserAgentStackValidationErrorV1[] = []
  const servers: UserAgentStackMcpServerV1[] = []
  for (const path of configPaths) {
    try {
      await access(path)
    } catch {
      continue
    }
    sourcePaths.push(path)
    try {
      const parsed = await readMcpConfig(path)
      servers.push(...convertUserAgentStackMcpServers(parsed, path))
    } catch (error) {
      validationErrors.push({
        source: path,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return {
    sourcePaths,
    mcpServers: dedupeMcpServers(servers),
    validationErrors
  }
}

async function readMcpConfig(path: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, 'utf8')
  if (path.endsWith('.toml')) return parseCodexMcpToml(text)
  const parsed = JSON.parse(text) as unknown
  return objectValue(parsed)
}

function parseCodexMcpToml(text: string): Record<string, unknown> {
  const servers: Record<string, Record<string, unknown>> = {}
  let current: Record<string, unknown> | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    if (!line) continue
    const section = /^\[mcp_servers\.([^\]]+)\]$/.exec(line)
    if (section) {
      const id = section[1]?.trim().replace(/^"|"$/g, '') ?? ''
      if (!id) {
        current = null
        continue
      }
      current = servers[id] ?? {}
      servers[id] = current
      continue
    }
    if (!current) continue
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line)
    if (!assignment) continue
    current[assignment[1] ?? ''] = parseTomlValue(assignment[2] ?? '')
  }
  return { mcpServers: servers }
}

function parseTomlValue(raw: string): unknown {
  const value = raw.trim()
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^\d+$/.test(value)) return Number(value)
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1)
      .split(',')
      .map((item) => parseTomlValue(item.trim()))
      .filter((item): item is string => typeof item === 'string')
  }
  if (value.startsWith('{') && value.endsWith('}')) {
    const record: Record<string, string> = {}
    for (const pair of value.slice(1, -1).split(',')) {
      const match = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(pair.trim())
      if (!match) continue
      const parsed = parseTomlValue(match[2] ?? '')
      if (typeof parsed === 'string') record[match[1] ?? ''] = parsed
    }
    return record
  }
  return value
}

export function convertUserAgentStackMcpServers(
  config: Record<string, unknown>,
  sourcePath = ''
): UserAgentStackMcpServerV1[] {
  const rawServers = mcpServersFromConfig(config)
  return Object.entries(rawServers)
    .map(([id, server]) => normalizeMcpServer(id, server, sourcePath))
    .filter((server): server is UserAgentStackMcpServerV1 => server !== null)
}

function mcpServersFromConfig(config: Record<string, unknown>): Record<string, unknown> {
  const mcpServers = objectValue(config.mcpServers)
  if (Object.keys(mcpServers).length > 0) return mcpServers
  const servers = objectValue(config.servers)
  if (Object.keys(servers).length > 0) return servers
  const capabilities = objectValue(config.capabilities)
  const mcp = objectValue(capabilities.mcp)
  return objectValue(mcp.servers)
}

function normalizeMcpServer(id: string, server: unknown, sourcePath: string): UserAgentStackMcpServerV1 | null {
  const raw = objectValue(server)
  const command = scalarStringValue(raw.command)
  const url = scalarStringValue(raw.url)
  const transport = normalizeMcpTransport(raw.transport, command, url)
  if (!transport) return null
  const trustedWorkspaceRoots = stringArrayValue(raw.trustedWorkspaceRoots).map((path) => resolve(expandHomePath(path)))
  const trustScope = raw.trustScope === 'workspace' || trustedWorkspaceRoots.length > 0 ? 'workspace' : 'user'
  if (trustScope === 'workspace' && trustedWorkspaceRoots.length === 0) return null
  return {
    id,
    enabled: raw.enabled === false || raw.disabled === true ? false : true,
    transport,
    ...(command ? { command } : {}),
    args: redactUserAgentStackValue(stringArrayValue(raw.args)) as string[],
    ...(url ? { url: redactUserAgentStackValue(url) as string } : {}),
    headers: redactUserAgentStackValue(stringRecordValue(raw.headers)) as Record<string, string>,
    env: redactUserAgentStackValue(stringRecordValue(raw.env)) as Record<string, string>,
    trustScope,
    trustedWorkspaceRoots,
    ...(positiveIntegerValue(raw.timeoutMs) ? { timeoutMs: positiveIntegerValue(raw.timeoutMs) } : {}),
    ...(sourcePath ? { sourcePath } : {})
  }
}

function normalizeMcpTransport(
  value: unknown,
  command: string | undefined,
  url: string | undefined
): 'stdio' | 'streamable-http' | 'sse' | null {
  if (value === 'stdio' || value === 'streamable-http' || value === 'sse') return value
  if (command) return 'stdio'
  if (url) return 'streamable-http'
  return null
}

export async function checkUserAgentStackCli(
  cliNames: readonly string[],
  execFile: ExecFileLike = execFileAsync
): Promise<UserAgentStackCliStatusV1[]> {
  return Promise.all(uniqueStrings([...cliNames]).map((name) => checkCli(name, execFile)))
}

async function checkCli(name: string, execFile: ExecFileLike): Promise<UserAgentStackCliStatusV1> {
  try {
    const result = await execFile(name, ['--version'], { timeout: 2_500 })
    const version = firstLine(`${result.stdout ?? ''}${result.stderr ?? ''}`)
    return {
      name,
      available: true,
      path: await which(name, execFile),
      ...(version ? { version } : {})
    }
  } catch (error) {
    return {
      name,
      available: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

async function which(name: string, execFile: ExecFileLike): Promise<string | undefined> {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which'
    const result = await execFile(command, [name], { timeout: 2_500 })
    return firstLine(`${result.stdout ?? ''}`) || undefined
  } catch {
    return undefined
  }
}

export function redactUserAgentStackValue<T>(value: T): T {
  return redact(value) as T
}

function redact(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const previous = typeof value[index - 1] === 'string' ? value[index - 1] : ''
      if (SECRET_FLAG_PATTERN.test(previous)) return REDACTED_SECRET
      return redact(item, key)
    })
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value
    if (SECRET_KEY_PATTERN.test(key)) return REDACTED_SECRET
    return redactSecretText(value).replace(URL_SECRET_PARAM_PATTERN, `$1${REDACTED_SECRET}`)
  }
  const out: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = SECRET_KEY_PATTERN.test(childKey)
      ? REDACTED_SECRET
      : redact(childValue, childKey)
  }
  return out
}

function normalizePath(path: string | undefined): string {
  const expanded = expandHomePath(path ?? '')
  return expanded ? resolve(expanded) : ''
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function stringRecordValue(value: unknown): Record<string, string> {
  const record = objectValue(value)
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(record)) {
    const normalized = scalarStringValue(item)
    if (normalized !== undefined) out[key] = normalized
  }
  return out
}

function scalarStringValue(value: unknown): string | undefined {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : undefined
}

function positiveIntegerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function uniqueSkillRoots(roots: UserAgentStackSkillRootV1[]): UserAgentStackSkillRootV1[] {
  const seen = new Set<string>()
  const out: UserAgentStackSkillRootV1[] = []
  for (const root of roots) {
    const key = comparablePath(root.path)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(root)
  }
  return out
}

function dedupeMcpServers(servers: UserAgentStackMcpServerV1[]): UserAgentStackMcpServerV1[] {
  const seen = new Map<string, UserAgentStackMcpServerV1>()
  for (const server of servers) {
    if (!seen.has(server.id)) seen.set(server.id, server)
  }
  return [...seen.values()]
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function comparablePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? ''
}
