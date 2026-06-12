#!/usr/bin/env node
/**
 * Targeted Electron-ABI rebuild for specific native modules.
 *
 * Runs @electron/rebuild with --only to rebuild just better-sqlite3 and
 * node-pty, avoiding cpu-features (which depends on nan 2.27.0, not yet
 * compatible with Electron 42's V8 14.8 ExternalPointerTypeTag API).
 *
 * Usage:
 *   node scripts/electron-rebuild-native.cjs electron
 *   node scripts/electron-rebuild-native.cjs node
 */

const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: ROOT,
    ...options
  })
}

function getElectronVersion() {
  try {
    return require('electron/package.json').version
  } catch {
    console.error('[electron-rebuild-native] electron is not installed')
    process.exit(1)
  }
}

function rebuildForElectron() {
  const electronVersion = getElectronVersion()
  console.log(`[electron-rebuild-native] Rebuilding better-sqlite3 + node-pty for Electron ${electronVersion}`)

  // First apply the better-sqlite3 V8 compatibility patch
  const patchScript = join(__dirname, 'patch-better-sqlite3.cjs')
  if (existsSync(patchScript)) {
    const patchResult = run('node', [patchScript])
    if (patchResult.status !== 0) {
      console.error('[electron-rebuild-native] better-sqlite3 patch failed')
      process.exit(1)
    }
  }

  // Run targeted electron-rebuild for only the modules we need
  const result = run('npx', [
    '--yes',
    '@electron/rebuild',
    '--only', 'better-sqlite3,node-pty',
    '--version', electronVersion,
    '--arch', process.arch
  ])

  if (result.status !== 0) {
    console.error('[electron-rebuild-native] Electron rebuild failed')
    process.exit(result.status || 1)
  }

  console.log('[electron-rebuild-native] ✓ Electron-ABI rebuild complete')
}

function restoreNodeAbi() {
  console.log('[electron-rebuild-native] Restoring system-Node ABI')

  // npm rebuild the two modules against system Node
  const result = run('npm', ['rebuild', 'better-sqlite3', 'node-pty'])

  if (result.status !== 0) {
    console.warn('[electron-rebuild-native] ⚠ Node ABI restore had warnings (status %d)', result.status)
  }

  // Re-apply the better-sqlite3 patch (rebuild may have reverted it)
  const patchScript = join(__dirname, 'patch-better-sqlite3.cjs')
  if (existsSync(patchScript)) {
    run('node', [patchScript])
  }

  console.log('[electron-rebuild-native] ✓ Node ABI restored')
}

const mode = process.argv[2]

if (mode === 'electron') {
  rebuildForElectron()
} else if (mode === 'node') {
  restoreNodeAbi()
} else {
  console.error('[electron-rebuild-native] Usage: node electron-rebuild-native.cjs <electron|node>')
  process.exit(1)
}
