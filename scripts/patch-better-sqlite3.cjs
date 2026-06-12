#!/usr/bin/env node
/**
 * Apply the upstream Electron 42 V8 API compatibility patch to better-sqlite3.
 *
 * Source: https://github.com/WiseLibs/better-sqlite3/pull/1475
 * Upstream status: approved but not yet merged/released (as of 2026-06-12).
 * Remove this script once better-sqlite3 ships a release containing PR #1475.
 *
 * The patch is idempotent — it checks for the EXTERNAL_NEW guard before applying.
 */

const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const BETTER_SQLITE3_DIR = join(__dirname, '..', 'node_modules', 'better-sqlite3', 'src')

function patchFile(relativePath, oldText, newText, description) {
  const filePath = join(BETTER_SQLITE3_DIR, relativePath)
  if (!existsSync(filePath)) {
    console.warn(`[patch-better-sqlite3] File not found, skipping: ${filePath}`)
    return false
  }

  let content = readFileSync(filePath, 'utf8')

  // Idempotency check
  if (content.includes(newText)) {
    console.log(`[patch-better-sqlite3] ✓ Already patched: ${description}`)
    return true
  }

  if (!content.includes(oldText)) {
    console.warn(`[patch-better-sqlite3] ⚠ Could not find text to replace in ${relativePath}: ${description}`)
    return false
  }

  content = content.replace(oldText, newText)
  writeFileSync(filePath, content, 'utf8')
  console.log(`[patch-better-sqlite3] ✓ Patched: ${description}`)
  return true
}

let allOk = true

// 1. macros.cpp — add EXTERNAL_NEW and EXTERNAL_VALUE macros
allOk = patchFile(
  'util/macros.cpp',
  `#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value())`,
  `#if defined(NODE_MODULE_VERSION) && NODE_MODULE_VERSION >= 146
#define EXTERNAL_NEW(isolate, value) v8::External::New((isolate), (value), 0)
#define EXTERNAL_VALUE(value) (value)->Value(0)
#else
#define EXTERNAL_NEW(isolate, value) v8::External::New((isolate), (value))
#define EXTERNAL_VALUE(value) (value)->Value()
#endif
#define OnlyAddon static_cast<Addon*>(EXTERNAL_VALUE(info.Data().As<v8::External>()))`,
  'macros.cpp: EXTERNAL_NEW/VALUE macros'
) && allOk

// 2. better_sqlite3.cpp — use EXTERNAL_NEW
allOk = patchFile(
  'better_sqlite3.cpp',
  `v8::Local<v8::External> data = v8::External::New(isolate, addon);`,
  `v8::Local<v8::External> data = EXTERNAL_NEW(isolate, addon);`,
  'better_sqlite3.cpp: EXTERNAL_NEW'
) && allOk

// 3. helpers.cpp — pass nullptr instead of 0
allOk = patchFile(
  'util/helpers.cpp',
  `\t\tfunc,\n\t\t0,\n\t\tdata`,
  `\t\tfunc,\n\t\tnullptr,\n\t\tdata`,
  'helpers.cpp: nullptr for SetNativeDataProperty'
) && allOk

if (allOk) {
  console.log('[patch-better-sqlite3] All patches applied successfully')
  process.exit(0)
} else {
  console.error('[patch-better-sqlite3] Some patches failed — see warnings above')
  process.exit(1)
}
