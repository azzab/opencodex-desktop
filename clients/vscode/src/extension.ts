/**
 * OpenCodex VS Code extension — thin adapter over the app-server protocol.
 * No business logic. Calls Kun via HTTP/SSE.
 */
import * as vscode from 'vscode'
import { OpenCodexVsCodeClient } from './client.js'
import { OpenCodexSidebarProvider } from './sidebar.js'
import { OpenCodexStatusBar } from './status.js'

let statusBar: OpenCodexStatusBar | undefined
let client: OpenCodexVsCodeClient | null = null

function buildClient(): OpenCodexVsCodeClient | null {
  const config = vscode.workspace.getConfiguration('opencodex')
  const host = String(config.get('host') ?? '127.0.0.1')
  const port = Number(config.get('port') ?? 18999)
  const token = String(config.get('token') ?? '')
  return new OpenCodexVsCodeClient(host, port, token)
}

function getClient(): OpenCodexVsCodeClient | null {
  return client
}

export function activate(context: vscode.ExtensionContext): void {
  client = buildClient()

  // Sidebar webview
  const sidebarProvider = new OpenCodexSidebarProvider(getClient)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('opencodex.sidebar', sidebarProvider)
  )

  // Status bar
  statusBar = new OpenCodexStatusBar(getClient)
  statusBar.startPolling()
  context.subscriptions.push(statusBar)

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('opencodex.showThreads', async () => {
      const c = getClient()
      if (!c) {
        void vscode.window.showErrorMessage('OpenCodex: not connected')
        return
      }
      const result = await c.listThreads()
      if (result.ok) {
        const items = result.value.map((t) => ({
          label: t.title,
          description: `${t.status} · ${t.mode}`,
          detail: t.id
        }))
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a thread'
        })
        if (picked) {
          sidebarProvider.refresh()
        }
      }
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('opencodex.sendTurn', async () => {
      const c = getClient()
      if (!c) {
        void vscode.window.showErrorMessage('OpenCodex: not connected')
        return
      }
      const threadId = await vscode.window.showInputBox({
        placeHolder: 'Thread ID',
        prompt: 'Enter the thread ID to send a turn to'
      })
      if (!threadId) return
      const prompt = await vscode.window.showInputBox({
        placeHolder: 'Prompt',
        prompt: 'Enter your prompt'
      })
      if (!prompt) return
      const result = await c.sendTurn(threadId, prompt)
      if (result.ok) {
        void vscode.window.showInformationMessage(`Turn ${result.value.id} sent`)
      } else {
        void vscode.window.showErrorMessage(`Failed: ${result.message}`)
      }
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('opencodex.approveAction', async () => {
      const c = getClient()
      if (!c) {
        void vscode.window.showErrorMessage('OpenCodex: not connected')
        return
      }
      const result = await c.listApprovals()
      if (!result.ok) {
        void vscode.window.showErrorMessage(`Failed: ${result.message}`)
        return
      }
      const picks = result.value.map((a) => ({
        label: `${a.toolName} — ${a.summary}`,
        description: a.status,
        detail: a.id
      }))
      const picked = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select approval to respond to'
      })
      if (!picked) return
      const action = await vscode.window.showQuickPick(
        [
          { label: 'Allow', value: 'allow' as const },
          { label: 'Deny', value: 'deny' as const }
        ],
        { placeHolder: 'Action' }
      )
      if (!action) return
      const respondResult = await c.respondApproval(picked.detail, action.value)
      if (respondResult.ok) {
        void vscode.window.showInformationMessage(`Approval ${action.value}ed`)
      } else {
        void vscode.window.showErrorMessage(`Failed: ${respondResult.message}`)
      }
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('opencodex.health', async () => {
      const c = getClient()
      if (!c) {
        void vscode.window.showErrorMessage('OpenCodex: not connected')
        return
      }
      const result = await c.health()
      if (result.ok) {
        void vscode.window.showInformationMessage(
          `OpenCodex server is healthy (protocol v${result.value.protocolVersion})`
        )
      } else {
        void vscode.window.showErrorMessage(`Server unreachable: ${result.message}`)
      }
    })
  )

  // Watch config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('opencodex')) {
        client = buildClient()
        statusBar?.startPolling()
      }
    })
  )
}

export function deactivate(): void {
  statusBar?.dispose()
  client = null
}
