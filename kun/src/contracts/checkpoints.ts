import { z } from 'zod'

/**
 * Restore target discriminates which facets are restored from a
 * checkpoint: code (workspace snapshot), conversation (thread events),
 * or both.
 */
export const RestoreTarget = z.enum(['code', 'conversation', 'both'])
export type RestoreTarget = z.infer<typeof RestoreTarget>

/**
 * Code-only snapshot produced by `git stash create`-style capture that
 * includes untracked files. The snapshot is referenced by its git object
 * hash or a stash commit hash; untracked files are bundled into the
 * snapshot as well.
 */
export const CheckpointSnapshot = z.object({
  /** Git tree/commit hash representing the workspace state at checkpoint time. */
  treeHash: z.string().min(1).describe('git tree hash of the workspace snapshot'),
  /** Git commit hash (HEAD) at checkpoint time, used for worktree creation. */
  commitHash: z.string().min(1).optional().describe('git commit hash for worktree creation'),
  /** Whether untracked files are included in the snapshot. */
  includesUntracked: z.boolean(),
  /** Absolute workspace root path. */
  workspaceRoot: z.string().min(1),
  /** Path to the bundled untracked-files archive (tar), relative to checkpoint data dir. */
  untrackedBundlePath: z.string().optional(),
  /** List of untracked file relative paths included. */
  untrackedFiles: z.array(z.string()).default([]),
  /** Path to staged diff (git diff --cached) patch file, relative to checkpoint data dir. */
  stagedDiffPath: z.string().optional(),
  /** Path to unstaged tracked diff (git diff) patch file, relative to checkpoint data dir. */
  unstagedDiffPath: z.string().optional(),
  /** Git status porcelain output at checkpoint time. */
  statusText: z.string().optional(),
  /** Whether staged changes were captured in the snapshot. */
  includesStaged: z.boolean().default(false),
  /** Whether unstaged tracked changes were captured in the snapshot. */
  includesUnstaged: z.boolean().default(false)
})
export type CheckpointSnapshot = z.infer<typeof CheckpointSnapshot>

/**
 * A single persisted checkpoint record.
 */
export const CheckpointRecord = z.object({
  /** Unique checkpoint id. */
  id: z.string().min(1),
  /** Owning thread id. */
  threadId: z.string().min(1),
  /** The turn id that triggered checkpoint creation. */
  turnId: z.string().min(1),
  /** ISO timestamp. */
  createdAt: z.string(),
  /** Event seq at the moment the checkpoint was created. */
  eventSeq: z.number().int().nonnegative(),
  /** Number of turn items at checkpoint time (conversation offset). */
  itemCount: z.number().int().nonnegative(),
  /** Number of turns at checkpoint time. */
  turnCount: z.number().int().nonnegative(),
  /** Snapshot metadata. */
  snapshot: CheckpointSnapshot,
  /** What triggered this checkpoint. */
  trigger: z.enum(['pre_mutation', 'manual'])
})
export type CheckpointRecord = z.infer<typeof CheckpointRecord>

/**
 * Summary of a checkpoint for timeline rendering.
 */
export const CheckpointSummary = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  createdAt: z.string(),
  eventSeq: z.number().int().nonnegative(),
  trigger: z.enum(['pre_mutation', 'manual']),
  /** Short label for timeline display. */
  label: z.string()
})
export type CheckpointSummary = z.infer<typeof CheckpointSummary>

/**
 * Request body for creating a checkpoint.
 */
export const CreateCheckpointRequest = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  trigger: z.enum(['pre_mutation', 'manual']).default('pre_mutation'),
  eventSeq: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  turnCount: z.number().int().nonnegative(),
  workspaceRoot: z.string().min(1)
})
export type CreateCheckpointRequest = z.infer<typeof CreateCheckpointRequest>

/**
 * Request body for restore operations.
 */
export const RestoreCheckpointRequest = z.object({
  checkpointId: z.string().min(1),
  target: RestoreTarget,
  /** Gate 5: Explicit confirmation to overwrite pre-existing staged changes
   *  that the checkpoint did not capture. Without this flag the restore will
   *  be blocked with a DirtyWorkspaceRestoreError. */
  confirmDirtyOverwrite: z.boolean().optional()
})
export type RestoreCheckpointRequest = z.infer<typeof RestoreCheckpointRequest>

/**
 * Request body for fork-from-checkpoint operations.
 */
export const ForkFromCheckpointRequest = z.object({
  checkpointId: z.string().min(1),
  title: z.string().optional(),
  /** If true, create a managed worktree at the checkpoint snapshot state. */
  createWorktree: z.boolean().default(false),
  /** Parent directory for the worktree (defaults to a sibling of the workspace root). */
  worktreeParent: z.string().optional(),
  /** Branch name for the managed worktree. */
  worktreeBranch: z.string().optional()
})
export type ForkFromCheckpointRequest = z.infer<typeof ForkFromCheckpointRequest>

/**
 * Checkpoint retention configuration.
 */
export const CheckpointRetentionConfig = z.object({
  /** Maximum number of checkpoints to retain per thread. 0 disables. */
  maxPerThread: z.number().int().min(0).max(1000).default(20),
  /** Maximum total checkpoints across all threads. 0 disables. */
  maxTotal: z.number().int().min(0).max(10000).default(200),
  /** Auto-create checkpoint before first mutating tool call of a turn. */
  autoBeforeMutation: z.boolean().default(true)
})
export type CheckpointRetentionConfig = z.infer<typeof CheckpointRetentionConfig>

export const DEFAULT_CHECKPOINT_RETENTION: CheckpointRetentionConfig = {
  maxPerThread: 20,
  maxTotal: 200,
  autoBeforeMutation: true
}

/**
 * Response after a checkpoint operation.
 */
export const CheckpointResponse = z.object({
  checkpoint: CheckpointRecord
})
export type CheckpointResponse = z.infer<typeof CheckpointResponse>

export const CheckpointListResponse = z.object({
  checkpoints: z.array(CheckpointSummary)
})
export type CheckpointListResponse = z.infer<typeof CheckpointListResponse>

export const RestoreCheckpointResponse = z.object({
  restored: z.boolean(),
  target: RestoreTarget,
  checkpointId: z.string().min(1),
  /** New thread id when restoring conversation or both (conversation is truncated). */
  newThreadId: z.string().min(1).optional(),
  /** Number of items after truncation (conversation and both targets). */
  newItemCount: z.number().int().nonnegative().optional()
})
export type RestoreCheckpointResponse = z.infer<typeof RestoreCheckpointResponse>

/**
 * Typed error for restore operations blocked by pre-existing dirty workspace.
 */
export class DirtyWorkspaceRestoreError extends Error {
  public readonly code = 'dirty_workspace_restore_blocked'
  public readonly details: {
    stagedFiles: string[]
    unstagedFiles: string[]
    untrackedFiles: string[]
  }

  constructor(message: string, details: { stagedFiles: string[]; unstagedFiles: string[]; untrackedFiles: string[] }) {
    super(message)
    this.name = 'DirtyWorkspaceRestoreError'
    this.details = details
  }
}

export const ForkFromCheckpointResponse = z.object({
  forkedThreadId: z.string().min(1),
  checkpointId: z.string().min(1),
  worktreePath: z.string().optional()
})
export type ForkFromCheckpointResponse = z.infer<typeof ForkFromCheckpointResponse>
