/**
 * VS Code command registrations — command palette, context menus,
 * and keybindings for the OpenCodex extension.
 *
 * Thin adapter: command implementations call the protocol client or
 * trigger UI state changes. No business logic.
 */
import * as vscode from 'vscode'
import type { OpenCodexVsCodeClient } from './client.js'
import { gatherContext, listWorkspaceFiles } from './context.js'
import type { OpenCodexSidebarProvider } from './sidebar.js'
import type { OpenCodexDiffManager, VsCodeChangedFile } from './diff.js'

export function registerCommands(
  context: vscode.ExtensionContext,
  getClient: () => OpenCodexVsCodeClient | null,
  getSidebarProvider: () => OpenCodexSidebarProvider | null,
  getDiffManager: () => OpenCodexDiffManager | null,
  getWorkspaceRoot: () => string
): void {
  const c = context

  // ── New Thread ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.newThread', () => {
      getSidebarProvider()?.post({ command: 'createThread' })
    })
  )

  // ── Open Panel ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.openPanel', () => {
      void vscode.commands.executeCommand('opencodex.sidebar.focus')
    })
  )

  // ── Attach Active File ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.attachActiveFile', () => {
      const ctx = gatherContext()
      if (ctx.activeFile) {
        getSidebarProvider()?.attachContextFile(ctx.activeFile)
        void vscode.window.showInformationMessage(
          `Attached: ${ctx.activeFile.relativePath}`
        )
      }
    })
  )

  // ── Attach Selection ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.attachSelection', () => {
      const ctx = gatherContext()
      if (ctx.activeSelection) {
        getSidebarProvider()?.attachContextSelection(ctx.activeSelection)
        void vscode.window.showInformationMessage(
          `Attached selection L${ctx.activeSelection.startLine}-${ctx.activeSelection.endLine}`
        )
      } else {
        void vscode.window.showInformationMessage('No selection in active editor')
      }
    })
  )

  // ── Attach Terminal Output ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.attachTerminalOutput', () => {
      const terminal = vscode.window.activeTerminal
      if (!terminal) {
        void vscode.window.showInformationMessage('No active terminal')
        return
      }
      // VS Code API doesn't provide terminal content directly.
      // We show selection-based capture: ask the user to select in the terminal.
      void vscode.window.showInformationMessage(
        'Select text in the terminal, then run "Attach Selection" to include it as context.'
      )
    })
  )

  // ── @-Mention File Picker ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.pickFile', async () => {
      const workspaceRoot = getWorkspaceRoot()
      if (!workspaceRoot) {
        void vscode.window.showErrorMessage('Open a folder first')
        return
      }
      const files = await listWorkspaceFiles(workspaceRoot)
      const items = files.map((f) => ({
        label: f.label,
        description: f.language,
        detail: f.relativePath
      }))
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose a file to attach (@)',
        matchOnDescription: true,
        matchOnDetail: true
      })
      if (!picked) return
      // Read and attach the picked file
      try {
        const fileUri = vscode.Uri.joinPath(
          vscode.Uri.file(workspaceRoot),
          picked.detail
        )
        const content = await vscode.workspace.fs.readFile(fileUri)
        const text = new TextDecoder().decode(content)
        const fileEntry = files.find((f) => f.relativePath === picked.detail)
        getSidebarProvider()?.attachContextFile({
          path: fileUri.fsPath,
          relativePath: picked.detail,
          language: fileEntry?.language ?? 'plaintext',
          content: text
        })
        void vscode.window.showInformationMessage(`Attached: ${picked.detail}`)
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    })
  )

  // ── Approve Pending ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.approvePending', async () => {
      const client = getClient()
      if (!client) {
        void vscode.window.showErrorMessage('OpenCodex: not connected')
        return
      }
      const result = await client.listApprovals()
      if (!result.ok) {
        void vscode.window.showErrorMessage(`Failed: ${result.message}`)
        return
      }
      const pending = result.value.filter((a) => a.status === 'pending')
      if (pending.length === 0) {
        void vscode.window.showInformationMessage('No pending approvals')
        return
      }
      const picks = pending.map((a) => ({
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
      const respondResult = await client.respondApproval(picked.detail, action.value)
      if (respondResult.ok) {
        void vscode.window.showInformationMessage(`Approval ${action.value}ed`)
        getSidebarProvider()?.refresh()
      } else {
        void vscode.window.showErrorMessage(`Failed: ${respondResult.message}`)
      }
    })
  )

  // ── Diff Approve ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.diffApprove', async () => {
      const eventId = await vscode.window.showInputBox({
        prompt: 'Enter the change event ID to approve',
        placeHolder: 'change_123'
      })
      if (!eventId) return
      await getDiffManager()?.approveDiff(eventId)
    })
  )

  // ── Diff Revert ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.diffRevert', async () => {
      const eventId = await vscode.window.showInputBox({
        prompt: 'Enter the change event ID to revert',
        placeHolder: 'change_123'
      })
      if (!eventId) return
      await getDiffManager()?.revertDiff(eventId)
    })
  )

  // ── Health ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.health', async () => {
      const client = getClient()
      if (!client) {
        void vscode.window.showErrorMessage('OpenCodex: not connected')
        return
      }
      const result = await client.health()
      if (result.ok) {
        void vscode.window.showInformationMessage(
          `OpenCodex server is healthy (protocol v${result.value.protocolVersion})`
        )
      } else {
        void vscode.window.showErrorMessage(`Server unreachable: ${result.message}`)
      }
    })
  )

  // ── Show Threads (picker) ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.showThreads', async () => {
      const client = getClient()
      if (!client) {
        void vscode.window.showErrorMessage('OpenCodex: not connected')
        return
      }
      const result = await client.listThreads()
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
          getSidebarProvider()?.refresh()
        }
      }
    })
  )

  // ── Send Turn (command palette) ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.sendTurn', async () => {
      const client = getClient()
      if (!client) {
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
      // Gather context automatically for command-palette sends
      const ctx = gatherContext()
      const result = await client.sendTurn(threadId, prompt, 'agent', {
        context: ctx.activeFile && ctx.activeFile.content
          ? [{ type: 'file', path: ctx.activeFile.relativePath, content: ctx.activeFile.content }]
          : undefined
      })
      if (result.ok) {
        void vscode.window.showInformationMessage(`Turn ${result.value.id} sent`)
      } else {
        void vscode.window.showErrorMessage(`Failed: ${result.message}`)
      }
    })
  )

  // ── Explain Code ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.explainCode', async () => {
      await sendCodeAction('explain', getClient, getSidebarProvider, getWorkspaceRoot)
    })
  )

  // ── Fix Code ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.fixCode', async () => {
      await sendCodeAction('fix', getClient, getSidebarProvider, getWorkspaceRoot)
    })
  )

  // ── Improve Code ──
  c.subscriptions.push(
    vscode.commands.registerCommand('opencodex.improveCode', async () => {
      await sendCodeAction('improve', getClient, getSidebarProvider, getWorkspaceRoot)
    })
  )
}

async function sendCodeAction(
  action: string,
  getClient: () => OpenCodexVsCodeClient | null,
  getSidebarProvider: () => OpenCodexSidebarProvider | null,
  getWorkspaceRoot: () => string
): Promise<void> {
  const client = getClient()
  if (!client) {
    void vscode.window.showErrorMessage('OpenCodex: not connected')
    return
  }
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    void vscode.window.showInformationMessage('Open a file first')
    return
  }
  const doc = editor.document
  let code: string
  let label: string
  if (!editor.selection.isEmpty) {
    code = doc.getText(editor.selection)
    label = `selected code (L${editor.selection.start.line + 1}-${editor.selection.end.line + 1})`
  } else {
    code = doc.getText()
    label = doc.fileName.split('/').pop() ?? doc.fileName
  }
  const workspaceRoot = getWorkspaceRoot()
  const prompt = `${action} the following ${doc.languageId} code:\n\`\`\`${doc.languageId}\n${code}\n\`\`\``
  const result = await client.createThread({
    workspaceRoot,
    title: `${action}: ${label}`,
    model: 'auto',
    mode: 'agent'
  })
  if (!result.ok) {
    void vscode.window.showErrorMessage(`Failed to create thread: ${result.message}`)
    return
  }
  const turnResult = await client.sendTurn(result.value.id, prompt)
  if (turnResult.ok) {
    void vscode.window.showInformationMessage(`${action} task started in thread ${result.value.title}`)
    getSidebarProvider()?.refresh()
  } else {
    void vscode.window.showErrorMessage(`Failed: ${turnResult.message}`)
  }
}
