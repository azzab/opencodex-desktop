# Phase H5: Checkpoint, Rewind, And Fork

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-h5-checkpoint` · worktree `../ocx-h5`
- Note: merges AFTER H4; orchestrator rebases this lane on merged H4 before review (shared `thread-service.ts`).

## Goal
First-class recovery semantics like Codex/Claude Code checkpoints: an
automatic checkpoint before each mutating turn, and user-driven **restore
code only**, **restore conversation only**, **restore both**, and
**fork-from-checkpoint** into a new thread. Built on the existing Phase 6
snapshot/worktree infrastructure and persisted thread events — no new
runtime.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/PHASE_6_GIT_WORKTREES_REVIEW_REPORT.md` (snapshot machinery)
3. `kun/src/services/thread-service.ts` + thread event persistence
4. `docs/ENGINE_AUDIT_KUN.md` (checkpoint & rewind gap definition)

## Scope
### Checkpoint creation
- Before the first mutating tool call of an execute-mode turn, record a
  checkpoint: workspace snapshot (git-based, reusing Phase 6 snapshot
  mechanics; handle untracked files) + conversation event offset + metadata
  (turn id, timestamp, trigger).
- Checkpoints are cheap and bounded: configurable retention under
  `agents.kun.checkpoints` (count limit + cleanup, mirroring snapshot cleanup).

### Restore & fork
- Restore code only: workspace returns to checkpoint state; conversation continues (a system event notes the restore).
- Restore conversation only: thread truncates to the checkpoint offset; workspace untouched.
- Restore both. All restores are destructive-action confirmed in UI and audited.
- Fork-from-checkpoint: new thread seeded with conversation up to the checkpoint, optionally in a managed worktree at the snapshot state (reuses Phase 6 worktrees + handoff summaries).

### Renderer
- Checkpoint timeline in the thread view (markers per checkpoint) with restore/fork actions and confirmations.

## Surfaces to Build (REQUIRED)
- Kun contracts + checkpoint service + thread-service integration + tests.
- IPC/app-server protocol additions.
- Renderer checkpoint timeline + restore/fork dialogs (loading/empty/error/success).
- Settings: retention controls.

## UI rules (BLOCKING)
- i18n en+zh+ar; RTL-safe; destructive confirmations follow existing Phase 6 confirmation pattern.
- Never `git reset --hard` user changes that predate the session without an explicit dirty-state warning.
- Audit every checkpoint create/restore/fork.

## Out Of Scope
- Plan-mode changes (H4 owns mode logic).
- Cloud/remote checkpoint storage.

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
git diff --check
```

## Stop Gates
- Test: mutate files in a turn → restore code only → file hashes equal pre-turn hashes, conversation length unchanged.
- Test: restore conversation only → events truncated, files untouched.
- Test: fork creates a new thread whose history stops at the checkpoint and whose worktree matches the snapshot.
- Retention cleanup proven (create N+2 checkpoints with limit N → oldest pruned).
- Manual proof in dev app: timeline renders, restore flow asks for confirmation.

## Git Commit Message
`feat(kun): checkpoint-before-mutation with code/conversation restore and fork-from-checkpoint`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H5_CHECKPOINT_REWIND.md. Implement automatic checkpoints before mutating turns (git-based snapshots reusing Phase 6 machinery, untracked files included), restore code-only / conversation-only / both, and fork-from-checkpoint into a new thread (optionally in a managed worktree), with retention settings under agents.kun.checkpoints, audit events, protocol additions, and a renderer checkpoint timeline with confirmed destructive actions. Run the full verification block; nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, hash-equality test evidence, tests + results, and gaps.
