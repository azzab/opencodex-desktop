/**
 * Diff view manager — routes changed-file events from the Kun desktop
 * into native VS Code diff views with approve/revert actions.
 *
 * Thin adapter: no business logic, no file writes without desktop approval.
 */
import * as vscode from 'vscode'
import type { OpenCodexVsCodeClient } from './client.js'

export interface VsCodeChangedFile {
  /** Relative path within the workspace */
  path: string
  /** Absolute workspace root */
  workspaceRoot: string
  /** Original content (before change) */
  original: string
  /** Proposed content (after change) */
  proposed: string
  /** Unique event id for approval routing */
  eventId: string
  /** Thread that produced this change */
  threadId: string
  /** Turn that produced this change */
  turnId: string
  /** Tool name that created this change */
  toolName: string
  /** Whether this was already approved */
  approved: boolean
}

interface VsCodeDiffDoc {
  originalUri: vscode.Uri
  modifiedUri: vscode.Uri
  changedFile: VsCodeChangedFile
}

const DIFF_SCHEME_ORIGINAL = 'opencodex-diff-original'
const DIFF_SCHEME_MODIFIED = 'opencodex-diff-modified'

export class OpenCodexDiffManager implements vscode.Disposable {
  private readonly tracked = new Map<string, VsCodeDiffDoc>()
  private disposables: vscode.Disposable[] = []

  constructor(
    private readonly getClient: () => OpenCodexVsCodeClient | null
  ) {
    // Register text document content providers for virtual diff docs
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME_ORIGINAL, {
        provideTextDocumentContent: (uri: vscode.Uri) => {
          const key = uri.path
          const doc = this.tracked.get(key)
          return doc?.changedFile.original ?? ''
        }
      })
    )
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME_MODIFIED, {
        provideTextDocumentContent: (uri: vscode.Uri) => {
          const key = uri.path
          const doc = this.tracked.get(key)
          return doc?.changedFile.proposed ?? ''
        }
      })
    )
  }

  /** Show a changed-file diff. Each call is idempotent — reopening the same
   *  file replaces the existing diff for that eventId. */
  async showDiff(cf: VsCodeChangedFile): Promise<void> {
    const baseName = cf.path.split('/').pop() ?? cf.path
    const displayPath = cf.eventId

    const originalUri = vscode.Uri.parse(
      `${DIFF_SCHEME_ORIGINAL}:${displayPath}/${baseName} (original)`
    )
    const modifiedUri = vscode.Uri.parse(
      `${DIFF_SCHEME_MODIFIED}:${displayPath}/${baseName} (proposed)`
    )

    this.tracked.set(displayPath, { originalUri, modifiedUri, changedFile: cf })

    const title = `${baseName} (OpenCodex · ${cf.toolName})`
    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      title
    )
  }

  /** Approve: route through the desktop approvals, then apply the change. */
  async approveDiff(eventId: string): Promise<void> {
    const doc = this.tracked.get(eventId)
    if (!doc) return

    const client = this.getClient()
    if (!client) {
      void vscode.window.showErrorMessage('OpenCodex: not connected')
      return
    }

    // Route through desktop approvals
    const result = await client.approveFileChange(
      doc.changedFile.threadId,
      doc.changedFile.turnId,
      eventId,
      'allow'
    )
    if (result.ok) {
      // Apply the file change to the workspace
      const workspacePath = vscode.Uri.joinPath(
        vscode.Uri.file(doc.changedFile.workspaceRoot),
        doc.changedFile.path
      )
      const encoder = new TextEncoder()
      await vscode.workspace.fs.writeFile(workspacePath, encoder.encode(doc.changedFile.proposed))
      doc.changedFile.approved = true
      void vscode.window.showInformationMessage(`Applied: ${doc.changedFile.path}`)
    } else {
      void vscode.window.showErrorMessage(`Approve failed: ${result.message}`)
    }
  }

  /** Revert: deny the change via desktop approvals. */
  async revertDiff(eventId: string): Promise<void> {
    const doc = this.tracked.get(eventId)
    if (!doc) return

    const client = this.getClient()
    if (!client) {
      void vscode.window.showErrorMessage('OpenCodex: not connected')
      return
    }

    const result = await client.approveFileChange(
      doc.changedFile.threadId,
      doc.changedFile.turnId,
      eventId,
      'deny'
    )
    if (result.ok) {
      void vscode.window.showInformationMessage(`Reverted: ${doc.changedFile.path}`)
    } else {
      void vscode.window.showErrorMessage(`Revert failed: ${result.message}`)
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.tracked.clear()
  }
}
