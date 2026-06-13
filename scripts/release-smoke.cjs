#!/usr/bin/env node

const { spawn } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '..')
const electron = require('electron')

function parseTimeoutMs(raw) {
  const value = Number.parseInt(String(raw || ''), 10)
  if (!Number.isFinite(value)) return 20_000
  return Math.max(1_000, Math.min(60_000, value))
}

const timeoutMs = parseTimeoutMs(process.env.OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS)
const providedUserData = (process.env.OPENCODEX_DESKTOP_RELEASE_SMOKE_USER_DATA || '').trim()
const userDataDir = providedUserData || mkdtempSync(join(tmpdir(), 'opencodex-release-smoke-'))
let cleaned = false

function cleanup() {
  if (cleaned || providedUserData) return
  cleaned = true
  rmSync(userDataDir, { recursive: true, force: true })
}

const electronArgs = ['.']
if (process.platform === 'linux') {
  // GitHub Actions runners can't set SUID on chrome-sandbox without root.
  electronArgs.unshift('--no-sandbox')
}

const child = spawn(electron, electronArgs, {
  cwd: root,
  env: {
    ...process.env,
    OPENCODEX_DESKTOP_RELEASE_SMOKE: '1',
    OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS: String(timeoutMs),
    OPENCODEX_DESKTOP_RELEASE_SMOKE_USER_DATA: userDataDir,
    DEEPSEEK_GUI_STARTUP_TRACE: process.env.DEEPSEEK_GUI_STARTUP_TRACE || '1',
    ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING || '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})

let output = ''

function append(chunk, stream) {
  const text = String(chunk)
  output += text
  stream.write(text)
}

child.stdout.on('data', (chunk) => append(chunk, process.stdout))
child.stderr.on('data', (chunk) => append(chunk, process.stderr))

const timeout = setTimeout(() => {
  child.kill('SIGTERM')
  setTimeout(() => child.kill('SIGKILL'), 2_000).unref()
}, timeoutMs + 2_000)
timeout.unref()

child.on('error', (error) => {
  clearTimeout(timeout)
  cleanup()
  console.error(`[release-smoke-script] failed to launch Electron: ${error.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  clearTimeout(timeout)
  cleanup()
  if (code !== 0) {
    console.error(`[release-smoke-script] Electron exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`)
    process.exit(code || 1)
  }
  if (!output.includes('[release-smoke] ok renderer_loaded')) {
    console.error('[release-smoke-script] Missing successful renderer smoke marker.')
    process.exit(1)
  }
  console.log('[release-smoke-script] passed')
})
