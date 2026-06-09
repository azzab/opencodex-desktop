import type { AppBehaviorConfigV1 } from '../shared/app-settings'

export function shouldSyncLoginItemSettings(platform: NodeJS.Platform, isPackaged: boolean): boolean {
  if (platform === 'win32') return true
  if (platform === 'darwin') return isPackaged
  return false
}

export function buildLoginItemSettings(
  platform: NodeJS.Platform,
  behavior: AppBehaviorConfigV1,
  hiddenStartArg: string
): { openAtLogin: boolean; args: string[] } {
  return {
    openAtLogin: behavior.openAtLogin,
    args:
      platform === 'win32' && behavior.openAtLogin && behavior.startMinimized
        ? [hiddenStartArg]
        : []
  }
}
