import { describe, expect, it, vi } from 'vitest'
import {
  createReleaseSmokeController,
  DEFAULT_RELEASE_SMOKE_TIMEOUT_MS,
  formatReleaseSmokeResult,
  resolveReleaseSmokeConfig
} from './release-smoke'

describe('release smoke config', () => {
  it('enables smoke mode only for the explicit release smoke flag', () => {
    expect(resolveReleaseSmokeConfig({}).enabled).toBe(false)
    expect(resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE: '0' }).enabled).toBe(false)
    expect(resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE: '1' }).enabled).toBe(true)
  })

  it('normalizes timeout and isolated user-data settings', () => {
    expect(resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS: '12000' })).toMatchObject({
      timeoutMs: 12_000
    })
    expect(resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS: 'nope' })).toMatchObject({
      timeoutMs: DEFAULT_RELEASE_SMOKE_TIMEOUT_MS
    })
    expect(resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS: '20' })).toMatchObject({
      timeoutMs: 1_000
    })
    expect(resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS: '999999' })).toMatchObject({
      timeoutMs: 60_000
    })
    expect(resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE_USER_DATA: ' /tmp/opencodex-smoke ' })).toMatchObject({
      userDataDir: '/tmp/opencodex-smoke'
    })
  })

  it('formats machine-readable smoke results for script assertions', () => {
    expect(formatReleaseSmokeResult({ ok: true, stage: 'renderer_loaded' })).toBe(
      '[release-smoke] ok renderer_loaded'
    )
    expect(formatReleaseSmokeResult({ ok: false, stage: 'timeout', message: 'Renderer did not load' })).toBe(
      '[release-smoke] fail timeout Renderer did not load'
    )
  })
})

describe('release smoke controller', () => {
  it('logs a single success result and exits zero', () => {
    const logInfo = vi.fn()
    const logError = vi.fn()
    const exit = vi.fn()
    const clearTimeout = vi.fn()
    const controller = createReleaseSmokeController(
      { enabled: true, timeoutMs: 1000, userDataDir: '' },
      {
        setTimeout: vi.fn(() => ({ unref: vi.fn() })),
        clearTimeout,
        logInfo,
        logError,
        exit
      }
    )

    controller.startTimeout()
    controller.finish({ ok: true, stage: 'renderer_loaded' })
    controller.finish({ ok: false, stage: 'late_failure' })

    expect(logInfo).toHaveBeenCalledWith('[release-smoke] ok renderer_loaded')
    expect(logError).not.toHaveBeenCalled()
    expect(clearTimeout).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('turns timeout into a failure exit', () => {
    const logInfo = vi.fn()
    const logError = vi.fn()
    const exit = vi.fn()
    let timeoutHandler: (() => void) | undefined
    const controller = createReleaseSmokeController(
      { enabled: true, timeoutMs: 1500, userDataDir: '' },
      {
        setTimeout: vi.fn((handler) => {
          timeoutHandler = handler
          return { unref: vi.fn() }
        }),
        clearTimeout: vi.fn(),
        logInfo,
        logError,
        exit
      }
    )

    controller.startTimeout()
    timeoutHandler?.()

    expect(logInfo).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalledWith('[release-smoke] fail timeout Timed out after 1500ms')
    expect(exit).toHaveBeenCalledWith(1)
  })
})
