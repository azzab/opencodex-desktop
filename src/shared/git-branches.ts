export type GitBranchRow = {
  name: string
  current: boolean
}

export type GitFileStatusCategory =
  | 'staged'
  | 'modified'
  | 'untracked'
  | 'renamed'
  | 'deleted'
  | 'conflicted'

export type GitFileStatus = {
  path: string
  indexStatus: string
  workTreeStatus: string
  category: GitFileStatusCategory
}

export type GitWorkingTreeStatus = {
  clean: boolean
  stagedCount: number
  modifiedCount: number
  untrackedCount: number
  conflictedCount: number
  files: GitFileStatus[]
}

export type GitWorktreeRow = {
  path: string
  head: string | null
  branch: string | null
  bare: boolean
  detached: boolean
  locked: boolean
  prunable: boolean
  managed: boolean
}

export type ManagedGitWorktreeOptions = {
  branch: string
  baseBranch?: string
  worktreeParent?: string
}

export type ManagedGitWorktreeRemoveOptions = {
  confirmation?: string
  snapshotParent?: string
}

export type GitWorktreeRemovalSnapshot = {
  path: string
  worktreePath: string
  branch: string | null
  status: GitWorkingTreeStatus
  trackedPatchPath: string
  stagedPatchPath: string
  statusPath: string
  untrackedDir: string
  untrackedFiles: string[]
  createdAt: string
}

export type GitWorktreeHandoffOptions = {
  threadId?: string
  goal?: string
}

export type GitReviewPreparationOptions = {
  commitMessage?: string
  remote?: string
  baseBranch?: string
}

export type GitAuditAction =
  | 'paths.stage'
  | 'paths.discard'
  | 'worktree.create'
  | 'worktree.remove'

export type GitAuditEvent = {
  id: string
  timestamp: string
  action: GitAuditAction
  outcome: 'completed'
  repositoryRoot: string
  paths?: string[]
  worktreePath?: string
  branch?: string | null
  baseBranch?: string
  branchDeleted?: string | null
  snapshotPath?: string
}

export type GitAuditLogOptions = {
  limit?: number
}

export type GitDiffFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted'

export type GitDiffFile = {
  path: string
  oldPath?: string
  status: GitDiffFileStatus
  staged: boolean
  additions: number
  deletions: number
  patch: string
}

export type GitPathMutationResult =
  | {
      ok: true
      status: GitWorkingTreeStatus
    }
  | {
      ok: false
      reason:
        | 'no_workspace'
        | 'not_git_repo'
        | 'git_unavailable'
        | 'invalid_path'
        | 'confirmation_required'
        | 'untracked_requires_delete'
        | 'error'
      message: string
      status?: GitWorkingTreeStatus
    }

export type GitBranchesResult =
  | {
      ok: true
      repositoryRoot: string
      currentBranch: string | null
      branches: GitBranchRow[]
      dirtyCount: number
      status: GitWorkingTreeStatus
    }
  | {
      ok: false
      reason: 'no_workspace' | 'not_git_repo' | 'git_unavailable' | 'dirty_worktree' | 'error'
      message: string
      status?: GitWorkingTreeStatus
    }

export type GitWorktreeListResult =
  | {
      ok: true
      repositoryRoot: string
      worktrees: GitWorktreeRow[]
    }
  | {
      ok: false
      reason: 'no_workspace' | 'not_git_repo' | 'git_unavailable' | 'error'
      message: string
    }

export type ManagedGitWorktreeCreateResult =
  | {
      ok: true
      repositoryRoot: string
      path: string
      branch: string
      managed: true
    }
  | {
      ok: false
      reason: 'no_workspace' | 'not_git_repo' | 'git_unavailable' | 'invalid_worktree' | 'error'
      message: string
    }

export type ManagedGitWorktreeRemoveResult =
  | {
      ok: true
      path: string
      branchDeleted: string | null
      snapshot?: GitWorktreeRemovalSnapshot
    }
  | {
      ok: false
      reason:
        | 'no_workspace'
        | 'not_git_repo'
        | 'git_unavailable'
        | 'invalid_worktree'
        | 'unmanaged_worktree'
        | 'dirty_worktree'
        | 'confirmation_required'
        | 'error'
      message: string
      status?: GitWorkingTreeStatus
    }

export type GitWorktreeHandoffResult =
  | {
      ok: true
      repositoryRoot: string
      path: string
      branch: string | null
      status: GitWorkingTreeStatus
      markdown: string
    }
  | {
      ok: false
      reason:
        | 'no_workspace'
        | 'not_git_repo'
        | 'git_unavailable'
        | 'invalid_worktree'
        | 'unmanaged_worktree'
        | 'error'
      message: string
    }

export type GitDiffResult =
  | {
      ok: true
      repositoryRoot: string
      files: GitDiffFile[]
    }
  | {
      ok: false
      reason: 'no_workspace' | 'not_git_repo' | 'git_unavailable' | 'error'
      message: string
    }

export type GitReviewPreparationResult =
  | {
      ok: true
      repositoryRoot: string
      currentBranch: string | null
      upstream: string | null
      status: GitWorkingTreeStatus
      stagedFiles: string[]
      unstagedFiles: string[]
      untrackedFiles: string[]
      commitReady: boolean
      pushReady: boolean
      prReady: boolean
      blockedReasons: string[]
      suggestedCommands: string[]
      markdown: string
    }
  | {
      ok: false
      reason: 'no_workspace' | 'not_git_repo' | 'git_unavailable' | 'error'
      message: string
    }

export type GitAuditLogResult =
  | {
      ok: true
      repositoryRoot: string
      events: GitAuditEvent[]
    }
  | {
      ok: false
      reason: 'no_workspace' | 'not_git_repo' | 'git_unavailable' | 'error'
      message: string
    }
