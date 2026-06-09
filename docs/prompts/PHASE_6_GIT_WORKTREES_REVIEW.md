# Phase 6 Prompt: Git, Worktrees, Handoff, And Review

## Recommended Model

- Primary: `gpt-5.5`
- Reasoning: `high`
- Why: git/worktree features can destroy user work if implemented casually.
  This phase needs strong safety rules around dirty files, branch state,
  worktree cleanup, diffs, and PR preparation.
- Implementation helper: `gpt-5.4`, reasoning `high`, for UI-only diff/review
  work after contracts are stable.

## Paste-Ready Goal

```text
/goal Phase 6: Git, Worktrees, Handoff, and Review

Run from the OpenCodex Desktop repository root.

Objective:
Add Codex-like Git and worktree workflows: safe repository status, branch
awareness, managed worktrees for background tasks, handoff between local and
worktree modes, diff review, inline comments, stage/revert controls, commit,
push, and PR preparation. Preserve unrelated dirty/untracked files.

Model:
Use gpt-5.5 with reasoning high.

Read first:
- AGENTS.md and docs/AGENTS.md
- docs/DESKTOP_UX_BENCHMARK.md
- docs/ENGINE_AUDIT_KUN.md
- current git-service, workspace-service, renderer workbench, IPC/preload, and
  Kun session/fork/resume code

Scope allowed:
- Git service contracts and tests
- Managed worktree metadata and cleanup safeguards
- Handoff summaries between local/worktree sessions
- Diff/review UI and IPC
- Commit/push/PR helpers behind explicit controls
- Docs/report for Phase 6

Scope forbidden:
- No destructive git reset/checkout of user changes.
- No silent cleanup of worktrees.
- No push or PR creation unless explicitly approved in the active run.
- No mutation outside trusted workspace roots.
- Do not push unless explicitly requested.

Required behavior:
1. Show git status, branch, upstream, changed files, and untracked files.
2. Add diff view with file and hunk-level visibility.
3. Add stage/revert controls with explicit confirmation for destructive paths.
4. Add managed worktree create/list/open/handoff/cleanup with snapshots before
   deletion where practical.
5. Add handoff summaries that let another session resume without chat history.
6. Add commit/push/PR preparation controls gated by explicit user action.
7. Record audit events or thread items for meaningful git mutations.

Verification:
- Git service tests using temporary repos.
- Dirty/untracked preservation tests.
- Worktree lifecycle tests.
- Renderer diff/review tests.
- npm test
- npm run typecheck
- npm run build
```

## Exit Criteria

- Users can see and control code changes without leaving the app.
- Worktrees isolate background tasks instead of endangering the active checkout.
- No git action silently destroys unrelated user work.

