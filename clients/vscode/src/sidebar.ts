/**
 * Webview sidebar provider — Cline-class chat panel with:
 *   - Streamed markdown + code blocks (copy / insert-at-cursor)
 *   - Collapsible tool-call steps
 *   - Inline approvals with plan/execute visibility (REMOTE for non-local)
 *   - Context chips with active file, selection, @-mention picker
 *   - Workspace-aware thread list + new-thread binding
 *
 * Thin bridge between VS Code and Kun protocol. No business logic.
 *
 * HTML and JavaScript loaded from webview/ at import time so the
 * extension ships as compiled JS with the webview assets inlined.
 */
import * as vscode from 'vscode'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OpenCodexVsCodeClient } from './client.js'
import { filterThreadsForWorkspace, workspaceLabel } from './workspace.js'
import { gatherContext } from './context.js'
import { parseSseEvent } from './sse-parser.js'
import type { OpenCodexDiffManager, VsCodeChangedFile } from './diff.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load webview assets at import time
let _htmlCache: string | null = null
let _jsCache: string | null = null

function loadWebviewAssets(): { html: string; js: string } {
  if (!_htmlCache) {
    _htmlCache = readFileSync(join(__dirname, '..', 'webview', 'sidebar.html'), 'utf8')
  }
  if (!_jsCache) {
    _jsCache = readFileSync(join(__dirname, '..', 'webview', 'sidebar.js'), 'utf8')
  }
  return { html: _htmlCache, js: _jsCache }
}

export { parseSseEvent } from './sse-parser.js'

export interface ContextAttachmentData {
  type: 'file' | 'selection' | 'terminal'
  path: string
  relativePath: string
  label: string
  content: string
  language?: string
  startLine?: number
  endLine?: number
}

export class OpenCodexSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView
  private client: OpenCodexVsCodeClient | null = null
  private activeStreamAbort: AbortController | null = null
  private diffManager: OpenCodexDiffManager | null = null
  private contextAttachments: ContextAttachmentData[] = []

  constructor(
    private readonly getClient: () => OpenCodexVsCodeClient | null,
    private readonly getWorkspaceRoot: () => string,
    private readonly getDiffManager?: () => OpenCodexDiffManager | null
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(join(__dirname, '..', 'webview'))
      ]
    }
    webviewView.webview.html = this.getHtmlContent(
      webviewView.webview
    )
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      await this.handleMessage(msg)
    })
  }

  /** External attach: add a file to the context chips. */
  attachContextFile(file: {
    path: string
    relativePath: string
    language: string
    content: string
  }): void {
    this.contextAttachments.push({
      type: 'file',
      path: file.path,
      relativePath: file.relativePath,
      label: file.relativePath,
      content: file.content,
      language: file.language
    })
    this.pushContextChips()
  }

  /** External attach: add a selection to the context chips. */
  attachContextSelection(sel: {
    path: string
    relativePath: string
    startLine: number
    endLine: number
    text: string
    language: string
  }): void {
    this.contextAttachments.push({
      type: 'selection',
      path: sel.path,
      relativePath: sel.relativePath,
      label: `${sel.relativePath}:L${sel.startLine}-${sel.endLine}`,
      content: sel.text,
      language: sel.language,
      startLine: sel.startLine,
      endLine: sel.endLine
    })
    this.pushContextChips()
  }

  /** Allow diff manager to be set after construction. */
  setDiffManager(dm: OpenCodexDiffManager): void {
    this.diffManager = dm
  }

  refresh(): void {
    this.postWorkspace()
    const client = this.getClient()
    if (client) {
      void this.refreshThreads(client)
      void this.refreshApprovals(client)
    }
  }

  /** Public post helper for command modules. */
  post(message: Record<string, unknown>): void {
    this._view?.webview.postMessage(message)
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    const client = this.getClient()
    if (!client && msg.command !== 'ready' && msg.command !== 'refreshContext') {
      this.post({ command: 'error', message: 'Server not connected. Check OpenCodex settings.' })
      return
    }

    switch (msg.command) {
      case 'ready':
        this.postWorkspace()
        if (client) {
          void this.refreshThreads(client)
          void this.refreshApprovals(client)
        }
        this.pushContextChips()
        break

      case 'refreshContext': {
        const ctx = gatherContext()
        this.contextAttachments = []
        if (ctx.activeFile) {
          this.contextAttachments.push({
            type: 'file',
            path: ctx.activeFile.path,
            relativePath: ctx.activeFile.relativePath,
            label: ctx.activeFile.relativePath,
            content: ctx.activeFile.content,
            language: ctx.activeFile.language
          })
        }
        if (ctx.activeSelection) {
          this.contextAttachments.push({
            type: 'selection',
            path: ctx.activeSelection.path,
            relativePath: ctx.activeSelection.relativePath,
            label: `${ctx.activeSelection.relativePath}:L${ctx.activeSelection.startLine}-${ctx.activeSelection.endLine}`,
            content: ctx.activeSelection.text,
            language: ctx.activeSelection.language,
            startLine: ctx.activeSelection.startLine,
            endLine: ctx.activeSelection.endLine
          })
        }
        this.pushContextChips()
        break
      }

      case 'selectThread': {
        const threadId = String(msg.threadId ?? '')
        if (client) {
          await this.loadThread(client, threadId)
        }
        break
      }

      case 'createThread': {
        if (client) {
          await this.createThread(client)
        }
        break
      }

      case 'sendTurn': {
        const threadId = String(msg.threadId ?? '')
        const prompt = String(msg.prompt ?? '')
        const mode = String(msg.mode ?? 'agent') as 'agent' | 'plan'
        if (client) {
          await this.sendTurn(client, threadId, prompt, mode)
        }
        break
      }

      case 'respondApproval': {
        const approvalId = String(msg.approvalId ?? '')
        const action = String(msg.action ?? 'allow')
        if (client) {
          await this.respondApproval(client, approvalId, action as 'allow' | 'deny')
        }
        break
      }

      case 'showDiff': {
        if (this.diffManager) {
          const changedFile: VsCodeChangedFile = {
            path: String(msg.path ?? ''),
            workspaceRoot: this.getWorkspaceRoot(),
            original: String(msg.original ?? ''),
            proposed: String(msg.proposed ?? ''),
            eventId: String(msg.eventId ?? ''),
            threadId: String(msg.threadId ?? ''),
            turnId: String(msg.turnId ?? ''),
            toolName: String(msg.toolName ?? 'write_file'),
            approved: false
          }
          void this.diffManager.showDiff(changedFile)
        }
        break
      }

      case 'approveDiff': {
        const eventId = String(msg.eventId ?? '')
        await this.diffManager?.approveDiff(eventId)
        break
      }

      case 'revertDiff': {
        const eventId = String(msg.eventId ?? '')
        await this.diffManager?.revertDiff(eventId)
        break
      }

      case 'insertAtCursor': {
        const text = String(msg.text ?? '')
        await this.insertAtCursor(text)
        break
      }
    }
  }

  private async insertAtCursor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      void vscode.window.showInformationMessage('No active editor to insert into')
      return
    }
    await editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, text)
    })
    void vscode.window.showInformationMessage('Code inserted at cursor')
  }

  private pushContextChips(): void {
    this.post({
      command: 'contextChips',
      chips: this.contextAttachments.map((c) => ({
        type: c.type,
        label: c.label,
        relativePath: c.relativePath,
        language: c.language,
        startLine: c.startLine,
        endLine: c.endLine
      }))
    })
  }

  private async refreshThreads(client: OpenCodexVsCodeClient): Promise<void> {
    const result = await client.listThreads()
    if (result.ok) {
      const workspaceRoot = this.getWorkspaceRoot()
      this.post({
        command: 'threads',
        threads: filterThreadsForWorkspace(result.value, workspaceRoot),
        workspaceRoot,
        workspaceLabel: workspaceLabel(workspaceRoot)
      })
    }
  }

  private async createThread(client: OpenCodexVsCodeClient): Promise<void> {
    const workspaceRoot = this.getWorkspaceRoot()
    if (!workspaceRoot) {
      this.post({
        command: 'error',
        message: 'Open a project folder in VS Code before creating an OpenCodex thread.'
      })
      return
    }
    const result = await client.createThread({
      workspaceRoot,
      title: workspaceLabel(workspaceRoot),
      model: 'auto',
      mode: 'agent'
    })
    if (!result.ok) {
      this.post({ command: 'error', message: result.message })
      return
    }
    this.post({ command: 'threadCreated', thread: result.value })
    await this.refreshThreads(client)
  }

  private async refreshApprovals(client: OpenCodexVsCodeClient): Promise<void> {
    const result = await client.listApprovals()
    if (result.ok) {
      this.post({ command: 'approvals', approvals: result.value })
    }
  }

  private async loadThread(
    client: OpenCodexVsCodeClient,
    threadId: string
  ): Promise<void> {
    const result = await client.getThread(threadId)
    if (result.ok) {
      this.post({ command: 'threadDetail', thread: result.value })
    }
  }

  private async sendTurn(
    client: OpenCodexVsCodeClient,
    threadId: string,
    prompt: string,
    mode: 'agent' | 'plan' = 'agent'
  ): Promise<void> {
    this.activeStreamAbort?.abort()
    this.activeStreamAbort = new AbortController()
    const signal = this.activeStreamAbort.signal

    const contextItems = this.contextAttachments.map((c) => ({
      type: c.type,
      path: c.relativePath,
      content: c.content,
      language: c.language,
      startLine: c.startLine,
      endLine: c.endLine
    }))

    const result = await client.sendTurn(threadId, prompt, mode, {
      context: contextItems.length > 0 ? contextItems : undefined
    })
    if (!result.ok) {
      this.post({ command: 'error', message: result.message })
      return
    }

    this.contextAttachments = []

    this.post({
      command: 'transcript',
      threadId,
      items: [
        { kind: 'message', text: `Turn ${result.value.id} started`, role: 'system' }
      ]
    })

    const streamResult = await client.streamEvents(threadId)
    if (!streamResult.ok) {
      this.post({
        command: 'error',
        message: `Stream unavailable: ${streamResult.message}`
      })
      return
    }

    const reader = streamResult.value.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        if (signal.aborted) {
          reader.cancel()
          break
        }
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const trimmed = part.trim()
          if (!trimmed) continue
          const sseEvent = parseSseEvent(trimmed)
          if (sseEvent) {
            this.post({ command: 'event', ...sseEvent })
          }
        }
      }
      if (buffer.trim() && !signal.aborted) {
        const sseEvent = parseSseEvent(buffer.trim())
        if (sseEvent) {
          this.post({ command: 'event', ...sseEvent })
        }
      }
    } catch {
      if (!signal.aborted) {
        this.post({ command: 'error', message: 'Stream disconnected' })
      }
    } finally {
      if (this.activeStreamAbort?.signal === signal) {
        this.activeStreamAbort = null
      }
      try {
        reader.releaseLock()
      } catch {
        /* already released */
      }
    }

    void this.refreshApprovals(client)
  }

  private async respondApproval(
    client: OpenCodexVsCodeClient,
    approvalId: string,
    action: 'allow' | 'deny'
  ): Promise<void> {
    const result = await client.respondApproval(approvalId, action)
    if (result.ok) {
      void this.refreshApprovals(client)
    } else {
      this.post({ command: 'error', message: result.message })
    }
  }

  private postWorkspace(): void {
    const workspaceRoot = this.getWorkspaceRoot()
    this.post({
      command: 'workspace',
      workspaceRoot,
      workspaceLabel: workspaceLabel(workspaceRoot)
    })
  }

  /* ── Webview HTML assembly ── */
  private getHtmlContent(webview: vscode.Webview): string {
    const { html, js } = loadWebviewAssets()

    // Get URI for the JS file as a webview resource
    const jsUri = webview.asWebviewUri(
      vscode.Uri.file(join(__dirname, '..', 'webview', 'sidebar.js'))
    )

    // Inject the JS URI into the HTML
    return html.replace(
      '<script src="sidebar.js"></script>',
      `<script src="${jsUri.toString()}"></script>`
    )
  }
}
