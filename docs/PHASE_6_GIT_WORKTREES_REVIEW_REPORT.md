# Phase 6 Git, Worktrees, Handoff, And Review Report

Date: 2026-06-10

## Source Prompt

- `docs/prompts/PHASE_6_GIT_WORKTREES_REVIEW.md`

## Implemented In This Slice

- Extended `src/main/services/git-service.ts` so branch status now includes
  structured dirty-worktree details from `git status --porcelain=v1`.
- Added a safety gate to `switchGitBranch()` that blocks branch switching while
  local changes are present, returning `reason: "dirty_worktree"` and the
  current status instead of carrying user edits across branches silently.
- Added managed worktree create/list/remove service functions. Managed worktrees
  are marked with metadata under the Git common dir rather than tracked project
  files.
- Added cleanup safeguards: unmanaged worktrees are refused, dirty managed
  worktrees are refused, and clean managed worktree removal also prunes the
  managed branch.
- Added explicit dirty managed worktree snapshot cleanup. Dirty removal remains
  blocked by default; with confirmation `snapshot-and-remove-dirty-worktree`,
  the service writes `tracked.patch`, `staged.patch`, `status.txt`, and copies
  untracked files under a snapshot directory before forced removal.
- Exposed managed worktree list/create/remove through typed main IPC and preload
  methods for future renderer controls.
- Added managed worktree handoff summary generation. The summary includes the
  repository, worktree path, branch, optional thread/goal context, dirty status,
  and resume commands so another session can continue without chat history.
- Exposed handoff summary generation through typed main IPC and preload methods.
- Added git diff review service output with per-file staged/unstaged flags,
  status, additions, deletions, and unified patch text.
- Added path-scoped staging and tracked-file discard service functions. Discard
  requires the exact confirmation token `discard-local-changes` and refuses to
  delete untracked files.
- Exposed diff, stage, and discard through typed main IPC and preload methods.
- Added read-only commit/push/PR preparation output. The service reports branch,
  upstream, staged files, unstaged files, untracked files, readiness gates,
  shell-quoted suggested commands, and a Markdown summary without committing,
  pushing, or creating a PR.
- Exposed review preparation through typed main IPC and preload methods.
- Added repository-local Git audit logging under the Git common dir
  (`opencodex/git-audit.jsonl`) for successful stage, discard, managed
  worktree create, and managed worktree remove mutations. Dirty snapshot
  removals record the snapshot path. A bounded read API is exposed through
  typed main IPC and preload methods.
- Added a live Git review block to the change inspector. It loads repository
  status from the typed Git IPC contracts, shows staged/modified/untracked
  files, displays recent audit-event count, stages selected paths, and gates
  tracked-file discard behind a confirmation dialog before sending the service
  confirmation token.
- Added live Git diff visibility to the change inspector using the typed
  `getGitDiff()` IPC contract. Users can select staged/unstaged files and see
  the unified patch with hunk headers in the existing diff renderer.
- Added path-scoped inline review comments to the live diff panel so users can
  annotate the selected file while reviewing a patch.
- Added a Git audit timeline to the change inspector so recent stage, discard,
  worktree create, and worktree remove events are inspectable instead of only
  counted.
- Added managed worktree renderer controls to list Git worktrees, create a
  managed worktree from a branch/base pair, open a worktree path, generate a
  resumable handoff summary, and request snapshot-backed managed cleanup behind
  an explicit confirmation dialog.
- Added commit/push/PR preparation controls to the renderer. The surface accepts
  a commit-message draft, shows branch/upstream state, refreshes read-only
  readiness gates, and displays copyable suggested commands without executing
  commit, push, or PR creation.
- Raised the root Vitest per-test timeout to 15 seconds because real temp-repo
  Git worktree tests exceeded the default 5 seconds under full-suite load.
- Added focused temp-repository tests for staged, modified, untracked,
  dirty-switch preservation, managed worktree creation, dirty cleanup refusal,
  dirty cleanup snapshot preservation, clean cleanup behavior, handoff summary
  content, diff review data, path-scoped staging, confirmation-gated discard,
  read-only review preparation, and shell-quoted command generation.

## Non-Goals And Follow-Ups

- Commit/push/PR execution was intentionally kept out of the app mutation path.
  Current support is a gated preparation surface with shell-quoted, copyable
  suggested commands. No commit, push, or PR creation runs from this surface.
- Snapshot-backed cleanup is exposed as a confirmed managed-worktree action.
  A future polish pass could preview the generated snapshot after removal.

## Verification

- `npm test -- src/main/services/git-service.test.ts`
- `npm test -- src/main/ipc/app-ipc-schemas.test.ts`
- `npm test -- src/renderer/src/components/ChangeInspector.test.ts`
- `npm run typecheck`
- `npm test`
- `npm run build`
