#!/usr/bin/env node
/**
 * Apply Electron 42 V8 API compatibility patches to nan (Native Abstractions for Node.js).
 *
 * Electron 42 ships V8 14.8 where v8::External::New() and v8::External::Value()
 * require an ExternalPointerTypeTag argument. nan 2.27.0 doesn't support this yet.
 *
 * Source: https://github.com/nodejs/nan/pull/1015 (unmerged as of 2026-06-12)
 * Remove this script once nan ships a release containing PR #1015.
 *
 * The script is idempotent — checks for the presence of the helper before applying.
 */

const { readFileSync, writeFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const NAN_DIR = join(__dirname, '..', 'node_modules', 'nan')

function patchFile(relativePath, transforms, description) {
  const filePath = join(NAN_DIR, relativePath)
  if (!existsSync(filePath)) {
    console.warn(`[patch-nan] File not found, skipping: ${filePath}`)
    return false
  }

  let content = readFileSync(filePath, 'utf8')
  let changed = false

  for (const { marker, oldPattern, replacement } of transforms) {
    if (content.includes(marker)) {
      console.log(`[patch-nan] ✓ Already patched: ${description} (${marker.slice(0, 40)}...)`)
      continue
    }

    // For regex replacements
    if (oldPattern instanceof RegExp) {
      const newContent = content.replace(oldPattern, replacement)
      if (newContent !== content) {
        content = newContent
        changed = true
      }
    } else if (typeof oldPattern === 'string') {
      // For exact string replacements
      if (content.includes(oldPattern)) {
        content = content.replace(oldPattern, replacement)
        changed = true
      }
    }
  }

  if (changed) {
    writeFileSync(filePath, content, 'utf8')
    console.log(`[patch-nan] ✓ Patched: ${description}`)
  }

  return true
}

// ——— nan_implementation_12_inl.h ———
// Three v8::External::New() calls need the 3-arg form

const IMPL_12_INL = 'nan_implementation_12_inl.h'

// Helper: add NewExternal wrapper + include
patchFile(IMPL_12_INL, [
  {
    marker: 'NewExternal',
    oldPattern: '#include <node_object_wrap.h>',
    replacement: `#include <node_object_wrap.h>
#include <v8-internal.h>

namespace imp {
// Electron 42 (V8 14.8) requires ExternalPointerTypeTag on v8::External::New/Value.
// Detect via V8_EXTERNAL_POINTER_TAG_COUNT (defined in <v8-internal.h> alongside the new API).
inline v8::Local<v8::External> NewExternal(v8::Isolate* isolate, void* value) {
#ifdef V8_EXTERNAL_POINTER_TAG_COUNT
  return v8::External::New(isolate, value, v8::kExternalPointerTypeTagDefault);
#else
  return v8::External::New(isolate, value);
#endif
}
}  // namespace imp`
  }
], 'nan_implementation_12_inl.h: add NewExternal helper')

// Fix Factory<v8::External>::New — line ~79
patchFile(IMPL_12_INL, [
  {
    marker: 'imp::NewExternal',
    oldPattern: /return v8::External::New\(v8::Isolate::GetCurrent\(\), value\);/g,
    replacement: 'return imp::NewExternal(v8::Isolate::GetCurrent(), value);'
  }
], 'Factory<v8::External>::New')

// Fix Function factory — line ~95
patchFile(IMPL_12_INL, [
  {
    marker: 'NewExternal(isolate',
    oldPattern: /v8::External::New\(isolate, reinterpret_cast<void \*>\(callback\)\)\);/g,
    replacement: 'imp::NewExternal(isolate, reinterpret_cast<void *>(callback)));'
  }
], 'Factory<v8::Function>::New')

// Fix FunctionTemplate factory — line ~131
patchFile(IMPL_12_INL, [
  {
    marker: 'imp::NewExternal',
    // Same pattern as above — already matched
    oldPattern: /v8::External::New\(isolate, reinterpret_cast<void \*>\(callback\)\)\);/g,
    replacement: 'imp::NewExternal(isolate, reinterpret_cast<void *>(callback)));'
  }
], 'Factory<v8::FunctionTemplate>::New (already patched if prior match succeeded)')

// ——— nan_callbacks_12_inl.h ———
// 28 sites of .As<v8::External>()->Value()) need the tagged form

const CB_12_INL = 'nan_callbacks_12_inl.h'

// Add GetExternalValue helper
patchFile(CB_12_INL, [
  {
    marker: 'GetExternalValue',
    oldPattern: 'namespace imp {\n',
    replacement: `// Electron 42 V8 14.8 compatibility: v8::External::Value() now requires a tag.
// Gate on V8_EXTERNAL_POINTER_TAG_COUNT rather than a version cutoff.
inline void* GetExternalValue(v8::Local<v8::External> ext) {
#ifdef V8_EXTERNAL_POINTER_TAG_COUNT
  return ext->Value(v8::kExternalPointerTypeTagDefault);
#else
  return ext->Value();
#endif
}

namespace imp {
`
  }
], 'nan_callbacks_12_inl.h: add GetExternalValue helper')

// Replace all .As<v8::External>()->Value()) patterns
patchFile(CB_12_INL, [
  {
    marker: 'Nan::GetExternalValue',  // fully-qualified in the next patch
    oldPattern: /\)\.As<v8::External>\(\)->Value\(\)\)/g,
    replacement: ').As<v8::External>()), imp::GetExternalValue('
  },
  {
    marker: 'imp::GetExternalValue',
    // Fix the pattern: reinterpret_cast<intptr_t>(obj->GetInternalField(...)
    //   .As<v8::Value>().As<v8::External>()->Value()))
    // We need to wrap: reinterpret_cast<intptr_t>(imp::GetExternalValue(obj->GetInternalField(...)
    //   .As<v8::Value>().As<v8::External>()))
    oldPattern: /(reinterpret_cast<intptr_t>\()\s*((?:obj|ext|target)->[^;]+?)\.As<v8::External>\(\)\),\s*imp::GetExternalValue\(/g,
    replacement: '$1imp::GetExternalValue($2.As<v8::External>()))',
  }
], 'nan_callbacks_12_inl.h: fix Value() calls')

// ——— nan_callbacks_pre_12_inl.h ———
// Add trivial GetExternalValue wrapper

const CB_PRE_12 = 'nan_callbacks_pre_12_inl.h'
patchFile(CB_PRE_12, [
  {
    marker: 'GetExternalValue',
    oldPattern: 'namespace imp {\n',
    replacement: `// Electron 42 V8 14.8 compatibility: v8::External::Value() now requires a tag.
// Gate on V8_EXTERNAL_POINTER_TAG_COUNT rather than a version cutoff.
inline void* GetExternalValue(v8::Local<v8::External> ext) {
#ifdef V8_EXTERNAL_POINTER_TAG_COUNT
  return ext->Value(v8::kExternalPointerTypeTagDefault);
#else
  return ext->Value();
#endif
}

namespace imp {
`
  }
], 'nan_callbacks_pre_12_inl.h: add GetExternalValue helper')

console.log('[patch-nan] Done')
process.exit(0)
