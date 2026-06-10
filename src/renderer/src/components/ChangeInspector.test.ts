import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import { useChatStore } from '../store/chat-store'
import {
  ChangeInspector,
  GitAuditTimelinePanelView,
  GitLiveDiffPanelView,
  GitReviewPanelView,
  GitReviewPreparationPanelView,
  GitWorktreePanelView
} from './ChangeInspector'

describe('ChangeInspector', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useChatStore.setState({
      workspaceRoot: '/Users/mohamedazab/opencodex-desktop',
      inspectorSelectedId: null
    })
  })

  it('shows git branch state in the change review surface', () => {
    const html = renderToStaticMarkup(
      createElement(ChangeInspector, {
        blocks: [],
        workspaceRoot: '/Users/mohamedazab/opencodex-desktop',
        onCollapse: vi.fn()
      })
    )

    expect(html).toContain('Git branch')
    expect(html).toContain('No Git repo')
  })

  it('renders live git review controls for staged, modified, and untracked files', () => {
    const html = renderToStaticMarkup(
      createElement(GitReviewPanelView, {
        status: {
          clean: false,
          stagedCount: 1,
          modifiedCount: 1,
          untrackedCount: 1,
          conflictedCount: 0,
          files: [
            { path: 'src/main.ts', indexStatus: 'M', workTreeStatus: ' ', category: 'staged' },
            { path: 'README.md', indexStatus: ' ', workTreeStatus: 'M', category: 'modified' },
            { path: 'notes.md', indexStatus: '?', workTreeStatus: '?', category: 'untracked' }
          ]
        },
        auditCount: 2,
        busyPath: null,
        error: null,
        onRefresh: vi.fn(),
        onStagePath: vi.fn(),
        onDiscardPath: vi.fn()
      })
    )

    expect(html).toContain('Repository changes')
    expect(html).toContain('Staged')
    expect(html).toContain('Modified')
    expect(html).toContain('Untracked')
    expect(html).toContain('src/main.ts')
    expect(html).toContain('README.md')
    expect(html).toContain('notes.md')
    expect(html).toContain('Stage')
    expect(html).toContain('Discard')
    expect(html).toContain('Requires confirmation')
    expect(html).toContain('2 audit events')
  })

  it('renders live git diff files with hunk-level patch visibility', () => {
    const html = renderToStaticMarkup(
      createElement(GitLiveDiffPanelView, {
        files: [
          {
            path: 'README.md',
            status: 'modified',
            staged: false,
            additions: 1,
            deletions: 0,
            patch: 'diff --git a/README.md b/README.md\n@@ -1 +1,2 @@\n # Test\n+Changed line\n'
          },
          {
            path: 'src/main.ts',
            status: 'modified',
            staged: true,
            additions: 2,
            deletions: 1,
            patch: 'diff --git a/src/main.ts b/src/main.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line\n'
          }
        ],
        selectedPath: 'README.md',
        loading: false,
        error: null,
        commentDraft: 'Needs a smaller helper',
        comments: [
          {
            id: 'comment_1',
            path: 'README.md',
            body: 'Check this wording before commit.'
          }
        ],
        onSelectPath: vi.fn(),
        onRefresh: vi.fn(),
        onCommentDraftChange: vi.fn(),
        onAddComment: vi.fn()
      })
    )

    expect(html).toContain('Live diff')
    expect(html).toContain('README.md')
    expect(html).toContain('src/main.ts')
    expect(html).toContain('Unstaged')
    expect(html).toContain('Staged')
    expect(html).toContain('@@ -1 +1,2 @@')
    expect(html).toContain('+Changed line')
    expect(html).toContain('Review comments')
    expect(html).toContain('Needs a smaller helper')
    expect(html).toContain('Check this wording before commit.')
  })

  it('distinguishes staged and unstaged patches for the same file path', () => {
    const html = renderToStaticMarkup(
      createElement(GitLiveDiffPanelView, {
        files: [
          {
            path: 'README.md',
            status: 'modified',
            staged: true,
            additions: 1,
            deletions: 0,
            patch: 'diff --git a/README.md b/README.md\n@@ -1 +1,2 @@\n # Test\n+Staged line\n'
          },
          {
            path: 'README.md',
            status: 'modified',
            staged: false,
            additions: 1,
            deletions: 0,
            patch: 'diff --git a/README.md b/README.md\n@@ -1 +1,2 @@\n # Test\n+Unstaged line\n'
          }
        ],
        selectedPath: 'unstaged:README.md',
        loading: false,
        error: null,
        commentDraft: '',
        comments: [],
        onSelectPath: vi.fn(),
        onRefresh: vi.fn(),
        onCommentDraftChange: vi.fn(),
        onAddComment: vi.fn()
      })
    )

    expect(html).toContain('+Unstaged line')
    expect(html).not.toContain('+Staged line')
  })

  it('renders recent git audit events as an inspectable timeline', () => {
    const html = renderToStaticMarkup(
      createElement(GitAuditTimelinePanelView, {
        events: [
          {
            id: 'git_1',
            timestamp: '2026-06-10T06:00:00.000Z',
            action: 'paths.stage',
            outcome: 'completed',
            repositoryRoot: '/Users/mohamedazab/opencodex-desktop',
            paths: ['README.md']
          },
          {
            id: 'git_2',
            timestamp: '2026-06-10T06:05:00.000Z',
            action: 'worktree.remove',
            outcome: 'completed',
            repositoryRoot: '/Users/mohamedazab/opencodex-desktop',
            worktreePath: '/tmp/opencodex-desktop.worktrees/codex-phase-6',
            snapshotPath: '/tmp/snapshots/codex-phase-6'
          }
        ],
        loading: false,
        error: null,
        onRefresh: vi.fn()
      })
    )

    expect(html).toContain('Git audit timeline')
    expect(html).toContain('paths.stage')
    expect(html).toContain('README.md')
    expect(html).toContain('worktree.remove')
    expect(html).toContain('/tmp/snapshots/codex-phase-6')
  })

  it('renders managed worktree lifecycle controls with explicit cleanup confirmation', () => {
    const html = renderToStaticMarkup(
      createElement(GitWorktreePanelView, {
        worktrees: [
          {
            path: '/tmp/opencodex-desktop.worktrees/codex-phase-6',
            head: 'abc1234',
            branch: 'codex/phase-6',
            bare: false,
            detached: false,
            locked: false,
            prunable: false,
            managed: true
          },
          {
            path: '/Users/mohamedazab/opencodex-desktop',
            head: 'def5678',
            branch: 'main',
            bare: false,
            detached: false,
            locked: false,
            prunable: false,
            managed: false
          }
        ],
        branchDraft: 'codex/new-worker',
        baseBranchDraft: 'main',
        handoffMarkdown: '## Worktree handoff',
        busy: null,
        loading: false,
        error: null,
        onBranchDraftChange: vi.fn(),
        onBaseBranchDraftChange: vi.fn(),
        onRefresh: vi.fn(),
        onCreate: vi.fn(),
        onOpen: vi.fn(),
        onHandoff: vi.fn(),
        onRemove: vi.fn()
      })
    )

    expect(html).toContain('Managed worktrees')
    expect(html).toContain('codex/new-worker')
    expect(html).toContain('Create worktree')
    expect(html).toContain('codex/phase-6')
    expect(html).toContain('Managed')
    expect(html).toContain('Open')
    expect(html).toContain('Handoff')
    expect(html).toContain('Snapshot remove')
    expect(html).toContain('External')
    expect(html).toContain('## Worktree handoff')
  })

  it('renders commit push and PR preparation as gated commands', () => {
    const html = renderToStaticMarkup(
      createElement(GitReviewPreparationPanelView, {
        preparation: {
          ok: true,
          repositoryRoot: '/Users/mohamedazab/opencodex-desktop',
          currentBranch: 'codex/phase-6',
          upstream: 'origin/codex/phase-6',
          status: {
            clean: false,
            stagedCount: 1,
            modifiedCount: 1,
            untrackedCount: 0,
            conflictedCount: 0,
            files: []
          },
          stagedFiles: ['src/main.ts'],
          unstagedFiles: ['README.md'],
          untrackedFiles: [],
          commitReady: true,
          pushReady: true,
          prReady: false,
          blockedReasons: ['Stage or discard remaining local changes before PR preparation.'],
          suggestedCommands: [
            "git commit -m 'Phase 6 git review'",
            'git push -u origin codex/phase-6'
          ],
          markdown: '## Review preparation'
        },
        commitMessageDraft: 'Phase 6 git review',
        busy: false,
        error: null,
        onCommitMessageDraftChange: vi.fn(),
        onRefresh: vi.fn()
      })
    )

    expect(html).toContain('Commit, push, PR prep')
    expect(html).toContain('Explicit action only')
    expect(html).toContain('codex/phase-6')
    expect(html).toContain('origin/codex/phase-6')
    expect(html).toContain('Commit ready')
    expect(html).toContain('Push ready')
    expect(html).toContain('PR blocked')
    expect(html).toContain('Copy command')
    expect(html).toContain("git commit -m &#x27;Phase 6 git review&#x27;")
    expect(html).toContain('git push -u origin codex/phase-6')
    expect(html).toContain('Stage or discard remaining local changes before PR preparation.')
  })
})
