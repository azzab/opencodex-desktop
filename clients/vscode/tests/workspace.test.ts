import { describe, expect, it } from 'vitest'
import { filterThreadsForWorkspace, normalizeWorkspaceRoot, threadBelongsToWorkspace, workspaceLabel } from '../src/workspace.js'
import type { VsCodeThread } from '../src/client.js'

function thread(id: string, workspaceRoot: string): VsCodeThread {
  return {
    id,
    title: id,
    workspaceRoot,
    model: 'auto',
    mode: 'agent',
    status: 'idle',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01'
  }
}

describe('VS Code workspace helpers', () => {
  it('normalizes workspace roots for comparison', () => {
    expect(normalizeWorkspaceRoot('/Users/me/project/')).toBe('/Users/me/project')
    expect(normalizeWorkspaceRoot('C:\\Users\\me\\project\\')).toBe('C:/Users/me/project')
  })

  it('labels the open workspace folder', () => {
    expect(workspaceLabel('/Users/me/opencodex-desktop')).toBe('opencodex-desktop')
    expect(workspaceLabel('')).toBe('No folder open')
  })

  it('matches a thread to the current workspace with slash tolerance', () => {
    expect(threadBelongsToWorkspace(thread('t1', '/Users/me/project/'), '/Users/me/project')).toBe(true)
    expect(threadBelongsToWorkspace(thread('t2', '/Users/me/other'), '/Users/me/project')).toBe(false)
  })

  it('filters threads to the current VS Code workspace', () => {
    expect(filterThreadsForWorkspace([
      thread('current', '/Users/me/project'),
      thread('other', '/Users/me/other')
    ], '/Users/me/project').map((item) => item.id)).toEqual(['current'])
  })

  it('keeps all threads when VS Code has no workspace folder', () => {
    const threads = [thread('a', '/a'), thread('b', '/b')]
    expect(filterThreadsForWorkspace(threads, '')).toEqual(threads)
  })
})
