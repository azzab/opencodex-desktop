export const DEFAULT_RELEASE_SMOKE_TIMEOUT_MS = 15_000
const MIN_RELEASE_SMOKE_TIMEOUT_MS = 1_000
const MAX_RELEASE_SMOKE_TIMEOUT_MS = 60_000

export type ReleaseSmokeConfig = {
  enabled: boolean
  timeoutMs: number
  userDataDir: string
}

export type ReleaseSmokeResult = {
  ok: boolean
  stage: string
  message?: string
}

type ReleaseSmokeEnvKey =
  | 'OPENCODEX_DESKTOP_RELEASE_SMOKE'
  | 'OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS'
  | 'OPENCODEX_DESKTOP_RELEASE_SMOKE_USER_DATA'

type ReleaseSmokeEnv = Partial<Record<ReleaseSmokeEnvKey, string | undefined>>
type ReleaseSmokeTimer = ReturnType<typeof setTimeout> | { unref?: () => void }

export type ReleaseSmokeControllerDeps = {
  setTimeout: (handler: () => void, timeoutMs: number) => ReleaseSmokeTimer
  clearTimeout: (timer: ReleaseSmokeTimer) => void
  logInfo: (line: string) => void
  logError: (line: string) => void
  exit: (code: number) => void
}

export type ReleaseSmokeController = {
  enabled: boolean
  startTimeout: () => void
  finish: (result: ReleaseSmokeResult) => void
}

function normalizeTimeoutMs(raw: string | undefined): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_RELEASE_SMOKE_TIMEOUT_MS
  return Math.max(MIN_RELEASE_SMOKE_TIMEOUT_MS, Math.min(MAX_RELEASE_SMOKE_TIMEOUT_MS, parsed))
}

export function resolveReleaseSmokeConfig(
  env: ReleaseSmokeEnv = process.env as ReleaseSmokeEnv
): ReleaseSmokeConfig {
  return {
    enabled: env.OPENCODEX_DESKTOP_RELEASE_SMOKE === '1',
    timeoutMs: normalizeTimeoutMs(env.OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS),
    userDataDir: env.OPENCODEX_DESKTOP_RELEASE_SMOKE_USER_DATA?.trim() ?? ''
  }
}

export function formatReleaseSmokeResult(result: ReleaseSmokeResult): string {
  const status = result.ok ? 'ok' : 'fail'
  const message = result.message?.trim()
  return `[release-smoke] ${status} ${result.stage}${message ? ` ${message}` : ''}`
}

export function createReleaseSmokeController(
  config: ReleaseSmokeConfig,
  deps: ReleaseSmokeControllerDeps = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
    logInfo: console.info,
    logError: console.error,
    exit: process.exit
  }
): ReleaseSmokeController {
  let completed = false
  let timeout: ReleaseSmokeTimer | null = null

  const finish = (result: ReleaseSmokeResult): void => {
    if (!config.enabled || completed) return
    completed = true
    if (timeout) {
      deps.clearTimeout(timeout)
      timeout = null
    }
    const line = formatReleaseSmokeResult(result)
    if (result.ok) {
      deps.logInfo(line)
      deps.exit(0)
      return
    }
    deps.logError(line)
    deps.exit(1)
  }

  return {
    enabled: config.enabled,
    startTimeout: () => {
      if (!config.enabled || completed || timeout) return
      timeout = deps.setTimeout(
        () => finish({
          ok: false,
          stage: 'timeout',
          message: `Timed out after ${config.timeoutMs}ms`
        }),
        config.timeoutMs
      )
      timeout.unref?.()
    },
    finish
  }
}
