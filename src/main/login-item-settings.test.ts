import { describe, expect, it } from 'vitest'
import { buildLoginItemSettings, shouldSyncLoginItemSettings } from './login-item-settings'

describe('login item settings helpers', () => {
  it('skips login item sync for unpackaged macOS dev builds', () => {
    expect(shouldSyncLoginItemSettings('darwin', false)).toBe(false)
    expect(shouldSyncLoginItemSettings('darwin', true)).toBe(true)
  })

  it('keeps Windows login item sync available in dev and packaged builds', () => {
    expect(shouldSyncLoginItemSettings('win32', false)).toBe(true)
    expect(shouldSyncLoginItemSettings('win32', true)).toBe(true)
  })

  it('uses the hidden start argument only for Windows minimized startup', () => {
    expect(buildLoginItemSettings('win32', {
      openAtLogin: true,
      startMinimized: true,
      closeToTray: false
    }, '--hidden')).toEqual({
      openAtLogin: true,
      args: ['--hidden']
    })

    expect(buildLoginItemSettings('darwin', {
      openAtLogin: true,
      startMinimized: true,
      closeToTray: false
    }, '--hidden')).toEqual({
      openAtLogin: true,
      args: []
    })
  })
})
