#!/usr/bin/env node
/**
 * Dual-ABI native-module manager for better-sqlite3 and node-pty.
 *
 * Modes:
 *   electron  Install Electron-ABI prebuilds so ELECTRON_RUN_AS_NODE works.
 *             Best-effort: if prebuilds are unavailable the JS fallback
 *             (JSONL scanning in Kun, graceful degrade in PTY) still works.
 *   node      Restore system-Node ABI via npm rebuild.
 *
 * Usage:
 *   node scripts/ensure-electron-native.cjs electron
 *   node scripts/ensure-electron-native.cjs node
 */

const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')

const NATIVE_PACKAGES = [
  { name: 'better-sqlite3', dir: join(ROOT, 'node_modules', 'better-sqlite3') },
  { name: 'node-pty', dir: join(ROOT, 'node_modules', 'node-pty') }
]

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  })
}

function getElectronVersion() {
  try {
    return require('electron/package.json').version
  } catch {
    console.error('[ensure-electron-native] electron is not installed; cannot determine target version')
    process.exit(1)
  }
}

function installElectronPrebuilds() {
  const electronVersion = getElectronVersion()
  console.log(`[ensure-electron-native] Installing Electron-ABI prebuilds for Electron ${electronVersion}`)

  let allOk = true
  for (const pkg of NATIVE_PACKAGES) {
    if (!existsSync(pkg.dir)) {
      console.warn(`[ensure-electron-native] ${pkg.name} not found at ${pkg.dir}; skipping`)
      continue
    }
    console.log(`[ensure-electron-native] → ${pkg.name} (electron ${electronVersion})`)
    const result = run('npx', [
      '--yes',
      'prebuild-install',
      '--runtime=electron',
      `--target=${electronVersion}`
    ], { cwd: pkg.dir })

    if (result.status !== 0) {
      console.warn(`[ensure-electron-native] ⚠ ${pkg.name} Electron prebuild failed (status ${result.status}); fallback will apply`)
      allOk = false
    } else {
      console.log(`[ensure-electron-native] ✓ ${pkg.name} Electron prebuild installed`)
    }
  }

  if (!allOk) {
    console.warn('[ensure-electron-native] Some Electron prebuilds are unavailable — app fallback paths will activate')
  }

  return allOk
}

function restoreNodeAbi() {
  console.log('[ensure-electron-native] Restoring system-Node ABI via npm rebuild')

  let allOk = true
  for (const pkg of NATIVE_PACKAGES) {
    if (!existsSync(pkg.dir)) {
      console.warn(`[ensure-electron-native] ${pkg.name} not found at ${pkg.dir}; skipping`)
      continue
    }
    console.log(`[ensure-electron-native] → npm rebuild ${pkg.name}`)
    const result = run('npm', ['rebuild', pkg.name], { cwd: ROOT })

    if (result.status !== 0) {
      console.warn(`[ensure-electron-native] ⚠ ${pkg.name} Node ABI rebuild failed (status ${result.status})`)
      allOk = false
    } else {
      console.log(`[ensure-electron-native] ✓ ${pkg.name} Node ABI restored`)
    }
  }

  return allOk
}

const mode = process.argv[2]

if (mode === 'electron') {
  const ok = installElectronPrebuilds()
  process.exit(ok ? 0 : 0) // always exit 0 — best-effort
} else if (mode === 'node') {
  const ok = restoreNodeAbi()
  process.exit(ok ? 0 : 0) // always exit 0 — best-effort
} else {
  console.error('[ensure-electron-native] Usage: node ensure-electron-native.cjs <electron|node>')
  process.exit(1)
}
