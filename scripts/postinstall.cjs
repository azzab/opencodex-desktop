const { spawnSync } = require('node:child_process')

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  })
}

// Apply upstream Electron 42 V8 compatibility patch to better-sqlite3.
// Remove once better-sqlite3 ships a release containing PR #1475.
try {
  const { join } = require('node:path')
  run('node', [join(__dirname, 'patch-better-sqlite3.cjs')])
} catch (error) {
  console.warn('[postinstall] better-sqlite3 patch skipped:', error.message)
}

require('./ensure-kun-install.cjs')

const buildKun = run('npm', ['--prefix', 'kun', 'run', 'build'])
if (buildKun.status !== 0) {
  process.exit(buildKun.status || 1)
}

// Dual-ABI native modules (better-sqlite3 + node-pty): install Electron-ABI
// prebuilds so Kun (spawned via ELECTRON_RUN_AS_NODE) and the terminal panel
// can load native addons at dev time. Best-effort — if prebuilds are
// unavailable Kun falls back to JSONL scanning and node-pty gracefully
// degrades. System-Node ABI is restored via `ensure-electron-native.cjs node`
// after packaging or whenever tests need the source tree.
try {
  const { join } = require('node:path')
  run('node', [join(__dirname, 'ensure-electron-native.cjs'), 'electron'])
} catch (error) {
  console.warn('[postinstall] electron-native setup skipped:', error.message)
}
