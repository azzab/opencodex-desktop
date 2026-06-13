#!/usr/bin/env node

const { spawnSync } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '..')
const electronBuilderCache = process.env.ELECTRON_BUILDER_CACHE || join(root, '.cache', 'electron-builder')
const electronCache = process.env.ELECTRON_CACHE || join(root, '.cache', 'electron')

mkdirSync(electronBuilderCache, { recursive: true })
mkdirSync(electronCache, { recursive: true })

// Step 1: Targeted Electron-ABI rebuild for better-sqlite3 + node-pty only.
// npmRebuild is disabled in electron-builder.config.cjs because it would
// also attempt cpu-features (dep of ssh2), whose nan 2.27.0 dependency is
// not yet compatible with Electron 42's V8 14.8 ExternalPointerTypeTag API.
console.log('[run-electron-builder] Step 1/3: Electron-ABI rebuild')
const rebuildResult = spawnSync(
  'node',
  [join(__dirname, 'electron-rebuild-native.cjs'), 'electron'],
  { cwd: root, stdio: 'inherit' }
)
if (rebuildResult.status !== 0) {
  console.error('[run-electron-builder] Electron-ABI rebuild failed')
  process.exit(rebuildResult.status || 1)
}

// Step 2: Run electron-builder
// On Windows, npx is a .cmd batch file which spawnSync cannot execute
// directly (EINVAL).  Use shell:true on win32 so cmd.exe handles it.
const isWin = process.platform === 'win32'
const result = spawnSync(
  isWin ? 'npx.cmd' : 'npx',
  ['--yes', 'electron-builder@26.8.1', ...process.argv.slice(2)],
  {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: electronBuilderCache,
      ELECTRON_CACHE: electronCache
    },
    stdio: 'inherit',
    shell: isWin
  }
)

const buildStatus = result.status ?? 1

// Step 3: Restore system-Node ABI for the source tree
console.log('[run-electron-builder] Step 3/3: Restoring Node ABI')
spawnSync(
  'node',
  [join(__dirname, 'electron-rebuild-native.cjs'), 'node'],
  { cwd: root, stdio: 'inherit' }
)

// Restore the better-sqlite3 patch (npm rebuild may revert it)
const patchScript = join(__dirname, 'patch-better-sqlite3.cjs')
spawnSync('node', [patchScript], { cwd: root, stdio: 'inherit' })

if (result.error) {
  console.error(`[run-electron-builder] ${result.error.message}`)
  process.exit(1)
}

process.exit(buildStatus)
