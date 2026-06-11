import { create } from 'zustand'
import { buildSddDraftRelativePath, normalizeSddRelativePath } from '@shared/sdd'
import { browserStorage } from '../lib/browser-storage'

export type SddDraftSaveStatus = 'saved' | 'dirty' | 'saving' | 'error'
export type SddDraftOperationStatus = 'idle' | 'upgrading' | 'error'

export type SddDraft = {
  id: string
  workspaceRoot: string
  relativePath: string
  absolutePath?: string
  createdAt: string
  updatedAt: string
}

type PersistedSddDraftRegistry = {
  version: 1
  activeByWorkspace: Record<string, string>
  drafts: Record<string, SddDraft>
  contentByDraft: Record<string, SddDraftContentSnapshot>
}

export type SddDraftContentSnapshot = {
  draftId: string
  workspaceRoot: string
  content: string
  lastSavedContent: string
  saveStatus: SddDraftSaveStatus
  updatedAt: string
}

type SetActiveSddDraftOptions = {
  lastSavedContent?: string
  saveStatus?: SddDraftSaveStatus
}

export type SddDraftState = {
  activeDraft: SddDraft | null
  content: string
  lastSavedContent: string
  saveStatus: SddDraftSaveStatus
  operationStatus: SddDraftOperationStatus
  error: string | null
  setActiveDraft: (draft: SddDraft, content: string, options?: SetActiveSddDraftOptions) => void
  setContent: (content: string) => void
  setSaveStatus: (status: SddDraftSaveStatus, error?: string | null) => void
  markSaved: (content: string) => void
  setOperationStatus: (status: SddDraftOperationStatus, error?: string | null) => void
  clearActiveDraft: () => void
}

const SDD_DRAFT_REGISTRY_STORAGE_KEY = 'opencodex.sdd.draft.registry.v1'

function normalizeWorkspaceRoot(value: string | undefined | null): string {
  return (value ?? '').trim().replaceAll('\\', '/').replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function preserveText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeSaveStatus(value: unknown): SddDraftSaveStatus | null {
  return value === 'saved' || value === 'dirty' || value === 'saving' || value === 'error'
    ? value
    : null
}

function draftId(workspaceRoot: string, relativePath: string): string {
  return `${normalizeWorkspaceRoot(workspaceRoot)}:${normalizeSddRelativePath(relativePath)}`
}

function normalizeDraft(raw: unknown, fallbackId = ''): SddDraft | null {
  if (!isRecord(raw)) return null
  const id = normalizeText(raw.id) || normalizeText(fallbackId)
  const workspaceRoot = normalizeWorkspaceRoot(normalizeText(raw.workspaceRoot))
  const relativePath = normalizeSddRelativePath(normalizeText(raw.relativePath))
  if (!id || !workspaceRoot || !relativePath) return null
  const absolutePath = normalizeText(raw.absolutePath)
  const createdAt = normalizeText(raw.createdAt) || new Date(0).toISOString()
  const updatedAt = normalizeText(raw.updatedAt) || createdAt
  return {
    id,
    workspaceRoot,
    relativePath,
    ...(absolutePath ? { absolutePath } : {}),
    createdAt,
    updatedAt
  }
}

function normalizeDraftContentSnapshot(raw: unknown, fallbackDraft?: SddDraft): SddDraftContentSnapshot | null {
  if (!isRecord(raw)) return null
  const draftId = normalizeText(raw.draftId) || fallbackDraft?.id || ''
  const workspaceRoot = normalizeWorkspaceRoot(normalizeText(raw.workspaceRoot) || fallbackDraft?.workspaceRoot)
  if (!draftId || !workspaceRoot) return null
  const content = preserveText(raw.content)
  const lastSavedContent = typeof raw.lastSavedContent === 'string' ? raw.lastSavedContent : content
  const saveStatus = normalizeSaveStatus(raw.saveStatus) ?? 'saved'
  const updatedAt = normalizeText(raw.updatedAt) || fallbackDraft?.updatedAt || new Date(0).toISOString()
  return {
    draftId,
    workspaceRoot,
    content,
    lastSavedContent,
    saveStatus,
    updatedAt
  }
}

function emptyRegistry(): PersistedSddDraftRegistry {
  return { version: 1, activeByWorkspace: {}, drafts: {}, contentByDraft: {} }
}

function readRegistry(storage = browserStorage()): PersistedSddDraftRegistry {
  if (!storage) return emptyRegistry()
  try {
    const raw = storage.getItem(SDD_DRAFT_REGISTRY_STORAGE_KEY)
    if (!raw) return emptyRegistry()
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return emptyRegistry()
    const drafts: Record<string, SddDraft> = {}
    if (isRecord(parsed.drafts)) {
      for (const [id, value] of Object.entries(parsed.drafts)) {
        const draft = normalizeDraft(value, id)
        if (draft) drafts[draft.id] = draft
      }
    }
    const activeByWorkspace: Record<string, string> = {}
    if (isRecord(parsed.activeByWorkspace)) {
      for (const [workspace, value] of Object.entries(parsed.activeByWorkspace)) {
        const normalizedWorkspace = normalizeWorkspaceRoot(workspace)
        const activeId = normalizeText(value)
        const draft = drafts[activeId]
        if (normalizedWorkspace && draft && normalizeWorkspaceRoot(draft.workspaceRoot) === normalizedWorkspace) {
          activeByWorkspace[normalizedWorkspace] = draft.id
        }
      }
    }
    const contentByDraft: Record<string, SddDraftContentSnapshot> = {}
    if (isRecord(parsed.contentByDraft)) {
      for (const [id, value] of Object.entries(parsed.contentByDraft)) {
        const draft = drafts[id]
        const snapshot = normalizeDraftContentSnapshot(value, draft)
        if (snapshot && draft && normalizeWorkspaceRoot(draft.workspaceRoot) === snapshot.workspaceRoot) {
          contentByDraft[snapshot.draftId] = snapshot
        }
      }
    }
    return { version: 1, activeByWorkspace, drafts, contentByDraft }
  } catch {
    return emptyRegistry()
  }
}

function writeRegistry(registry: PersistedSddDraftRegistry, storage = browserStorage()): void {
  if (!storage) return
  try {
    storage.setItem(SDD_DRAFT_REGISTRY_STORAGE_KEY, JSON.stringify(registry))
  } catch {
    /* ignore storage failures */
  }
}

export function createSddDraft(options: {
  id: string
  workspaceRoot: string
  absolutePath?: string
  now?: number
}): SddDraft {
  const now = new Date(options.now ?? Date.now()).toISOString()
  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot)
  const relativePath = buildSddDraftRelativePath(options.id)
  return {
    id: draftId(workspaceRoot, relativePath),
    workspaceRoot,
    relativePath,
    ...(options.absolutePath ? { absolutePath: options.absolutePath } : {}),
    createdAt: now,
    updatedAt: now
  }
}

export function rememberSddDraft(draft: SddDraft): void {
  const normalized = normalizeDraft(draft)
  if (!normalized) return
  const registry = readRegistry()
  const workspace = normalizeWorkspaceRoot(normalized.workspaceRoot)
  registry.drafts[normalized.id] = normalized
  if (workspace) registry.activeByWorkspace[workspace] = normalized.id
  writeRegistry(registry)
}

function rememberSddDraftContent(
  draft: SddDraft,
  snapshot: Pick<SddDraftContentSnapshot, 'content' | 'lastSavedContent' | 'saveStatus'> & { updatedAt?: string }
): void {
  const normalized = normalizeDraft(draft)
  if (!normalized) return
  const registry = readRegistry()
  const workspace = normalizeWorkspaceRoot(normalized.workspaceRoot)
  registry.drafts[normalized.id] = normalized
  if (workspace) registry.activeByWorkspace[workspace] = normalized.id
  registry.contentByDraft[normalized.id] = {
    draftId: normalized.id,
    workspaceRoot: workspace,
    content: snapshot.content,
    lastSavedContent: snapshot.lastSavedContent,
    saveStatus: snapshot.saveStatus,
    updatedAt: snapshot.updatedAt ?? new Date().toISOString()
  }
  writeRegistry(registry)
}

export function readRememberedSddDraft(workspaceRoot: string): SddDraft | null {
  const registry = readRegistry()
  const workspace = normalizeWorkspaceRoot(workspaceRoot)
  const id = registry.activeByWorkspace[workspace]
  const draft = registry.drafts[id ?? ''] ?? null
  return draft && normalizeWorkspaceRoot(draft.workspaceRoot) === workspace ? draft : null
}

export function readRememberedSddDraftContent(workspaceRoot: string): SddDraftContentSnapshot | null {
  const registry = readRegistry()
  const workspace = normalizeWorkspaceRoot(workspaceRoot)
  const id = registry.activeByWorkspace[workspace]
  const draft = registry.drafts[id ?? '']
  const snapshot = registry.contentByDraft[id ?? '']
  if (!draft || !snapshot) return null
  return normalizeWorkspaceRoot(draft.workspaceRoot) === workspace && snapshot.workspaceRoot === workspace
    ? snapshot
    : null
}

export function forgetRememberedSddDraft(draft: Pick<SddDraft, 'id' | 'workspaceRoot'>): void {
  const normalizedId = normalizeText(draft.id)
  if (!normalizedId) return
  const registry = readRegistry()
  delete registry.drafts[normalizedId]
  delete registry.contentByDraft[normalizedId]
  for (const [key, activeId] of Object.entries(registry.activeByWorkspace)) {
    if (activeId === normalizedId) {
      delete registry.activeByWorkspace[key]
    }
  }
  writeRegistry(registry)
}

export const useSddDraftStore = create<SddDraftState>((set) => ({
  activeDraft: null,
  content: '',
  lastSavedContent: '',
  saveStatus: 'saved',
  operationStatus: 'idle',
  error: null,

  setActiveDraft: (draft, content, options = {}) => {
    const lastSavedContent = typeof options.lastSavedContent === 'string' ? options.lastSavedContent : content
    const saveStatus = normalizeSaveStatus(options.saveStatus) ?? 'saved'
    rememberSddDraft(draft)
    rememberSddDraftContent(draft, { content, lastSavedContent, saveStatus })
    set({
      activeDraft: draft,
      content,
      lastSavedContent,
      saveStatus,
      operationStatus: 'idle',
      error: null
    })
  },

  setContent: (content) =>
    set((state) => {
      const saveStatus = content === state.lastSavedContent ? 'saved' : 'dirty'
      if (state.activeDraft) {
        rememberSddDraftContent(state.activeDraft, {
          content,
          lastSavedContent: state.lastSavedContent,
          saveStatus
        })
      }
      return {
        content,
        saveStatus,
        error: state.saveStatus === 'error' ? null : state.error
      }
    }),

  setSaveStatus: (status, error = null) => set({ saveStatus: status, error }),

  markSaved: (content) =>
    set((state) => {
      const updatedAt = new Date().toISOString()
      const activeDraft = state.activeDraft
        ? { ...state.activeDraft, updatedAt }
        : state.activeDraft
      if (activeDraft) {
        rememberSddDraft(activeDraft)
        rememberSddDraftContent(activeDraft, {
          content,
          lastSavedContent: content,
          saveStatus: 'saved',
          updatedAt
        })
      }
      return {
        activeDraft,
        content,
        lastSavedContent: content,
        saveStatus: 'saved',
        error: state.operationStatus === 'error' ? state.error : null
      }
    }),

  setOperationStatus: (status, error = null) => set({ operationStatus: status, error }),

  clearActiveDraft: () =>
    set({
      activeDraft: null,
      content: '',
      lastSavedContent: '',
      saveStatus: 'saved',
      operationStatus: 'idle',
      error: null
    })
}))
