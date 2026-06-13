/**
 * Context attachment — gathers active file, editor selection, terminal
 * output, and workspace files so the user can attach context to a turn.
 *
 * Thin adapter: reads VS Code editor state, returns structured context
 * that gets serialized into the protocol request. No agent logic.
 */
import * as vscode from 'vscode'

export interface AttachedContext {
  /** Active editor file with full content */
  activeFile: {
    path: string
    relativePath: string
    language: string
    content: string
  } | null
  /** Current selection in the active editor */
  activeSelection: {
    path: string
    relativePath: string
    startLine: number
    endLine: number
    text: string
    language: string
  } | null
  /** Manually attached files */
  attachedFiles: Array<{
    path: string
    relativePath: string
    language: string
    content: string
  }>
  /** Terminal output (last N lines, redacted) */
  terminalOutput: string | null
}

export interface WorkspaceFileEntry {
  label: string
  relativePath: string
  absolutePath: string
  isDirectory: boolean
  language: string
}

/**
 * Gather context from the active VS Code editor.
 */
export function gatherContext(): AttachedContext {
  const editor = vscode.window.activeTextEditor

  let activeFile: AttachedContext['activeFile'] = null
  let activeSelection: AttachedContext['activeSelection'] = null

  if (editor) {
    const doc = editor.document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri)
    const wsRoot = workspaceFolder?.uri.fsPath ?? ''
    const absPath = doc.uri.fsPath
    const relativePath = wsRoot
      ? absPath.startsWith(wsRoot) ? absPath.slice(wsRoot.length).replace(/^\//, '') : absPath
      : absPath

    activeFile = {
      path: absPath,
      relativePath,
      language: doc.languageId,
      content: doc.getText()
    }

    if (!editor.selection.isEmpty) {
      const sel = editor.selection
      const selectedText = doc.getText(editor.selection)
      activeSelection = {
        path: absPath,
        relativePath,
        startLine: sel.start.line + 1,
        endLine: sel.end.line + 1,
        text: selectedText,
        language: doc.languageId
      }
    }
  }

  return {
    activeFile,
    activeSelection,
    attachedFiles: [],
    terminalOutput: null
  }
}

/**
 * Serialize context for the protocol — paths + content for Kun.
 */
export function contextToProtocol(ctx: AttachedContext): Array<{
  type: 'file' | 'selection' | 'terminal'
  path?: string
  relativePath?: string
  language?: string
  content: string
  startLine?: number
  endLine?: number
}> {
  const items: Array<{
    type: 'file' | 'selection' | 'terminal'
    path?: string
    relativePath?: string
    language?: string
    content: string
    startLine?: number
    endLine?: number
  }> = []

  if (ctx.activeFile) {
    items.push({
      type: 'file',
      path: ctx.activeFile.path,
      relativePath: ctx.activeFile.relativePath,
      language: ctx.activeFile.language,
      content: ctx.activeFile.content
    })
  }

  if (ctx.activeSelection) {
    items.push({
      type: 'selection',
      path: ctx.activeSelection.path,
      relativePath: ctx.activeSelection.relativePath,
      language: ctx.activeSelection.language,
      content: ctx.activeSelection.text,
      startLine: ctx.activeSelection.startLine,
      endLine: ctx.activeSelection.endLine
    })
  }

  for (const file of ctx.attachedFiles) {
    items.push({
      type: 'file',
      path: file.path,
      relativePath: file.relativePath,
      language: file.language,
      content: file.content
    })
  }

  if (ctx.terminalOutput) {
    items.push({
      type: 'terminal',
      content: ctx.terminalOutput
    })
  }

  return items
}

/**
 * List workspace files for @-mention file picker.
 */
export async function listWorkspaceFiles(
  workspaceRoot: string,
  query: string = ''
): Promise<WorkspaceFileEntry[]> {
  if (!workspaceRoot) return []

  const rootUri = vscode.Uri.file(workspaceRoot)
  const pattern = query ? `**/*${query}*` : '**/*'
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(rootUri, pattern),
    '**/node_modules/**',
    50 // max results
  )

  return files.map((uri) => {
    const absPath = uri.fsPath
    const relativePath = absPath.startsWith(workspaceRoot)
      ? absPath.slice(workspaceRoot.length).replace(/^\//, '')
      : absPath
    return {
      label: relativePath,
      relativePath,
      absolutePath: absPath,
      isDirectory: false,
      language: getLanguageFromPath(relativePath)
    }
  })
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'shellscript',
    bash: 'shellscript',
    sql: 'sql',
    graphql: 'graphql',
    svg: 'xml',
    xml: 'xml',
    proto: 'proto'
  }
  return map[ext] ?? 'plaintext'
}
