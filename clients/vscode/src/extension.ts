/**
 * OpenCodex VS Code extension — Cline-class IDE agent surface.
 *
 * Thin adapter over the app-server protocol. No business logic.
 * Renders a persistent chat panel webview with streamed markdown,
 * collapsible tool steps, inline approvals, context attachments,
 * native diff views, and status bar model/turn display.
 */
import * as vscode from 'vscode'
import { OpenCodexVsCodeClient } from './client.js'
import { OpenCodexSidebarProvider } from './sidebar.js'
import { OpenCodexStatusBar } from './status.js'
import { OpenCodexDiffManager } from './diff.js'
import { registerCommands } from './commands.js'

let statusBar: OpenCodexStatusBar | undefined
let client: OpenCodexVsCodeClient | null = null
let sidebarProvider: OpenCodexSidebarProvider | null = null
let diffManager: OpenCodexDiffManager | null = null

function buildClient(): OpenCodexVsCodeClient | null {
  const config = vscode.workspace.getConfiguration('opencodex')
  const host = String(config.get('host') ?? '127.0.0.1')
  const port = Number(config.get('port') ?? 18999)
  const token = String(config.get('token') ?? '')
  return new OpenCodexVsCodeClient(host, port, token)
}

export function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
}

export function activate(context: vscode.ExtensionContext): void {
  client = buildClient()

  // Diff manager for native VS Code diff views
  diffManager = new OpenCodexDiffManager(() => client)
  context.subscriptions.push(diffManager)

  // Sidebar webview (chat panel)
  sidebarProvider = new OpenCodexSidebarProvider(
    () => client,
    getWorkspaceRoot,
    () => diffManager
  )
  sidebarProvider.setDiffManager(diffManager)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('opencodex.sidebar', sidebarProvider)
  )

  // Status bar with model/turn display
  statusBar = new OpenCodexStatusBar(() => client)
  statusBar.startPolling()
  context.subscriptions.push(statusBar)

  // All commands
  registerCommands(
    context,
    () => client,
    () => sidebarProvider,
    () => diffManager,
    getWorkspaceRoot
  )

  // Watch config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('opencodex')) {
        client = buildClient()
        statusBar?.startPolling()
        sidebarProvider?.refresh()
      }
    })
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      sidebarProvider?.refresh()
    })
  )

  // Update context chips when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      sidebarProvider?.refresh()
    })
  )

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      // Auto-update context chips on selection change
      sidebarProvider?.post({ command: 'refreshContext' })
    })
  )
}

export function deactivate(): void {
  statusBar?.dispose()
  diffManager?.dispose()
  client = null
  sidebarProvider = null
  diffManager = null
}
