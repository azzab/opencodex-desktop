/**
 * Checkpoint types shared between the Kun runtime and renderer.
 * Mirrors the contract types from kun/src/contracts/checkpoints.ts.
 */

export type RestoreTarget = 'code' | 'conversation' | 'both'

export type CheckpointSnapshot = {
  treeHash: string
  commitHash?: string
  includesUntracked: boolean
  workspaceRoot: string
  untrackedBundlePath?: string
  untrackedFiles: string[]
}

export type CheckpointRecord = {
  id: string
  threadId: string
  turnId: string
  createdAt: string
  eventSeq: number
  itemCount: number
  turnCount: number
  snapshot: CheckpointSnapshot
  trigger: 'pre_mutation' | 'manual'
}

export type CheckpointSummary = {
  id: string
  threadId: string
  turnId: string
  createdAt: string
  eventSeq: number
  trigger: 'pre_mutation' | 'manual'
  label: string
}

export type CreateCheckpointRequest = {
  threadId: string
  turnId: string
  trigger?: 'pre_mutation' | 'manual'
  eventSeq: number
  itemCount: number
  turnCount: number
  workspaceRoot: string
}

export type RestoreCheckpointRequest = {
  checkpointId: string
  target: RestoreTarget
  /** Gate 5: Explicit confirmation to overwrite pre-existing staged changes. */
  confirmDirtyOverwrite?: boolean
}

export type ForkFromCheckpointRequest = {
  checkpointId: string
  title?: string
  createWorktree?: boolean
  worktreeParent?: string
  worktreeBranch?: string
}

export type CheckpointRetentionConfig = {
  maxPerThread: number
  maxTotal: number
  autoBeforeMutation: boolean
}
