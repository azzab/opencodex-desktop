/**
 * VS Code status bar item — shows connection, active turn, current model.
 * Thin adapter: reads config, pings health + state, updates UI.
 */
import * as vscode from 'vscode'
import type { OpenCodexVsCodeClient } from './client.js'

export class OpenCodexStatusBar {
  private item: vscode.StatusBarItem
  private updateTimer: ReturnType<typeof setInterval> | null = null
  private activeTurnLabel: string = ''
  private currentModel: string = 'auto'

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

  setActiveTurn(turnId: string): void {
    this.activeTurnLabel = turnId ? ` · Turn ${turnId.slice(0, 7)}` : ''
    this.render()
  }

  clearActiveTurn(): void {
    this.activeTurnLabel = ''
    this.render()
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

  private render(): void {
    const modelPart = this.currentModel !== 'auto' ? ` · ${this.currentModel}` : ''
    this.item.text = `${this.item.text.split(' ')[0]} OpenCodex${modelPart}${this.activeTurnLabel}`
    // Full text updated by update() below
  }

  private async update(): Promise<void> {
    const client = this.getClient()
    if (!client) {
      this.item.text = '$(circle-slash) OpenCodex'
      this.item.tooltip = 'Not configured'
      this.item.backgroundColor = undefined
      return
    }

    const healthResult = await client.health()
    if (!healthResult.ok) {
      this.item.text = '$(error) OpenCodex'
      this.item.tooltip = `Disconnected: ${healthResult.message}`
      this.item.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      )
      return
    }

    // Fetch model state for richer display
    const stateResult = await client.getModelState()
    if (stateResult.ok) {
      this.currentModel = stateResult.value.model
    }

    const modelPart = this.currentModel !== 'auto' ? ` · ${this.currentModel}` : ''
    this.item.text = `$(check) OpenCodex${modelPart}${this.activeTurnLabel}`
    this.item.tooltip = `Connected — protocol v${healthResult.value.protocolVersion}`
    this.item.backgroundColor = undefined
  }
}
