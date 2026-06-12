import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve as pathResolve } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import type {
  CheckpointRecord,
  CheckpointSummary,
  CreateCheckpointRequest,
  RestoreCheckpointRequest,
  ForkFromCheckpointRequest,
  RestoreTarget
} from '../contracts/checkpoints.js'
import { DirtyWorkspaceRestoreError } from '../contracts/checkpoints.js'
import type { CheckpointStore } from '../ports/checkpoint-store.js'
import type { SessionStore } from '../ports/session-store.js'
import type { ThreadStore } from '../ports/thread-store.js'
import type { IdGenerator } from '../ports/id-generator.js'
import type { RuntimeEventRecorder } from './runtime-event-recorder.js'
import type { ThreadRecord } from '../contracts/threads.js'
import type { TurnItem } from '../contracts/items.js'

const execFileAsync = promisify(execFile)

type CheckpointServiceOptions = {
  checkpointStore: CheckpointStore
  threadStore: ThreadStore
  sessionStore: SessionStore
  events: RuntimeEventRecorder
  ids: IdGenerator
  nowIso: () => string
  /** Directory to store checkpoint data (snapshot bundles). */
  dataDir?: string
  /** Retention config overrides. */
  maxPerThread?: number
  maxTotal?: number
}

function toSummary(record: CheckpointRecord): CheckpointSummary {
  return {
    id: record.id,
    threadId: record.threadId,
    turnId: record.turnId,
    createdAt: record.createdAt,
    eventSeq: record.eventSeq,
    trigger: record.trigger,
    label: `${record.trigger === 'manual' ? 'Manual' : 'Auto'} checkpoint — ${record.createdAt.slice(0, 19).replace('T', ' ')}`
  }
}

async function runGit(cwd: string, args: string[], timeout = 15_000): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', args, { cwd, timeout, maxBuffer: 1024 * 1024 })
  return { stdout: String(stdout), stderr: String(stderr) }
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

/**
 * Capture full workspace snapshot including staged changes, unstaged tracked
 * changes, and untracked files. Phase-6 pattern: status + staged diff +
 * unstaged diff + untracked bundle, so restore can reconstruct the exact
 * pre-turn workspace state.
 */
async function captureWorkspaceSnapshot(
  workspaceRoot: string,
  dataDir: string,
  checkpointId: string
): Promise<{
  treeHash: string
  commitHash: string
  untrackedBundlePath?: string
  untrackedFiles: string[]
  stagedDiffPath?: string
  unstagedDiffPath?: string
  statusText: string
  includesStaged: boolean
  includesUnstaged: boolean
}> {
  // Get the current HEAD tree hash as the base
  const treeResult = await runGit(workspaceRoot, ['rev-parse', 'HEAD^{tree}'])
  const treeHash = treeResult.stdout.trim()

  // Get HEAD commit hash for worktree creation
  let commitHash = treeHash
  try {
    const headResult = await runGit(workspaceRoot, ['rev-parse', 'HEAD'])
    commitHash = headResult.stdout.trim()
  } catch {
    try {
      await runGit(workspaceRoot, ['commit', '--allow-empty', '-m', 'checkpoint-base'])
      const headResult = await runGit(workspaceRoot, ['rev-parse', 'HEAD'])
      commitHash = headResult.stdout.trim()
    } catch {
      // Fall back to tree hash
    }
  }

  // Capture full git status
  const statusResult = await runGit(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all'])
  const statusText = statusResult.stdout

  // Identify untracked files
  const untrackedFiles = statusText
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim())
    .filter(Boolean)

  const nonEmptyLines = statusText.split('\n').filter((line) => line.trim().length > 0)
  const hasStaged = nonEmptyLines.some((line) => {
    const idx = line[0]
    return idx !== ' ' && idx !== '?'
  })
  const hasUnstaged = nonEmptyLines.some((line) => {
    const wt = line.length > 1 ? line[1] : ' '
    return wt !== ' ' && wt !== '?'
  })

  const bundleDir = join(dataDir, 'checkpoints', checkpointId)
  await mkdir(bundleDir, { recursive: true })

  let untrackedBundlePath: string | undefined
  let stagedDiffPath: string | undefined
  let unstagedDiffPath: string | undefined

  // Bundle untracked files
  if (untrackedFiles.length > 0) {
    untrackedBundlePath = join(bundleDir, 'untracked.tar.gz')
    await execFileAsync('tar', ['-czf', untrackedBundlePath, ...untrackedFiles], {
      cwd: workspaceRoot,
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 10
    })
  }

  // Capture staged diff (only if non-empty)
  if (hasStaged) {
    const stagedDiff = (await runGit(workspaceRoot, ['diff', '--cached', '--binary'], 30_000)).stdout
    if (stagedDiff.trim()) {
      stagedDiffPath = join(bundleDir, 'staged.patch')
      await writeFile(stagedDiffPath, stagedDiff, 'utf-8')
    }
  }

  // Capture unstaged tracked diff (only if non-empty)
  if (hasUnstaged) {
    const unstagedDiff = (await runGit(workspaceRoot, ['diff', '--binary'], 30_000)).stdout
    if (unstagedDiff.trim()) {
      unstagedDiffPath = join(bundleDir, 'unstaged.patch')
      await writeFile(unstagedDiffPath, unstagedDiff, 'utf-8')
    }
  }

  return {
    treeHash,
    commitHash,
    untrackedBundlePath,
    untrackedFiles,
    stagedDiffPath,
    unstagedDiffPath,
    statusText,
    includesStaged: hasStaged,
    includesUnstaged: hasUnstaged
  }
}

/**
 * Detect pre-existing dirty workspace changes that were NOT captured by the
 * checkpoint snapshot and therefore cannot be reconstructed on restore.
 *
 * Gate 1 & 2: Only BLOCK on staged changes that the checkpoint did NOT
 * capture — these represent intentional user work. Untracked files and
 * unstaged tracked changes are treated as ordinary session / post-checkpoint
 * mutations that the restore will clean up; they are NOT blockers.
 */
async function detectPreExistingDirtyState(
  workspaceRoot: string,
  snapshot: CheckpointRecord['snapshot']
): Promise<{ stagedFiles: string[]; unstagedFiles: string[]; untrackedFiles: string[] } | null> {
  const isGit = await isGitRepo(workspaceRoot)
  if (!isGit) return null

  const statusResult = await runGit(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all'])
  const lines = statusResult.stdout.split('\n').filter(Boolean)

  if (lines.length === 0) return null

  const stagedFiles: string[] = []
  const unstagedFiles: string[] = []
  const untrackedFiles: string[] = []

  for (const line of lines) {
    const path = line.slice(3).trim()

    const idx = line[0]
    const wt = line.length > 1 ? line[1] : ' '
    if (line.startsWith('??')) {
      untrackedFiles.push(path)
    } else {
      if (idx !== ' ' && idx !== '?') stagedFiles.push(path)
      if (wt !== ' ' && wt !== '?') unstagedFiles.push(path)
    }
  }

  // Gate 1 & 2: Only staged changes NOT captured by the snapshot are
  // pre-existing user work that would be destroyed. Untracked files and
  // unstaged tracked changes are session artifacts that restore cleans up.
  const hasPreExistingStaged = stagedFiles.length > 0 && !snapshot.includesStaged

  if (hasPreExistingStaged) {
    return { stagedFiles, unstagedFiles, untrackedFiles }
  }

  return null
}

/**
 * Safe code restore using captured snapshot diffs. No git stash or
 * git reset --hard. Uses git checkout + apply to reconstruct the
 * exact checkpoint state from artifacts.
 *
 * Gate 1: Primitive is git checkout (not reset --hard).
 * Gate 2: Removes post-checkpoint untracked files that were NOT in
 *   the snapshot, and restores checkpoint-captured untracked files.
 * Gate 3: Preserves staged/index state via --index apply.
 */
async function restoreWorkspaceCode(
  workspaceRoot: string,
  snapshot: CheckpointRecord['snapshot']
): Promise<void> {
  const isGit = await isGitRepo(workspaceRoot)

  if (isGit) {
    // ── Step 1: Reset working tree + index to checkpoint base tree ──
    // Use git checkout (not reset --hard) to reconstruct safely.
    // This sets both working tree and index to the snapshot's base tree.
    await runGit(workspaceRoot, ['checkout', snapshot.treeHash, '--', '.'])

    // ── Step 2: Apply staged diff to index AND working tree (Gate 3) ──
    // --index applies the patch to both the index and the working tree,
    // so git status after restore shows staged changes as they were.
    if (snapshot.stagedDiffPath && existsSync(snapshot.stagedDiffPath)) {
      try {
        await runGit(workspaceRoot, ['apply', '--index', snapshot.stagedDiffPath], 30_000)
      } catch {
        // Fallback: apply without --index if --index fails (e.g., binary)
        try {
          await runGit(workspaceRoot, ['apply', snapshot.stagedDiffPath], 30_000)
        } catch { /* best-effort */ }
      }
    }

    // ── Step 3: Apply unstaged diff to working tree only ──
    // This creates the working-tree-vs-index difference that the
    // checkpoint's unstaged changes represent.
    if (snapshot.unstagedDiffPath && existsSync(snapshot.unstagedDiffPath)) {
      try {
        await runGit(workspaceRoot, ['apply', snapshot.unstagedDiffPath], 30_000)
      } catch { /* best-effort */ }
    }
  }

  // ── Step 4: Remove ALL current untracked files that were NOT in the ──
  // checkpoint snapshot (Gate 2). This cleans up post-checkpoint untracked
  // mutations. We get the full list of current untracked files and remove
  // only those not present in the checkpoint snapshot.
  //
  // IMPORTANT: Checkpoint artifacts (bundle archives, patch files) live
  // under a data directory that may reside inside the workspace (e.g.
  // .chkpts/). These are checkpoint infrastructure — NOT post-checkpoint
  // user mutations — and must NOT be deleted before Step 5 extraction.
  // We compute a protected set from the snapshot artifact paths.
  if (isGit) {
    try {
      // ── Compute protected paths from checkpoint artifact references ──
      const protectedRelativePaths = new Set<string>()
      const artifactAbsPaths: string[] = [
        snapshot.untrackedBundlePath,
        snapshot.stagedDiffPath,
        snapshot.unstagedDiffPath
      ].filter((p): p is string => typeof p === 'string' && p.length > 0)

      for (const absPath of artifactAbsPaths) {
        // Convert absolute artifact path to workspace-relative if it lives inside the workspace
        const sep = workspaceRoot.endsWith('/') ? '' : '/'
        const prefix = workspaceRoot + sep
        if (absPath.startsWith(prefix) || absPath === workspaceRoot) {
          let rel = absPath.slice(workspaceRoot.length)
          if (rel.startsWith('/')) rel = rel.slice(1)
          // Protect the artifact file itself
          protectedRelativePaths.add(rel)
          // Protect all ancestor directories up to (but not including) workspace root
          const parts = rel.split('/')
          for (let i = 1; i < parts.length; i++) {
            protectedRelativePaths.add(parts.slice(0, i).join('/'))
          }
        }
      }

      const currentStatus = await runGit(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=all'])
      const currentUntracked = currentStatus.stdout
        .split('\n')
        .filter((line) => line.startsWith('??'))
        .map((line) => line.slice(3).trim())
        .filter(Boolean)

      // Determine which untracked files to remove (those NOT in checkpoint snapshot
      // AND not protected checkpoint artifacts)
      const checkpointUntrackedSet = new Set(snapshot.untrackedFiles)
      for (const file of currentUntracked) {
        // Keep files that are in the checkpoint snapshot
        if (checkpointUntrackedSet.has(file)) continue
        // Keep checkpoint artifact files and directories
        if (protectedRelativePaths.has(file)) continue
        // Keep files under protected directories
        let underProtected = false
        for (const pp of protectedRelativePaths) {
          if (file.startsWith(pp + '/')) {
            underProtected = true
            break
          }
        }
        if (underProtected) continue

        // This file was created after the checkpoint — remove it
        try {
          await rm(join(workspaceRoot, file), { force: true, recursive: true })
        } catch { /* ignore */ }
      }
    } catch { /* best-effort cleanup */ }
  } else {
    // Non-git: still clean snapshot untracked files so they can be
    // re-extracted cleanly
    if (snapshot.untrackedFiles.length > 0) {
      for (const file of snapshot.untrackedFiles) {
        try {
          await rm(join(workspaceRoot, file), { force: true, recursive: true })
        } catch { /* ignore */ }
      }
    }
  }

  // ── Step 5: Restore checkpoint-captured untracked files from bundle ──
  if (snapshot.untrackedBundlePath && snapshot.untrackedFiles.length > 0) {
    try {
      await execFileAsync('tar', ['-xzf', snapshot.untrackedBundlePath], {
        cwd: workspaceRoot,
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 10
      })
    } catch { /* best-effort untracked restore */ }
  }
}

// -------------------------------------------------------------------------
// Phase 6 managed worktree metadata (mirrors src/main/services/git-service.ts)
// -------------------------------------------------------------------------

async function getGitCommonDir(repositoryRoot: string): Promise<string> {
  const raw = (await runGit(repositoryRoot, ['rev-parse', '--git-common-dir'])).stdout.trim()
  return isAbsolute(raw) ? raw : pathResolve(repositoryRoot, raw)
}

function managedWorktreeMetadataId(path: string): string {
  return createHash('sha256').update(pathResolve(path)).digest('hex')
}

async function gitAuditLogPath(repositoryRoot: string): Promise<string> {
  const commonDir = await getGitCommonDir(repositoryRoot)
  return join(commonDir, 'opencodex', 'git-audit.jsonl')
}

async function appendGitAuditEvent(
  repositoryRoot: string,
  event: {
    action: string
    worktreePath: string
    branch?: string
    baseBranch?: string
    checkpointId?: string
    forkedThreadId?: string
  }
): Promise<void> {
  const timestamp = new Date().toISOString()
  const idDigest = createHash('sha256')
    .update(`${timestamp}:${event.action}:${process.hrtime.bigint().toString()}`)
    .digest('hex')
    .slice(0, 16)
  const auditEvent = {
    id: `git_${idDigest}`,
    timestamp,
    outcome: 'completed',
    repositoryRoot,
    ...event
  }
  const auditPath = await gitAuditLogPath(repositoryRoot)
  await mkdir(dirname(auditPath), { recursive: true })
  await appendFile(auditPath, `${JSON.stringify(auditEvent)}\n`, 'utf8')
}

async function writeManagedWorktreeMetadata(
  repositoryRoot: string,
  worktreePath: string,
  metadata: {
    branch: string
    baseBranch: string
    checkpointId?: string
    forkedThreadId?: string
  }
): Promise<string> {
  const commonDir = await getGitCommonDir(repositoryRoot)
  const canonicalPath = pathResolve(worktreePath)
  const metadataId = managedWorktreeMetadataId(canonicalPath)
  const metadataPath = join(commonDir, 'opencodex', 'managed-worktrees', `${metadataId}.json`)
  await mkdir(dirname(metadataPath), { recursive: true })
  await writeFile(
    metadataPath,
    `${JSON.stringify({
      managedBy: 'opencodex-desktop',
      repositoryRoot,
      path: canonicalPath,
      branch: metadata.branch,
      baseBranch: metadata.baseBranch,
      createdAt: new Date().toISOString(),
      ...(metadata.checkpointId ? { checkpointId: metadata.checkpointId } : {}),
      ...(metadata.forkedThreadId ? { forkedThreadId: metadata.forkedThreadId } : {})
    }, null, 2)}\n`,
    'utf8'
  )
  return metadataPath
}

// -------------------------------------------------------------------------

function cloneItemForNewThread(item: TurnItem, threadId: string, now: string): TurnItem {
  const cloned = { ...item, threadId } as TurnItem
  if (cloned.status === 'pending' || cloned.status === 'running') {
    if (cloned.kind === 'approval') {
      return { ...cloned, status: 'expired', finishedAt: cloned.finishedAt ?? now }
    }
    if (cloned.kind === 'user_input') {
      return { ...cloned, status: 'cancelled', finishedAt: cloned.finishedAt ?? now }
    }
    return { ...cloned, status: 'completed', finishedAt: cloned.finishedAt ?? now } as TurnItem
  }
  return cloned
}

export class CheckpointService {
  private readonly options: CheckpointServiceOptions

  constructor(options: CheckpointServiceOptions) {
    this.options = options
  }

  /**
   * Create a checkpoint for the given thread+turn context.
   */
  async create(request: CreateCheckpointRequest): Promise<CheckpointRecord> {
    const { threadStore, checkpointStore, events, ids, nowIso, dataDir, maxPerThread, maxTotal } = this.options

    const thread = await threadStore.get(request.threadId)
    if (!thread) throw new Error(`thread not found: ${request.threadId}`)

    const workspaceRoot = request.workspaceRoot || thread.workspace
    if (!workspaceRoot) {
      throw new Error('Checkpoint creation requires a workspace root')
    }

    const isGit = await isGitRepo(workspaceRoot)
    const now = nowIso()
    const checkpointId = ids.next('chkpt')

    let treeHash = 'non-git-workspace'
    let commitHash = treeHash
    let untrackedBundlePath: string | undefined
    let untrackedFiles: string[] = []
    let stagedDiffPath: string | undefined
    let unstagedDiffPath: string | undefined
    let statusText = ''
    let includesStaged = false
    let includesUnstaged = false

    if (isGit) {
      const snapshot = await captureWorkspaceSnapshot(
        workspaceRoot,
        dataDir ?? join(tmpdir(), 'kun-checkpoints'),
        checkpointId
      )
      treeHash = snapshot.treeHash
      commitHash = snapshot.commitHash
      untrackedBundlePath = snapshot.untrackedBundlePath
      untrackedFiles = snapshot.untrackedFiles
      stagedDiffPath = snapshot.stagedDiffPath
      unstagedDiffPath = snapshot.unstagedDiffPath
      statusText = snapshot.statusText
      includesStaged = snapshot.includesStaged
      includesUnstaged = snapshot.includesUnstaged
    }

    const record: CheckpointRecord = {
      id: checkpointId,
      threadId: request.threadId,
      turnId: request.turnId,
      createdAt: now,
      eventSeq: request.eventSeq,
      itemCount: request.itemCount,
      turnCount: request.turnCount,
      snapshot: {
        treeHash,
        commitHash,
        includesUntracked: untrackedFiles.length > 0,
        workspaceRoot,
        untrackedBundlePath,
        untrackedFiles,
        stagedDiffPath,
        unstagedDiffPath,
        statusText,
        includesStaged,
        includesUnstaged
      },
      trigger: request.trigger
    }

    await checkpointStore.save(record)

    // Audit event
    await events.record({
      kind: 'checkpoint_created',
      threadId: request.threadId,
      turnId: request.turnId,
      checkpointId: record.id,
      trigger: record.trigger
    })

    // Enforce retention
    await this.enforceRetention(request.threadId, maxPerThread ?? 20, maxTotal ?? 200)

    return record
  }

  /**
   * Get a checkpoint by id.
   */
  async get(id: string): Promise<CheckpointRecord | null> {
    return this.options.checkpointStore.get(id)
  }

  /**
   * List checkpoints for a thread (newest first).
   */
  async list(threadId: string): Promise<CheckpointSummary[]> {
    const records = await this.options.checkpointStore.listByThread(threadId)
    return records.map(toSummary)
  }

  /**
   * Restore from a checkpoint. Supports code-only, conversation-only, or both.
   *
   * Code-only restore: reverts workspace files to checkpoint snapshot state
   * but does NOT change conversation. A visible audit event is emitted.
   *
   * Conversation-only restore: creates a new forked thread truncated at the
   * checkpoint offset, leaving workspace files untouched.
   *
   * Both: does both.
   */
  async restore(request: RestoreCheckpointRequest): Promise<{
    restored: boolean
    target: RestoreTarget
    checkpointId: string
    newThreadId?: string
    newItemCount?: number
  }> {
    const { checkpointStore, threadStore, sessionStore, events, nowIso } = this.options
    const checkpoint = await checkpointStore.get(request.checkpointId)
    if (!checkpoint) throw new Error(`checkpoint not found: ${request.checkpointId}`)

    const now = nowIso()

    if (request.target === 'code' || request.target === 'both') {
      const thread = await threadStore.get(checkpoint.threadId)
      const workspaceRoot = thread?.workspace ?? checkpoint.snapshot.workspaceRoot
      if (!workspaceRoot) throw new Error('Code restore requires a workspace root')

      // Gate 1 & 5: Detect pre-existing dirty state (staged changes that the
      // checkpoint did NOT capture). If found, either block or require explicit
      // confirmation via the request's confirmDirtyOverwrite field.
      if (!request.confirmDirtyOverwrite) {
        const dirty = await detectPreExistingDirtyState(
          workspaceRoot,
          checkpoint.snapshot
        )
        if (dirty) {
          throw new DirtyWorkspaceRestoreError(
            'Workspace has staged changes that predate this checkpoint and would be lost. ' +
            'Commit or stash these files before restoring, or pass confirmDirtyOverwrite: true.',
            dirty
          )
        }
      }

      await restoreWorkspaceCode(workspaceRoot, checkpoint.snapshot)

      // Emit the code-only restore audit event even when conversation is not
      // being restored. The conversation continues with a visible system/audit
      // event.
      await events.record({
        kind: 'checkpoint_restore',
        threadId: checkpoint.threadId,
        turnId: checkpoint.turnId,
        checkpointId: checkpoint.id,
        target: request.target
      })
    }

    let newThreadId: string | undefined
    let newItemCount: number | undefined

    if (request.target === 'conversation' || request.target === 'both') {
      const thread = await threadStore.get(checkpoint.threadId)
      if (!thread) throw new Error(`thread not found: ${checkpoint.threadId}`)

      const truncatedTurns = this.truncateTurnsAtCheckpoint(thread, checkpoint, now)
      const truncatedItems = truncatedTurns.flatMap((t) => t.items)
      newItemCount = truncatedItems.length

      newThreadId = this.options.ids.next('thr')
      const restoredThread: ThreadRecord = {
        ...thread,
        id: newThreadId,
        title: `${thread.title} (restored)`,
        status: 'idle',
        turns: truncatedTurns,
        forkedFromThreadId: thread.id,
        forkedFromTitle: thread.title,
        forkedAt: now,
        forkedFromMessageCount: truncatedItems.filter((i) => i.kind === 'user_message').length,
        forkedFromTurnCount: truncatedTurns.length,
        updatedAt: now,
        createdAt: now
      }

      for (const item of truncatedItems) {
        await sessionStore.appendItem(newThreadId, cloneItemForNewThread(item, newThreadId, now))
      }

      await threadStore.upsert(restoredThread)

      // Emit conversation restore event
      await events.record({
        kind: 'checkpoint_restore',
        threadId: checkpoint.threadId,
        turnId: checkpoint.turnId,
        checkpointId: checkpoint.id,
        target: request.target,
        forkedThreadId: newThreadId
      })
    }

    return {
      restored: true,
      target: request.target,
      checkpointId: checkpoint.id,
      ...(newThreadId ? { newThreadId } : {}),
      ...(newItemCount !== undefined ? { newItemCount } : {})
    }
  }

  /**
   * Fork from a checkpoint into a new thread.
   * Optionally creates a managed worktree at the snapshot state.
   */
  async fork(request: ForkFromCheckpointRequest): Promise<{
    forkedThreadId: string
    checkpointId: string
    worktreePath?: string
  }> {
    const { checkpointStore, threadStore, sessionStore, events, ids, nowIso } = this.options
    const checkpoint = await checkpointStore.get(request.checkpointId)
    if (!checkpoint) throw new Error(`checkpoint not found: ${request.checkpointId}`)

    const sourceThread = await threadStore.get(checkpoint.threadId)
    if (!sourceThread) throw new Error(`thread not found: ${checkpoint.threadId}`)

    const now = nowIso()
    const forkedThreadId = ids.next('thr')

    const truncatedTurns = this.truncateTurnsAtCheckpoint(sourceThread, checkpoint, now).map((turn) => ({
      ...turn,
      threadId: forkedThreadId
    }))
    const truncatedItems = truncatedTurns.flatMap((t) => t.items)

    const forkTitle = request.title?.trim() || `${sourceThread.title} fork`
    const forkedThread: ThreadRecord = {
      ...sourceThread,
      id: forkedThreadId,
      title: forkTitle,
      status: 'idle',
      turns: truncatedTurns,
      relation: 'fork',
      parentThreadId: sourceThread.id,
      forkedFromThreadId: sourceThread.id,
      forkedFromTitle: sourceThread.title,
      forkedAt: now,
      forkedFromMessageCount: truncatedItems.filter((i) => i.kind === 'user_message').length,
      forkedFromTurnCount: truncatedTurns.length,
      updatedAt: now,
      createdAt: now
    }

    for (const item of truncatedItems) {
      await sessionStore.appendItem(forkedThreadId, cloneItemForNewThread(item, forkedThreadId, now))
    }

    await threadStore.upsert(forkedThread)

    let worktreePath: string | undefined

    if (request.createWorktree) {
      const workspaceRoot = sourceThread.workspace
      if (!workspaceRoot) {
        throw new Error('Fork worktree creation requires a workspace root')
      }

      const worktreeBranch = request.worktreeBranch ?? `chkpt-fork-${forkedThreadId.slice(0, 8)}`
      const parentDir = request.worktreeParent ?? join(pathResolve(workspaceRoot, '..'), `${basename(workspaceRoot)}.worktrees`)
      worktreePath = join(parentDir, worktreeBranch)

      try {
        await mkdir(parentDir, { recursive: true })
        const targetRef = checkpoint.snapshot.commitHash || checkpoint.snapshot.treeHash
        await runGit(workspaceRoot, ['worktree', 'add', '-b', worktreeBranch, worktreePath, targetRef], 60_000)

        // Gate 4: Apply staged, unstaged, and untracked snapshot artifacts
        // into the fork worktree so it matches the full checkpoint snapshot,
        // not just checkpoint HEAD.
        const snapshot = checkpoint.snapshot

        // Apply staged diff to index + working tree in the fork worktree
        if (snapshot.stagedDiffPath && existsSync(snapshot.stagedDiffPath)) {
          try {
            await runGit(worktreePath, ['apply', '--index', snapshot.stagedDiffPath], 30_000)
          } catch {
            try {
              await runGit(worktreePath, ['apply', snapshot.stagedDiffPath], 30_000)
            } catch { /* best-effort in fork */ }
          }
        }

        // Apply unstaged diff to working tree in the fork worktree
        if (snapshot.unstagedDiffPath && existsSync(snapshot.unstagedDiffPath)) {
          try {
            await runGit(worktreePath, ['apply', snapshot.unstagedDiffPath], 30_000)
          } catch { /* best-effort in fork */ }
        }

        // Restore untracked files from bundle into the fork worktree
        if (snapshot.untrackedBundlePath && snapshot.untrackedFiles.length > 0) {
          try {
            await execFileAsync('tar', ['-xzf', snapshot.untrackedBundlePath], {
              cwd: worktreePath,
              timeout: 30_000,
              maxBuffer: 1024 * 1024 * 10
            })
          } catch { /* best-effort untracked restore in fork */ }
        }

        // Write Phase 6 managed worktree metadata under git common dir
        const baseBranch = request.worktreeBranch
          ? (await runGit(workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
          : 'HEAD'
        await writeManagedWorktreeMetadata(workspaceRoot, worktreePath, {
          branch: worktreeBranch,
          baseBranch,
          checkpointId: checkpoint.id,
          forkedThreadId
        })

        // Append git-audit event for the worktree creation
        await appendGitAuditEvent(workspaceRoot, {
          action: 'worktree.create',
          worktreePath: pathResolve(worktreePath),
          branch: worktreeBranch,
          baseBranch,
          checkpointId: checkpoint.id,
          forkedThreadId
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to create managed worktree for checkpoint fork: ${message}`)
      }
    }

    await events.record({
      kind: 'checkpoint_fork',
      threadId: checkpoint.threadId,
      turnId: checkpoint.turnId,
      checkpointId: checkpoint.id,
      forkedThreadId
    })

    return {
      forkedThreadId,
      checkpointId: checkpoint.id,
      ...(worktreePath ? { worktreePath } : {})
    }
  }

  /**
   * Delete a checkpoint and clean up associated data.
   */
  async delete(id: string): Promise<boolean> {
    const checkpoint = await this.options.checkpointStore.get(id)
    if (!checkpoint) return false

    // Clean up snapshot artifacts (untracked bundle, staged/unstaged diffs)
    const bundleDir = join(
      this.options.dataDir ?? join(tmpdir(), 'kun-checkpoints'),
      'checkpoints',
      checkpoint.id
    )
    try {
      await rm(bundleDir, { force: true, recursive: true })
    } catch { /* ignore */ }

    return this.options.checkpointStore.delete(id)
  }

  /**
   * Enforce retention limits: prune oldest per-thread and globally.
   */
  async enforceRetention(threadId: string, maxPerThread: number, maxTotal: number): Promise<void> {
    const { checkpointStore } = this.options

    // Per-thread pruning
    if (maxPerThread > 0) {
      const ids = await checkpointStore.listIdsByThread(threadId)
      const excess = ids.length - maxPerThread
      for (let i = 0; i < excess; i++) {
        const toDelete = ids[i]
        if (toDelete) await this.delete(toDelete)
      }
    }

    // Global pruning (approximate)
    if (maxTotal > 0) {
      const total = await checkpointStore.countTotal()
      if (total > maxTotal) {
        const ids = await checkpointStore.listIdsByThread(threadId)
        const excess = Math.min(total - maxTotal, ids.length)
        for (let i = 0; i < excess; i++) {
          const toDelete = ids[i]
          if (toDelete) await this.delete(toDelete)
        }
      }
    }
  }

  /**
   * Truncate a thread's turns at the checkpoint event offset.
   */
  private truncateTurnsAtCheckpoint(
    thread: ThreadRecord,
    checkpoint: CheckpointRecord,
    now: string
  ): ThreadRecord['turns'] {
    // Keep turns up to and including the checkpoint turn count
    const keptTurns = thread.turns.slice(0, Math.max(1, checkpoint.turnCount))
    return keptTurns.map((turn, turnIdx) => {
      const isCheckpointTurn = turnIdx === keptTurns.length - 1 && turnIdx === checkpoint.turnCount - 1
      if (!isCheckpointTurn) return turn

      // Truncate items in the checkpoint turn
      const items = turn.items.slice(0, checkpoint.itemCount)
      return {
        ...turn,
        items: items.map((item) => {
          if (item.status === 'running' || item.status === 'pending') {
            return cloneItemForNewThread(item, thread.id, now)
          }
          return item
        }),
        status: 'completed' as const,
        finishedAt: checkpoint.createdAt
      }
    })
  }
}
