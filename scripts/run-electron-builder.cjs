#!/usr/bin/env node

const { spawnSync } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '..')
const electronBuilderCache = process.env.ELECTRON_BUILDER_CACHE || join(root, '.cache', 'electron-builder')
const electronCache = process.env.ELECTRON_CACHE || join(root, '.cache', 'electron')

mkdirSync(electronBuilderCache, { recursive: true })
mkdirSync(electronCache, { recursive: true })

const result = spawnSync(
  'npx',
  ['--yes', 'electron-builder@26.8.1', ...process.argv.slice(2)],
  {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: electronBuilderCache,
      ELECTRON_CACHE: electronCache
    },
    stdio: 'inherit'
  }
)

if (result.error) {
  console.error(`[run-electron-builder] ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
