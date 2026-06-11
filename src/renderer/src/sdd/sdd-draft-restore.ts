import type { WorkspaceFileReadResult, WorkspaceFileTarget } from '@shared/workspace-file'
import {
  forgetRememberedSddDraft,
  readRememberedSddDraft,
  readRememberedSddDraftContent,
  type SddDraftSaveStatus,
  type SddDraft
} from './sdd-draft-store'

export type RestoredSddDraft = {
  kind: 'restored'
  draft: SddDraft
  content: string
  lastSavedContent: string
  saveStatus: SddDraftSaveStatus
}

export type UnrestorableSddDraft =
  | { kind: 'missing' }
  | { kind: 'unreadable'; draft: SddDraft; message: string }

export type RestoreRememberedSddDraftResult = RestoredSddDraft | UnrestorableSddDraft

type RestoreRememberedSddDraftOptions = {
  workspaceRoot: string
  readWorkspaceFile: (options: WorkspaceFileTarget) => Promise<WorkspaceFileReadResult>
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function restoreRememberedSddDraft({
  workspaceRoot,
  readWorkspaceFile
}: RestoreRememberedSddDraftOptions): Promise<RestoreRememberedSddDraftResult> {
  const remembered = readRememberedSddDraft(workspaceRoot)
  if (!remembered) return { kind: 'missing' }
  const rememberedContent = readRememberedSddDraftContent(workspaceRoot)

  const result = await readWorkspaceFile({
    workspaceRoot: remembered.workspaceRoot,
    path: remembered.relativePath
  })
  if (!result.ok) {
    forgetRememberedSddDraft(remembered)
    return { kind: 'unreadable', draft: remembered, message: result.message }
  }

  const useRememberedContent =
    rememberedContent?.draftId === remembered.id &&
    rememberedContent.saveStatus !== 'saved' &&
    timestamp(rememberedContent.updatedAt) > timestamp(remembered.updatedAt)

  return {
    kind: 'restored',
    draft: { ...remembered, absolutePath: result.path },
    content: useRememberedContent ? rememberedContent.content : result.content,
    lastSavedContent: useRememberedContent ? rememberedContent.lastSavedContent : result.content,
    saveStatus: useRememberedContent ? rememberedContent.saveStatus : 'saved'
  }
}
