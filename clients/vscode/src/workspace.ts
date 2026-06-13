import type { VsCodeThread } from './client.js'

export function normalizeWorkspaceRoot(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
}

export function workspaceLabel(value?: string | null): string {
  const normalized = normalizeWorkspaceRoot(value)
  if (!normalized) return 'No folder open'
  const parts = normalized.split('/').filter(Boolean)
  return parts.at(-1) ?? normalized
}

export function threadBelongsToWorkspace(thread: Pick<VsCodeThread, 'workspaceRoot'>, workspaceRoot: string): boolean {
  const target = normalizeWorkspaceRoot(workspaceRoot)
  if (!target) return true
  return normalizeWorkspaceRoot(thread.workspaceRoot) === target
}

export function filterThreadsForWorkspace(threads: VsCodeThread[], workspaceRoot: string): VsCodeThread[] {
  const target = normalizeWorkspaceRoot(workspaceRoot)
  if (!target) return threads
  return threads.filter((thread) => threadBelongsToWorkspace(thread, target))
}
