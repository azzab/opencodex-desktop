/**
 * VS Code status bar item — shows connection + active turn state.
 * Thin adapter: reads config, pings health, updates UI.
 */
import * as vscode from 'vscode'
import { OpenCodexVsCodeClient } from './client.js'

export class OpenCodexStatusBar {
  private item: vscode.StatusBarItem
  private updateTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly getClient: () => OpenCodexVsCodeClient | null) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    )
    this.item.name = 'OpenCodex'
    this.item.command = 'opencodex.health'
    this.item.text = '$(sync~spin) OpenCodex'
    this.item.tooltip = 'Checking OpenCodex server...'
    this.item.show()
  }

  startPolling(intervalMs = 15_000): void {
    this.updateTimer = setInterval(() => {
      void this.update()
    }, intervalMs)
    void this.update()
  }

  dispose(): void {
    if (this.updateTimer) clearInterval(this.updateTimer)
    this.item.dispose()
  }

  private async update(): Promise<void> {
    const client = this.getClient()
    if (!client) {
      this.item.text = '$(circle-slash) OpenCodex'
      this.item.tooltip = 'Not configured'
      this.item.backgroundColor = undefined
      return
    }

    const result = await client.health()
    if (result.ok) {
      this.item.text = '$(check) OpenCodex'
      this.item.tooltip = `Connected — protocol v${result.value.protocolVersion}`
      this.item.backgroundColor = undefined
    } else {
      this.item.text = '$(error) OpenCodex'
      this.item.tooltip = `Disconnected: ${result.message}`
      this.item.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      )
    }
  }
}
