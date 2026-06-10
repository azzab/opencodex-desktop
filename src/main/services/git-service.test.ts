import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createGitWorktreeHandoffSummary,
  createManagedGitWorktree,
  discardGitChanges,
  getGitBranches,
  getGitReviewPreparation,
  getGitDiff,
  listGitAuditEvents,
  listGitWorktrees,
  removeManagedGitWorktree,
  stageGitPaths,
  switchGitBranch
} from './git-service'

const tempRoots: string[] = []

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function createRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'opencodex-git-service-'))
  tempRoots.push(root)
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test User'])
  writeFileSync(join(root, 'README.md'), '# Test\n')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-m', 'initial'])
  return root
}

describe('git-service', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it('reports structured dirty state for staged, modified, and untracked files', async () => {
    const root = createRepo()
    writeFileSync(join(root, 'staged.txt'), 'staged\n')
    git(root, ['add', 'staged.txt'])
    writeFileSync(join(root, 'README.md'), '# Changed\n')
    writeFileSync(join(root, 'notes.md'), 'untracked\n')

    const result = await getGitBranches(root)

    expect(result).toMatchObject({
      ok: true,
      currentBranch: 'main',
      dirtyCount: 3,
      status: {
        clean: false,
        stagedCount: 1,
        modifiedCount: 1,
        untrackedCount: 1,
        files: expect.arrayContaining([
          { path: 'README.md', indexStatus: ' ', workTreeStatus: 'M', category: 'modified' },
          { path: 'notes.md', indexStatus: '?', workTreeStatus: '?', category: 'untracked' },
          { path: 'staged.txt', indexStatus: 'A', workTreeStatus: ' ', category: 'staged' }
        ])
      }
    })
  })

  it('blocks branch switches when local changes would be carried across branches', async () => {
    const root = createRepo()
    git(root, ['switch', '-c', 'feature'])
    git(root, ['switch', 'main'])
    writeFileSync(join(root, 'README.md'), '# Local work\n')

    const result = await switchGitBranch(root, 'feature')

    expect(result).toMatchObject({
      ok: false,
      reason: 'dirty_worktree',
      message: expect.stringContaining('local changes')
    })
    expect(git(root, ['branch', '--show-current']).trim()).toBe('main')
    expect(git(root, ['status', '--porcelain=v1']).split('\n')[0]).toBe(' M README.md')
  })

  it('creates a managed worktree without carrying dirty source checkout files', async () => {
    const root = createRepo()
    writeFileSync(join(root, 'README.md'), '# Local work\n')
    const worktreeParent = mkdtempSync(join(tmpdir(), 'opencodex-managed-worktrees-'))
    tempRoots.push(worktreeParent)

    const created = await createManagedGitWorktree(root, {
      branch: 'codex/phase-6-worker',
      worktreeParent
    })

    expect(created).toMatchObject({
      ok: true,
      branch: 'codex/phase-6-worker',
      managed: true
    })
    expect(created.ok && existsSync(created.path)).toBe(true)
    expect(git(root, ['status', '--porcelain=v1']).split('\n')[0]).toBe(' M README.md')
    if (created.ok) {
      expect(git(created.path, ['branch', '--show-current']).trim()).toBe('codex/phase-6-worker')
      expect(git(created.path, ['status', '--porcelain=v1']).trim()).toBe('')
    }

    const listed = await listGitWorktrees(root)
    expect(listed).toMatchObject({
      ok: true,
      worktrees: expect.arrayContaining([
        expect.objectContaining({
          branch: 'codex/phase-6-worker',
          managed: true
        })
      ])
    })
  })

  it('refuses to remove a dirty managed worktree', async () => {
    const root = createRepo()
    const worktreeParent = mkdtempSync(join(tmpdir(), 'opencodex-managed-worktrees-'))
    tempRoots.push(worktreeParent)
    const created = await createManagedGitWorktree(root, {
      branch: 'codex/dirty-worker',
      worktreeParent
    })
    if (!created.ok) throw new Error(created.message)
    writeFileSync(join(created.path, 'worker-notes.md'), 'local worker change\n')

    const removed = await removeManagedGitWorktree(root, created.path)

    expect(removed).toMatchObject({
      ok: false,
      reason: 'dirty_worktree',
      message: expect.stringContaining('local changes')
    })
    expect(existsSync(created.path)).toBe(true)
  })

  it('snapshots tracked and untracked dirty worktree changes before confirmed removal', async () => {
    const root = createRepo()
    const worktreeParent = mkdtempSync(join(tmpdir(), 'opencodex-managed-worktrees-'))
    const snapshotParent = mkdtempSync(join(tmpdir(), 'opencodex-worktree-snapshots-'))
    tempRoots.push(worktreeParent, snapshotParent)
    const created = await createManagedGitWorktree(root, {
      branch: 'codex/snapshot-worker',
      worktreeParent
    })
    if (!created.ok) throw new Error(created.message)
    writeFileSync(join(created.path, 'README.md'), '# Test\n\ntracked change\n')
    writeFileSync(join(created.path, 'worker-notes.md'), 'local worker note\n')

    const removed = await removeManagedGitWorktree(root, created.path, {
      confirmation: 'snapshot-and-remove-dirty-worktree',
      snapshotParent
    })

    expect(removed).toMatchObject({
      ok: true,
      path: created.path,
      branchDeleted: 'codex/snapshot-worker',
      snapshot: expect.objectContaining({
        worktreePath: created.path,
        branch: 'codex/snapshot-worker',
        status: expect.objectContaining({ clean: false })
      })
    })
    if (removed.ok) {
      expect(existsSync(created.path)).toBe(false)
      expect(existsSync(removed.snapshot?.path ?? '')).toBe(true)
      expect(readFileSync(join(removed.snapshot!.path, 'tracked.patch'), 'utf8')).toContain('+tracked change')
      expect(readFileSync(join(removed.snapshot!.path, 'status.txt'), 'utf8')).toContain('worker-notes.md')
      expect(readFileSync(join(removed.snapshot!.path, 'untracked', 'worker-notes.md'), 'utf8')).toBe('local worker note\n')
    }
    expect(git(root, ['branch', '--format=%(refname:short)'])).not.toContain('codex/snapshot-worker')
    const audit = await listGitAuditEvents(root)
    expect(audit).toMatchObject({
      ok: true,
      events: expect.arrayContaining([
        expect.objectContaining({
          action: 'worktree.remove',
          outcome: 'completed',
          worktreePath: created.path,
          branch: 'codex/snapshot-worker',
          snapshotPath: removed.ok ? removed.snapshot?.path : undefined
        })
      ])
    })
  })

  it('removes a clean managed worktree and prunes its branch', async () => {
    const root = createRepo()
    const worktreeParent = mkdtempSync(join(tmpdir(), 'opencodex-managed-worktrees-'))
    tempRoots.push(worktreeParent)
    const created = await createManagedGitWorktree(root, {
      branch: 'codex/clean-worker',
      worktreeParent
    })
    if (!created.ok) throw new Error(created.message)

    const removed = await removeManagedGitWorktree(root, created.path)

    expect(removed).toEqual({
      ok: true,
      path: created.path,
      branchDeleted: 'codex/clean-worker'
    })
    expect(existsSync(created.path)).toBe(false)
    expect(git(root, ['branch', '--format=%(refname:short)'])).not.toContain('codex/clean-worker')
  })

  it('builds a resumable handoff summary for a managed worktree', async () => {
    const root = createRepo()
    const worktreeParent = mkdtempSync(join(tmpdir(), 'opencodex-managed-worktrees-'))
    tempRoots.push(worktreeParent)
    const created = await createManagedGitWorktree(root, {
      branch: 'codex/handoff-worker',
      worktreeParent
    })
    if (!created.ok) throw new Error(created.message)
    writeFileSync(join(created.path, 'handoff-notes.md'), 'resume context\n')

    const summary = await createGitWorktreeHandoffSummary(root, created.path, {
      threadId: 'thread_123',
      goal: 'Finish Phase 6 review controls'
    })

    expect(summary).toMatchObject({
      ok: true,
      path: created.path,
      branch: 'codex/handoff-worker'
    })
    if (summary.ok) {
      expect(summary.markdown).toContain('# OpenCodex Worktree Handoff')
      expect(summary.markdown).toContain('codex/handoff-worker')
      expect(summary.markdown).toContain(created.path)
      expect(summary.markdown).toContain('thread_123')
      expect(summary.markdown).toContain('Finish Phase 6 review controls')
      expect(summary.markdown).toContain('handoff-notes.md')
      expect(summary.markdown).toContain('cd ')
      expect(summary.markdown).toContain('git status --short')
    }
  })

  it('returns changed files with patch text for review', async () => {
    const root = createRepo()
    writeFileSync(join(root, 'README.md'), '# Test\n\nChanged line\n')
    writeFileSync(join(root, 'notes.md'), 'new note\n')
    git(root, ['add', 'notes.md'])

    const diff = await getGitDiff(root)

    expect(diff).toMatchObject({
      ok: true,
      files: expect.arrayContaining([
        expect.objectContaining({
          path: 'README.md',
          staged: false,
          status: 'modified',
          patch: expect.stringContaining('+Changed line')
        }),
        expect.objectContaining({
          path: 'notes.md',
          staged: true,
          status: 'added',
          patch: expect.stringContaining('+new note')
        })
      ])
    })
  })

  it('stages only requested paths and preserves unrelated local changes', async () => {
    const root = createRepo()
    writeFileSync(join(root, 'README.md'), '# Test\n\nStage me\n')
    writeFileSync(join(root, 'other.md'), 'do not stage\n')

    const staged = await stageGitPaths(root, ['README.md'])

    expect(staged).toMatchObject({ ok: true })
    expect(git(root, ['status', '--porcelain=v1']).split('\n').filter(Boolean)).toEqual([
      'M  README.md',
      '?? other.md'
    ])
  })

  it('records audit events for staging and confirmed discard mutations', async () => {
    const root = createRepo()
    writeFileSync(join(root, 'README.md'), '# Test\n\nStage me\n')

    const staged = await stageGitPaths(root, ['README.md'])

    expect(staged).toMatchObject({ ok: true })
    writeFileSync(join(root, 'README.md'), '# Test\n\nDiscard me\n')

    const discarded = await discardGitChanges(root, ['README.md'], {
      confirmation: 'discard-local-changes'
    })

    expect(discarded).toMatchObject({ ok: true })
    const audit = await listGitAuditEvents(root)
    expect(audit).toMatchObject({
      ok: true,
      repositoryRoot: expect.any(String),
      events: [
        expect.objectContaining({
          action: 'paths.stage',
          outcome: 'completed',
          paths: ['README.md']
        }),
        expect.objectContaining({
          action: 'paths.discard',
          outcome: 'completed',
          paths: ['README.md']
        })
      ]
    })
    if (audit.ok) {
      expect(audit.events[0]?.id).toMatch(/^git_/)
      expect(audit.events[0]?.timestamp).toMatch(/T/)
    }
  })

  it('requires explicit confirmation before discarding tracked changes', async () => {
    const root = createRepo()
    writeFileSync(join(root, 'README.md'), '# Reverted\n')

    const blocked = await discardGitChanges(root, ['README.md'])

    expect(blocked).toMatchObject({
      ok: false,
      reason: 'confirmation_required'
    })
    expect(git(root, ['status', '--porcelain=v1']).split('\n')[0]).toBe(' M README.md')

    const discarded = await discardGitChanges(root, ['README.md'], {
      confirmation: 'discard-local-changes'
    })

    expect(discarded).toMatchObject({ ok: true })
    expect(git(root, ['status', '--porcelain=v1']).trim()).toBe('')
  })

  it('prepares a read-only commit and PR summary from staged changes', async () => {
    const root = createRepo()
    git(root, ['switch', '-c', 'codex/review-prep'])
    writeFileSync(join(root, 'README.md'), '# Test\n\nCommit me\n')
    git(root, ['add', 'README.md'])
    writeFileSync(join(root, 'notes.md'), 'leave untracked\n')

    const preparation = await getGitReviewPreparation(root, {
      commitMessage: 'Add review prep',
      remote: 'origin',
      baseBranch: 'main'
    })

    expect(preparation).toMatchObject({
      ok: true,
      currentBranch: 'codex/review-prep',
      upstream: null,
      commitReady: true,
      pushReady: true,
      prReady: true,
      stagedFiles: ['README.md'],
      unstagedFiles: [],
      untrackedFiles: ['notes.md'],
      blockedReasons: []
    })
    if (preparation.ok) {
      expect(preparation.suggestedCommands).toContain("git commit -m 'Add review prep'")
      expect(preparation.suggestedCommands).toContain("git push -u 'origin' 'codex/review-prep'")
      expect(preparation.suggestedCommands).toContain("gh pr create --base 'main' --head 'codex/review-prep' --fill")
      expect(preparation.markdown).toContain('## Staged Files')
      expect(preparation.markdown).toContain('- README.md')
      expect(preparation.markdown).toContain('## Not Included')
      expect(preparation.markdown).toContain('- ?? notes.md')
      expect(git(root, ['status', '--porcelain=v1']).split('\n').filter(Boolean)).toEqual([
        'M  README.md',
        '?? notes.md'
      ])
    }
  })

  it('blocks push and PR preparation on the base branch even with staged changes', async () => {
    const root = createRepo()
    writeFileSync(join(root, 'README.md'), '# Test\n\nDo not push main\n')
    git(root, ['add', 'README.md'])

    const preparation = await getGitReviewPreparation(root, {
      commitMessage: 'Unsafe base branch commit',
      remote: 'origin',
      baseBranch: 'main'
    })

    expect(preparation).toMatchObject({
      ok: true,
      currentBranch: 'main',
      commitReady: true,
      pushReady: false,
      prReady: false,
      blockedReasons: expect.arrayContaining([
        'Pull request preparation requires a non-base branch.'
      ])
    })
    if (preparation.ok) {
      expect(preparation.suggestedCommands).toContain("git commit -m 'Unsafe base branch commit'")
      expect(preparation.suggestedCommands).not.toContain("git push 'origin' 'main'")
      expect(preparation.suggestedCommands).not.toContain("git push -u 'origin' 'main'")
      expect(preparation.suggestedCommands.some((command) => command.startsWith('gh pr create'))).toBe(false)
    }
  })

  it('quotes user-controlled review preparation command arguments', async () => {
    const root = createRepo()
    git(root, ['switch', '-c', 'codex/review-prep'])
    writeFileSync(join(root, 'README.md'), '# Test\n\nQuote me\n')
    git(root, ['add', 'README.md'])

    const preparation = await getGitReviewPreparation(root, {
      commitMessage: "Bob's change",
      remote: 'origin; echo unsafe',
      baseBranch: 'main; echo unsafe'
    })

    expect(preparation).toMatchObject({ ok: true })
    if (preparation.ok) {
      expect(preparation.suggestedCommands).toContain("git commit -m 'Bob'\\''s change'")
      expect(preparation.suggestedCommands).toContain("git push -u 'origin; echo unsafe' 'codex/review-prep'")
      expect(preparation.suggestedCommands).toContain("gh pr create --base 'main; echo unsafe' --head 'codex/review-prep' --fill")
    }
  })

  it('blocks commit preparation when no staged changes are present', async () => {
    const root = createRepo()
    writeFileSync(join(root, 'README.md'), '# Unstaged only\n')

    const preparation = await getGitReviewPreparation(root)

    expect(preparation).toMatchObject({
      ok: true,
      commitReady: false,
      pushReady: false,
      prReady: false,
      stagedFiles: [],
      unstagedFiles: ['README.md'],
      blockedReasons: expect.arrayContaining(['No staged changes are ready to commit.'])
    })
    if (preparation.ok) {
      expect(preparation.suggestedCommands).toEqual(['git status --short'])
      expect(preparation.markdown).toContain('No staged changes are ready to commit.')
    }
  })
})
