import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, cp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type {
  GitAuditAction,
  GitAuditEvent,
  GitAuditLogOptions,
  GitAuditLogResult,
  GitBranchesResult,
  GitDiffFile,
  GitDiffFileStatus,
  GitDiffResult,
  GitFileStatus,
  GitFileStatusCategory,
  GitPathMutationResult,
  GitReviewPreparationOptions,
  GitReviewPreparationResult,
  GitWorkingTreeStatus,
  GitWorktreeRemovalSnapshot,
  GitWorktreeHandoffOptions,
  GitWorktreeHandoffResult,
  GitWorktreeListResult,
  GitWorktreeRow,
  ManagedGitWorktreeCreateResult,
  ManagedGitWorktreeOptions,
  ManagedGitWorktreeRemoveOptions,
  ManagedGitWorktreeRemoveResult
} from '../../shared/git-branches'

const execFileAsync = promisify(execFile)

async function runGit(
  cwd: string,
  args: string[],
  timeout = 10_000
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 1024 * 1024
  })
  return { stdout: String(stdout), stderr: String(stderr) }
}

function gitFailure(error: unknown): GitBranchesResult {
  const message = error instanceof Error ? error.message : String(error)
  if (/not a git repository/i.test(message)) {
    return { ok: false, reason: 'not_git_repo', message: 'The working directory is not a Git repository.' }
  }
  if (/ENOENT/i.test(message) || /spawn git/i.test(message)) {
    return { ok: false, reason: 'git_unavailable', message: 'Git executable was not found.' }
  }
  return { ok: false, reason: 'error', message }
}

function gitFailureMessage(error: unknown): { reason: 'not_git_repo' | 'git_unavailable' | 'error'; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  if (/not a git repository/i.test(message)) {
    return { reason: 'not_git_repo', message: 'The working directory is not a Git repository.' }
  }
  if (/ENOENT/i.test(message) || /spawn git/i.test(message)) {
    return { reason: 'git_unavailable', message: 'Git executable was not found.' }
  }
  return { reason: 'error', message }
}

function parseStatusPath(raw: string): string {
  const renamedSeparator = ' -> '
  if (raw.includes(renamedSeparator)) {
    return raw.slice(raw.indexOf(renamedSeparator) + renamedSeparator.length).trim()
  }
  return raw.trim()
}

function categorizeStatus(indexStatus: string, workTreeStatus: string): GitFileStatusCategory {
  if (indexStatus === 'U' || workTreeStatus === 'U' || (indexStatus === 'A' && workTreeStatus === 'A')) {
    return 'conflicted'
  }
  if (indexStatus === '?' && workTreeStatus === '?') {
    return 'untracked'
  }
  if (indexStatus === 'R' || workTreeStatus === 'R') {
    return 'renamed'
  }
  if (indexStatus === 'D' || workTreeStatus === 'D') {
    return 'deleted'
  }
  if (indexStatus.trim()) {
    return 'staged'
  }
  return 'modified'
}

function parseGitStatus(stdout: string): GitWorkingTreeStatus {
  const files = stdout
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line): GitFileStatus => {
      const indexStatus = line[0] ?? ' '
      const workTreeStatus = line[1] ?? ' '
      return {
        path: parseStatusPath(line.slice(3)),
        indexStatus,
        workTreeStatus,
        category: categorizeStatus(indexStatus, workTreeStatus)
      }
    })

  return {
    clean: files.length === 0,
    stagedCount: files.filter((file) => file.category === 'staged' || file.category === 'renamed').length,
    modifiedCount: files.filter((file) => file.category === 'modified' || file.category === 'deleted').length,
    untrackedCount: files.filter((file) => file.category === 'untracked').length,
    conflictedCount: files.filter((file) => file.category === 'conflicted').length,
    files
  }
}

async function getGitStatus(cwd: string): Promise<GitWorkingTreeStatus> {
  const statusRaw = (await runGit(cwd, ['status', '--porcelain=v1'])).stdout
  return parseGitStatus(statusRaw)
}

async function getRepositoryRoot(cwd: string): Promise<string> {
  return (await runGit(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim()
}

async function getGitCommonDir(repositoryRoot: string): Promise<string> {
  const raw = (await runGit(repositoryRoot, ['rev-parse', '--git-common-dir'])).stdout.trim()
  return isAbsolute(raw) ? raw : resolve(repositoryRoot, raw)
}

async function gitAuditLogPath(repositoryRoot: string): Promise<string> {
  const commonDir = await getGitCommonDir(repositoryRoot)
  return join(commonDir, 'opencodex', 'git-audit.jsonl')
}

function makeGitAuditId(timestamp: string, action: GitAuditAction): string {
  const digest = createHash('sha256')
    .update(`${timestamp}:${action}:${process.hrtime.bigint().toString()}`)
    .digest('hex')
    .slice(0, 16)
  return `git_${digest}`
}

async function appendGitAuditEvent(
  repositoryRoot: string,
  event: Omit<GitAuditEvent, 'id' | 'timestamp' | 'outcome' | 'repositoryRoot'>
): Promise<GitAuditEvent> {
  const timestamp = new Date().toISOString()
  const auditEvent: GitAuditEvent = {
    id: makeGitAuditId(timestamp, event.action),
    timestamp,
    outcome: 'completed',
    repositoryRoot,
    ...event
  }
  const auditPath = await gitAuditLogPath(repositoryRoot)
  await mkdir(dirname(auditPath), { recursive: true })
  await appendFile(auditPath, `${JSON.stringify(auditEvent)}\n`, 'utf8')
  return auditEvent
}

function metadataIdForPath(path: string): string {
  return createHash('sha256').update(resolve(path)).digest('hex')
}

async function canonicalLocalPath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return resolve(path)
  }
}

async function managedWorktreeMetadataPath(repositoryRoot: string, worktreePath: string): Promise<string> {
  const commonDir = await getGitCommonDir(repositoryRoot)
  const canonicalWorktreePath = await canonicalLocalPath(worktreePath)
  return join(commonDir, 'opencodex', 'managed-worktrees', `${metadataIdForPath(canonicalWorktreePath)}.json`)
}

async function isManagedWorktree(repositoryRoot: string, worktreePath: string): Promise<boolean> {
  const metadataPath = await managedWorktreeMetadataPath(repositoryRoot, worktreePath)
  try {
    const raw = await readFile(metadataPath, 'utf8')
    const metadata = JSON.parse(raw) as { managedBy?: unknown; path?: unknown }
    const storedPath = await canonicalLocalPath(String(metadata.path))
    const currentPath = await canonicalLocalPath(worktreePath)
    return metadata.managedBy === 'opencodex-desktop' && storedPath === currentPath
  } catch {
    return false
  }
}

async function writeManagedWorktreeMetadata(
  repositoryRoot: string,
  worktreePath: string,
  metadata: {
    branch: string
    baseBranch: string
  }
): Promise<void> {
  const metadataPath = await managedWorktreeMetadataPath(repositoryRoot, worktreePath)
  const canonicalWorktreePath = await canonicalLocalPath(worktreePath)
  await mkdir(dirname(metadataPath), { recursive: true })
  await writeFile(
    metadataPath,
    `${JSON.stringify({
      managedBy: 'opencodex-desktop',
      repositoryRoot,
      path: canonicalWorktreePath,
      branch: metadata.branch,
      baseBranch: metadata.baseBranch,
      createdAt: new Date().toISOString()
    }, null, 2)}\n`,
    'utf8'
  )
}

async function removeManagedWorktreeMetadata(repositoryRoot: string, worktreePath: string): Promise<void> {
  const metadataPath = await managedWorktreeMetadataPath(repositoryRoot, worktreePath)
  await rm(metadataPath, { force: true })
}

function sanitizeWorktreeName(branch: string): string {
  return branch
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'worktree'
}

function sanitizeSnapshotName(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'worktree'
}

function parseGitWorktreeList(stdout: string): GitWorktreeRow[] {
  const rows: GitWorktreeRow[] = []
  let current: Partial<GitWorktreeRow> | null = null

  const pushCurrent = (): void => {
    if (!current?.path) return
    rows.push({
      path: current.path,
      head: current.head ?? null,
      branch: current.branch ?? null,
      bare: current.bare ?? false,
      detached: current.detached ?? !current.branch,
      locked: current.locked ?? false,
      prunable: current.prunable ?? false,
      managed: current.managed ?? false
    })
  }

  for (const line of stdout.split('\n')) {
    if (!line.trim()) {
      pushCurrent()
      current = null
      continue
    }
    const [key, ...rest] = line.split(' ')
    const value = rest.join(' ')
    if (key === 'worktree') {
      pushCurrent()
      current = { path: value }
      continue
    }
    if (!current) continue
    if (key === 'HEAD') current.head = value
    if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '')
    if (key === 'bare') current.bare = true
    if (key === 'detached') current.detached = true
    if (key === 'locked') current.locked = true
    if (key === 'prunable') current.prunable = true
  }
  pushCurrent()
  return rows
}

function pathFromDiffHeader(line: string): string {
  return line.replace(/^[ab]\//, '').trim()
}

function statusFromDiffHeader(lines: string[], fallbackPath: string): GitDiffFileStatus {
  if (lines.some((line) => line.startsWith('new file mode'))) return 'added'
  if (lines.some((line) => line.startsWith('deleted file mode'))) return 'deleted'
  if (lines.some((line) => line.startsWith('rename from ') || line.startsWith('rename to '))) return 'renamed'
  if (lines.some((line) => line.includes('Unmerged'))) return 'conflicted'
  if (fallbackPath) return 'modified'
  return 'modified'
}

function parseUnifiedDiff(stdout: string, staged: boolean): GitDiffFile[] {
  const files: GitDiffFile[] = []
  const chunks = stdout
    .split('\ndiff --git ')
    .map((chunk, index) => (index === 0 ? chunk : `diff --git ${chunk}`))
    .filter((chunk) => chunk.trim().length > 0)

  for (const chunk of chunks) {
    const lines = chunk.split('\n')
    const first = lines[0] ?? ''
    const match = first.match(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/)
    const headerPath = match ? pathFromDiffHeader(match[2]) : ''
    const renameFrom = lines.find((line) => line.startsWith('rename from '))?.slice('rename from '.length)
    const renameTo = lines.find((line) => line.startsWith('rename to '))?.slice('rename to '.length)
    const path = renameTo ?? headerPath
    if (!path) continue
    const patch = lines.join('\n')
    files.push({
      path,
      ...(renameFrom ? { oldPath: renameFrom } : {}),
      status: statusFromDiffHeader(lines, path),
      staged,
      additions: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
      deletions: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
      patch
    })
  }

  return files
}

function validateGitRelativePaths(paths: readonly string[]): string[] {
  const normalized = paths.map((path) => path.trim()).filter(Boolean)
  if (normalized.length === 0) {
    throw new Error('At least one path is required.')
  }
  for (const path of normalized) {
    if (path.startsWith('/') || path.includes('\0') || path.split(/[\\/]/).some((part) => part === '..')) {
      throw new Error(`Invalid git path: ${path}`)
    }
  }
  return [...new Set(normalized)]
}

function formatStatusForHandoff(status: GitWorkingTreeStatus): string {
  if (status.clean) return '- Clean worktree'
  return status.files
    .map((file) => `- ${file.indexStatus}${file.workTreeStatus} ${file.path}`)
    .join('\n')
}

function formatStatusShort(status: GitWorkingTreeStatus): string {
  if (status.clean) return ''
  return `${status.files
    .map((file) => `${file.indexStatus}${file.workTreeStatus} ${file.path}`)
    .join('\n')}\n`
}

function shellQuotePath(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`
}

function shellQuoteValue(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function buildWorktreeHandoffMarkdown(input: {
  repositoryRoot: string
  path: string
  branch: string | null
  status: GitWorkingTreeStatus
  options?: GitWorktreeHandoffOptions
}): string {
  const lines = [
    '# OpenCodex Worktree Handoff',
    '',
    '## Context',
    '',
    `- Repository: ${input.repositoryRoot}`,
    `- Worktree: ${input.path}`,
    `- Branch: ${input.branch ?? '(detached)'}`,
    ...(input.options?.threadId ? [`- Thread: ${input.options.threadId}`] : []),
    ...(input.options?.goal ? [`- Goal: ${input.options.goal}`] : []),
    '',
    '## Working Tree',
    '',
    formatStatusForHandoff(input.status),
    '',
    '## Resume Commands',
    '',
    '```bash',
    `cd ${shellQuotePath(input.path)}`,
    'git status --short',
    'git branch --show-current',
    '```',
    '',
    '## Safety Notes',
    '',
    '- This handoff describes a managed OpenCodex worktree.',
    '- Review local changes before cleanup, staging, committing, pushing, or opening a PR.',
    '- Do not remove this worktree if `git status --short` reports local changes.'
  ]

  return `${lines.join('\n')}\n`
}

function formatFileList(paths: readonly string[], emptyText: string): string {
  if (paths.length === 0) return `- ${emptyText}`
  return paths.map((path) => `- ${path}`).join('\n')
}

function buildGitReviewPreparationMarkdown(input: {
  repositoryRoot: string
  currentBranch: string | null
  upstream: string | null
  stagedFiles: string[]
  unstagedFiles: string[]
  untrackedFiles: string[]
  blockedReasons: string[]
  suggestedCommands: string[]
}): string {
  const notIncluded = [
    ...input.unstagedFiles.map((path) => `- M  ${path}`),
    ...input.untrackedFiles.map((path) => `- ?? ${path}`)
  ]
  const lines = [
    '# Git Review Preparation',
    '',
    '## Context',
    '',
    `- Repository: ${input.repositoryRoot}`,
    `- Branch: ${input.currentBranch ?? '(detached)'}`,
    `- Upstream: ${input.upstream ?? '(none)'}`,
    '',
    '## Staged Files',
    '',
    formatFileList(input.stagedFiles, 'No staged files'),
    '',
    '## Not Included',
    '',
    notIncluded.length > 0 ? notIncluded.join('\n') : '- No unstaged or untracked files',
    '',
    '## Gates',
    '',
    input.blockedReasons.length > 0 ? input.blockedReasons.map((reason) => `- ${reason}`).join('\n') : '- Ready for explicit user action',
    '',
    '## Suggested Commands',
    '',
    '```bash',
    ...input.suggestedCommands,
    '```',
    '',
    '## Safety Notes',
    '',
    '- These commands are preparation only; OpenCodex has not committed, pushed, or opened a PR.',
    '- Re-check `git status --short` immediately before running any mutation command.',
    '- Keep unrelated dirty and untracked files out of staging unless explicitly selected.'
  ]
  return `${lines.join('\n')}\n`
}

async function getOptionalUpstream(cwd: string): Promise<string | null> {
  try {
    const upstream = (await runGit(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).stdout.trim()
    return upstream || null
  } catch {
    return null
  }
}

function filesByStatus(status: GitWorkingTreeStatus): {
  stagedFiles: string[]
  unstagedFiles: string[]
  untrackedFiles: string[]
} {
  return {
    stagedFiles: status.files
      .filter((file) => file.indexStatus.trim() && file.category !== 'untracked' && file.category !== 'conflicted')
      .map((file) => file.path),
    unstagedFiles: status.files
      .filter((file) => file.workTreeStatus.trim() && file.category !== 'untracked' && file.category !== 'conflicted')
      .map((file) => file.path),
    untrackedFiles: status.files
      .filter((file) => file.category === 'untracked')
      .map((file) => file.path)
  }
}

async function createDirtyWorktreeRemovalSnapshot(input: {
  worktreePath: string
  branch: string | null
  status: GitWorkingTreeStatus
  snapshotParent?: string
}): Promise<GitWorktreeRemovalSnapshot> {
  const createdAt = new Date().toISOString()
  const snapshotParent = input.snapshotParent?.trim()
    ? resolve(input.snapshotParent)
    : join(dirname(input.worktreePath), '.opencodex-worktree-snapshots')
  const snapshotPath = join(
    snapshotParent,
    `${sanitizeSnapshotName(input.branch ?? basename(input.worktreePath))}-${createdAt.replace(/[:.]/g, '-')}`
  )
  const untrackedDir = join(snapshotPath, 'untracked')
  const trackedPatchPath = join(snapshotPath, 'tracked.patch')
  const stagedPatchPath = join(snapshotPath, 'staged.patch')
  const statusPath = join(snapshotPath, 'status.txt')
  await mkdir(untrackedDir, { recursive: true })

  const trackedPatch = (await runGit(input.worktreePath, ['diff', '--binary'], 30_000)).stdout
  const stagedPatch = (await runGit(input.worktreePath, ['diff', '--cached', '--binary'], 30_000)).stdout
  await writeFile(trackedPatchPath, trackedPatch, 'utf8')
  await writeFile(stagedPatchPath, stagedPatch, 'utf8')
  await writeFile(statusPath, formatStatusShort(input.status), 'utf8')

  const untrackedFiles = input.status.files
    .filter((file) => file.category === 'untracked')
    .map((file) => file.path)
  for (const file of untrackedFiles) {
    const from = join(input.worktreePath, file)
    const to = join(untrackedDir, file)
    await mkdir(dirname(to), { recursive: true })
    await cp(from, to, { recursive: true, force: false, errorOnExist: true })
  }

  return {
    path: snapshotPath,
    worktreePath: input.worktreePath,
    branch: input.branch,
    status: input.status,
    trackedPatchPath,
    stagedPatchPath,
    statusPath,
    untrackedDir,
    untrackedFiles,
    createdAt
  }
}

function isGitAuditEvent(value: unknown): value is GitAuditEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<GitAuditEvent>
  return typeof event.id === 'string' &&
    typeof event.timestamp === 'string' &&
    typeof event.action === 'string' &&
    event.outcome === 'completed' &&
    typeof event.repositoryRoot === 'string'
}

export async function listGitAuditEvents(
  workspaceRoot: string,
  options: GitAuditLogOptions = {}
): Promise<GitAuditLogResult> {
  const cwd = workspaceRoot.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    const auditPath = await gitAuditLogPath(repositoryRoot)
    let raw = ''
    try {
      raw = await readFile(auditPath, 'utf8')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return { ok: true, repositoryRoot, events: [] }
      }
      throw error
    }
    const events = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as unknown
          return isGitAuditEvent(parsed) ? [parsed] : []
        } catch {
          return []
        }
      })
    const requestedLimit = typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? options.limit
      : 100
    const limit = Math.max(1, Math.min(500, Math.trunc(requestedLimit)))
    return { ok: true, repositoryRoot, events: events.slice(-limit) }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function getGitBranches(workspaceRoot: string): Promise<GitBranchesResult> {
  const cwd = workspaceRoot.trim()
  if (!cwd) {
    return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    const currentRaw = (await runGit(cwd, ['branch', '--show-current'])).stdout.trim()
    const currentBranch = currentRaw || null
    const branchLines = (await runGit(cwd, ['branch', '--format=%(refname:short)'])).stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const branchSet = new Set(branchLines)
    if (currentBranch && !branchSet.has(currentBranch)) branchSet.add(currentBranch)
    const branches = [...branchSet].map((name) => ({
      name,
      current: currentBranch === name
    }))
    const status = await getGitStatus(cwd)
    return { ok: true, repositoryRoot, currentBranch, branches, dirtyCount: status.files.length, status }
  } catch (error) {
    return gitFailure(error)
  }
}

export async function getGitDiff(workspaceRoot: string): Promise<GitDiffResult> {
  const cwd = workspaceRoot.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    const unstaged = parseUnifiedDiff((await runGit(repositoryRoot, ['diff', '--no-ext-diff', '--patch'])).stdout, false)
    const staged = parseUnifiedDiff((await runGit(repositoryRoot, ['diff', '--cached', '--no-ext-diff', '--patch'])).stdout, true)
    return { ok: true, repositoryRoot, files: [...staged, ...unstaged] }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function getGitReviewPreparation(
  workspaceRoot: string,
  options: GitReviewPreparationOptions = {}
): Promise<GitReviewPreparationResult> {
  const cwd = workspaceRoot.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    const status = await getGitStatus(repositoryRoot)
    const currentBranchRaw = (await runGit(repositoryRoot, ['branch', '--show-current'])).stdout.trim()
    const currentBranch = currentBranchRaw || null
    const upstream = await getOptionalUpstream(repositoryRoot)
    const { stagedFiles, unstagedFiles, untrackedFiles } = filesByStatus(status)
    const blockedReasons: string[] = []
    const commitMessage = options.commitMessage?.trim() || 'Describe staged changes'
    const remote = options.remote?.trim() || 'origin'
    const baseBranch = options.baseBranch?.trim() || 'main'

    if (stagedFiles.length === 0) {
      blockedReasons.push('No staged changes are ready to commit.')
    }
    if (!currentBranch) {
      blockedReasons.push('A named branch is required before push or PR preparation.')
    }
    if (currentBranch === baseBranch) {
      blockedReasons.push('Pull request preparation requires a non-base branch.')
    }

    const commitReady = stagedFiles.length > 0
    const pushReady = commitReady && Boolean(currentBranch) && currentBranch !== baseBranch
    const prReady = pushReady
    const suggestedCommands = ['git status --short']
    if (commitReady) {
      suggestedCommands.push(`git commit -m ${shellQuoteValue(commitMessage)}`)
      if (pushReady && currentBranch) {
        suggestedCommands.push(
          upstream
            ? `git push ${shellQuoteValue(remote)} ${shellQuoteValue(currentBranch)}`
            : `git push -u ${shellQuoteValue(remote)} ${shellQuoteValue(currentBranch)}`
        )
      }
      if (prReady && currentBranch) {
        suggestedCommands.push(
          `gh pr create --base ${shellQuoteValue(baseBranch)} --head ${shellQuoteValue(currentBranch)} --fill`
        )
      }
    }

    return {
      ok: true,
      repositoryRoot,
      currentBranch,
      upstream,
      status,
      stagedFiles,
      unstagedFiles,
      untrackedFiles,
      commitReady,
      pushReady,
      prReady,
      blockedReasons,
      suggestedCommands,
      markdown: buildGitReviewPreparationMarkdown({
        repositoryRoot,
        currentBranch,
        upstream,
        stagedFiles,
        unstagedFiles,
        untrackedFiles,
        blockedReasons,
        suggestedCommands
      })
    }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function stageGitPaths(
  workspaceRoot: string,
  paths: readonly string[]
): Promise<GitPathMutationResult> {
  const cwd = workspaceRoot.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  let normalized: string[]
  try {
    normalized = validateGitRelativePaths(paths)
  } catch (error) {
    return { ok: false, reason: 'invalid_path', message: error instanceof Error ? error.message : String(error) }
  }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    await runGit(repositoryRoot, ['add', '--', ...normalized], 20_000)
    const status = await getGitStatus(repositoryRoot)
    await appendGitAuditEvent(repositoryRoot, {
      action: 'paths.stage',
      paths: normalized
    })
    return { ok: true, status }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function discardGitChanges(
  workspaceRoot: string,
  paths: readonly string[],
  options: { confirmation?: string } = {}
): Promise<GitPathMutationResult> {
  const cwd = workspaceRoot.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  if (options.confirmation !== 'discard-local-changes') {
    return {
      ok: false,
      reason: 'confirmation_required',
      message: 'Discarding local changes requires confirmation: discard-local-changes.'
    }
  }
  let normalized: string[]
  try {
    normalized = validateGitRelativePaths(paths)
  } catch (error) {
    return { ok: false, reason: 'invalid_path', message: error instanceof Error ? error.message : String(error) }
  }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    const status = await getGitStatus(repositoryRoot)
    const requested = new Set(normalized)
    const hasUntracked = status.files.some((file) => requested.has(file.path) && file.category === 'untracked')
    if (hasUntracked) {
      return {
        ok: false,
        reason: 'untracked_requires_delete',
        message: 'Refusing to delete untracked files through discardGitChanges.',
        status
      }
    }
    await runGit(repositoryRoot, ['restore', '--staged', '--worktree', '--', ...normalized], 20_000)
    const nextStatus = await getGitStatus(repositoryRoot)
    await appendGitAuditEvent(repositoryRoot, {
      action: 'paths.discard',
      paths: normalized
    })
    return { ok: true, status: nextStatus }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function listGitWorktrees(workspaceRoot: string): Promise<GitWorktreeListResult> {
  const cwd = workspaceRoot.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    const raw = (await runGit(repositoryRoot, ['worktree', 'list', '--porcelain'])).stdout
    const worktrees = await Promise.all(
      parseGitWorktreeList(raw).map(async (row) => ({
        ...row,
        managed: await isManagedWorktree(repositoryRoot, row.path)
      }))
    )
    return { ok: true, repositoryRoot, worktrees }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function createManagedGitWorktree(
  workspaceRoot: string,
  options: ManagedGitWorktreeOptions
): Promise<ManagedGitWorktreeCreateResult> {
  const cwd = workspaceRoot.trim()
  const branch = options.branch.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  if (!branch) return { ok: false, reason: 'invalid_worktree', message: 'Branch name is required.' }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    await runGit(repositoryRoot, ['check-ref-format', '--branch', branch])
    const baseBranch = options.baseBranch?.trim() || 'HEAD'
    const worktreeParent = options.worktreeParent?.trim()
      ? resolve(options.worktreeParent)
      : join(dirname(repositoryRoot), `${basename(repositoryRoot)}.worktrees`)
    const worktreePath = join(worktreeParent, sanitizeWorktreeName(branch))
    if (existsSync(worktreePath)) {
      return {
        ok: false,
        reason: 'invalid_worktree',
        message: 'Managed worktree path already exists.'
      }
    }
    await mkdir(worktreeParent, { recursive: true })
    await runGit(repositoryRoot, ['worktree', 'add', '-b', branch, worktreePath, baseBranch], 60_000)
    await writeManagedWorktreeMetadata(repositoryRoot, worktreePath, { branch, baseBranch })
    const canonicalPath = await canonicalLocalPath(worktreePath)
    await appendGitAuditEvent(repositoryRoot, {
      action: 'worktree.create',
      worktreePath: canonicalPath,
      branch,
      baseBranch
    })
    return { ok: true, repositoryRoot, path: canonicalPath, branch, managed: true }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function removeManagedGitWorktree(
  workspaceRoot: string,
  worktreePath: string,
  options: ManagedGitWorktreeRemoveOptions = {}
): Promise<ManagedGitWorktreeRemoveResult> {
  const cwd = workspaceRoot.trim()
  const targetPath = worktreePath.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  if (!targetPath) return { ok: false, reason: 'invalid_worktree', message: 'Worktree path is required.' }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    const target = await canonicalLocalPath(targetPath)
    const listed = await listGitWorktrees(repositoryRoot)
    if (!listed.ok) return listed
    const rowsWithCanonicalPaths = await Promise.all(
      listed.worktrees.map(async (worktree) => ({
        ...worktree,
        canonicalPath: await canonicalLocalPath(worktree.path)
      }))
    )
    const row = rowsWithCanonicalPaths.find((worktree) => worktree.canonicalPath === target)
    if (!row) {
      return { ok: false, reason: 'invalid_worktree', message: 'Worktree is not registered with this repository.' }
    }
    if (!row.managed) {
      return { ok: false, reason: 'unmanaged_worktree', message: 'Refusing to remove an unmanaged worktree.' }
    }
    const status = await getGitStatus(target)
    let snapshot: GitWorktreeRemovalSnapshot | undefined
    if (!status.clean) {
      if (options.confirmation !== 'snapshot-and-remove-dirty-worktree') {
        return {
          ok: false,
          reason: 'dirty_worktree',
          message: 'Managed worktree removal blocked because local changes are present.',
          status
        }
      }
      snapshot = await createDirtyWorktreeRemovalSnapshot({
        worktreePath: target,
        branch: row.branch,
        status,
        snapshotParent: options.snapshotParent
      })
    }
    await runGit(repositoryRoot, ['worktree', 'remove', ...(status.clean ? [] : ['--force']), target], 60_000)
    await removeManagedWorktreeMetadata(repositoryRoot, target)
    let branchDeleted: string | null = null
    if (row.branch) {
      await runGit(repositoryRoot, ['branch', '-D', row.branch], 20_000)
      branchDeleted = row.branch
    }
    await appendGitAuditEvent(repositoryRoot, {
      action: 'worktree.remove',
      worktreePath: target,
      branch: row.branch,
      branchDeleted,
      ...(snapshot ? { snapshotPath: snapshot.path } : {})
    })
    return { ok: true, path: target, branchDeleted, ...(snapshot ? { snapshot } : {}) }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function createGitWorktreeHandoffSummary(
  workspaceRoot: string,
  worktreePath: string,
  options: GitWorktreeHandoffOptions = {}
): Promise<GitWorktreeHandoffResult> {
  const cwd = workspaceRoot.trim()
  const targetPath = worktreePath.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  if (!targetPath) return { ok: false, reason: 'invalid_worktree', message: 'Worktree path is required.' }
  try {
    const repositoryRoot = await getRepositoryRoot(cwd)
    const target = await canonicalLocalPath(targetPath)
    const listed = await listGitWorktrees(repositoryRoot)
    if (!listed.ok) return listed
    const rowsWithCanonicalPaths = await Promise.all(
      listed.worktrees.map(async (worktree) => ({
        ...worktree,
        canonicalPath: await canonicalLocalPath(worktree.path)
      }))
    )
    const row = rowsWithCanonicalPaths.find((worktree) => worktree.canonicalPath === target)
    if (!row) {
      return { ok: false, reason: 'invalid_worktree', message: 'Worktree is not registered with this repository.' }
    }
    if (!row.managed) {
      return { ok: false, reason: 'unmanaged_worktree', message: 'Refusing to hand off an unmanaged worktree.' }
    }
    const status = await getGitStatus(target)
    return {
      ok: true,
      repositoryRoot,
      path: target,
      branch: row.branch,
      status,
      markdown: buildWorktreeHandoffMarkdown({
        repositoryRoot,
        path: target,
        branch: row.branch,
        status,
        options
      })
    }
  } catch (error) {
    const failure = gitFailureMessage(error)
    return { ok: false, ...failure }
  }
}

export async function switchGitBranch(
  workspaceRoot: string,
  branchName: string
): Promise<GitBranchesResult> {
  const cwd = workspaceRoot.trim()
  const branch = branchName.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  if (!branch) return { ok: false, reason: 'error', message: 'Branch name is required.' }
  try {
    const status = await getGitStatus(cwd)
    if (!status.clean) {
      return {
        ok: false,
        reason: 'dirty_worktree',
        message: 'Branch switch blocked because local changes are present.',
        status
      }
    }
    try {
      await runGit(cwd, ['switch', branch], 20_000)
    } catch {
      await runGit(cwd, ['checkout', branch], 20_000)
    }
    return getGitBranches(cwd)
  } catch (error) {
    return gitFailure(error)
  }
}

export async function createAndSwitchGitBranch(
  workspaceRoot: string,
  branchName: string
): Promise<GitBranchesResult> {
  const cwd = workspaceRoot.trim()
  const branch = branchName.trim()
  if (!cwd) return { ok: false, reason: 'no_workspace', message: 'No working directory selected.' }
  if (!branch) return { ok: false, reason: 'error', message: 'Branch name is required.' }
  try {
    await runGit(cwd, ['check-ref-format', '--branch', branch])
    try {
      await runGit(cwd, ['switch', '-c', branch], 20_000)
    } catch {
      await runGit(cwd, ['checkout', '-b', branch], 20_000)
    }
    return getGitBranches(cwd)
  } catch (error) {
    return gitFailure(error)
  }
}
