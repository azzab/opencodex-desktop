# READY_FOR_ORCHESTRATOR_REVIEW — M1 Electron 42.4.0

**Branch:** `phase/m1-electron42`
**Date:** 2026-06-12
**Status:** ✅ All M1 stop gates pass. DMG built, native modules rebuilt for ABI 146, sandbox/contextIsolation/ASAR preserved.

---

## 1. What Changed — Electron 39.8.10 → 42.4.0

Three upstream releases skipped (40, 41, 42). Electron 42 ships V8 14.8 which requires an
`ExternalPointerTypeTag` argument on `v8::External::New()` / `v8::External::Value()`. Two unmerged
upstream PRs are backported as local patches:

| Patch | Source | Status (2026-06-12) | Scope |
|---|---|---|---|
| better-sqlite3 PR #1475 | WiseLibs/better-sqlite3 | Approved, not yet released | 3 files: `macros.cpp`, `better_sqlite3.cpp`, `helpers.cpp` |
| nan PR #1015 | nodejs/nan | Open, not yet merged | 3 files: `nan_callbacks_12_inl.h`, `nan_implementation_12_inl.h`, `nan_callbacks_pre_12_inl.h` |

---

## 2. Files Changed (5 modified + 4 new)

### Modified

| File | Delta | Reason |
|---|---|---|
| `package.json` | 1 line | `electron` 39.8.10 → 42.4.0 |
| `package-lock.json` | 691 lines (net -541) | Lockfile refresh for Electron 42 + cascade |
| `electron-builder.config.cjs` | +4 lines | `npmRebuild: true` → `false` — targeted rebuild avoids cpu-features/nan V8 incompatibility |
| `scripts/postinstall.cjs` | +33/-26 | Apply better-sqlite3 V8 patch + dual-ABI native module setup (was single-module) |
| `scripts/run-electron-builder.cjs` | +33/-0 | New 3-step: (1) Electron-ABI rebuild → (2) electron-builder → (3) restore Node ABI |

### New (untracked)

| File | Purpose |
|---|---|
| `scripts/electron-rebuild-native.cjs` | Targeted rebuild: only better-sqlite3 + node-pty via `@electron/rebuild`, skipping cpu-features (nan 2.27.0) |
| `scripts/ensure-electron-native.cjs` | Dual-ABI manager: install Electron prebuilds at dev time, restore Node ABI after packaging |
| `scripts/patch-better-sqlite3.cjs` | Idempotent source patch for V8 14.8 `ExternalPointerTypeTag` in better-sqlite3 (PR #1475) |
| `scripts/patch-nan.cjs` | Idempotent source patch for nan 2.27.0 V8 14.8 compatibility (PR #1015) |

### Not changed (preserved)

| Area | File(s) | Value |
|---|---|---|
| Sandbox/security | `src/main/index.ts` L300-302, L707-708 | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` |
| ASAR | `electron-builder.config.cjs` | `asar: true` (unchanged) |
| asarUnpack | `electron-builder.config.cjs` | better-sqlite3, node-pty, bindings, file-uri-to-path, kun/**/* |
| entitlements | `electron-builder.config.cjs` | `hardenedRuntime`, `forceCodeSigning` gated on signing identity |

---

## 3. DMG/Artifact Verification

| Check | Result |
|---|---|
| DMG path | `dist/OpenCodex-Desktop-0.3.0-rc-mac-arm64.dmg` |
| DMG size | 170 MB (zlib compressed) |
| .app bundle | `dist/mac-arm64/OpenCodex Desktop.app/` |
| Electron Framework version | **42.4.0** (`CFBundleVersion` in `Electron Framework.framework/Resources/Info.plist`) |
| App version | 0.3.0-rc (`CFBundleShortVersionString`) |
| Bundle ID | `app.opencodex.desktop` |
| ASAR integrity hash | SHA256 `bc514ec33cbc612f538b7108b9afc762214e3365d957b79cc49184363b8e6119` |
| ASAR size | 148.7 MB |
| better-sqlite3 ABI | `darwin-arm64-146` (Electron 42 V8 ABI) ✅ |
| node-pty ABI | `darwin-arm64-146` (Electron 42 V8 ABI) ✅ |
| Preload location | Inside ASAR at `/out/preload/index.cjs` ✅ |
| NSSupportsAutomaticGraphicsSwitching | `true` ✅ |

---

## 4. Stop Gates — All Pass

### 4.1 Typecheck & Lint

| Command | Result |
|---|---|
| `npm run typecheck` | ✅ Pass |
| `npm run lint` | ✅ 0 errors, 7 pre-existing warnings |
| `npm --prefix kun run typecheck` | ✅ Pass |

### 4.2 Tests

| Command | Result |
|---|---|
| `npm test` | ✅ 150 files, **1184 tests pass** |
| `npm --prefix kun test` | ✅ 58 passed, 1 skipped (59 files), **658 tests pass**, 4 skipped |

### 4.3 Build

| Command | Result |
|---|---|
| `npm run build` | ✅ Pass (kun tsc + electron-vite SSR + renderer) |

### 4.4 npm Audit

| Command | Result |
|---|---|
| `npm audit --audit-level=info` | ✅ **0 vulnerabilities**, exit 0 |

### 4.5 Release Smoke

| Command | Result |
|---|---|
| `npm run smoke:release` | ✅ Pass — renderer loaded, startup sequence clean (67ms to `app.whenReady`, 375ms to `createWindow:returned`, 458ms to `did-finish-load`, `[release-smoke-script] passed`) |

### 4.6 Kun Smoke

| Command | Result |
|---|---|
| `node ./scripts/kun-smoke.cjs` | ✅ ALL CHECKS PASSED — health check, thread created (`thr_9fwtil79`), turn accepted (202 JSON), 3 SSE events received with smoke marker, Kun process reaped |

### 4.7 PTY

| Command | Result |
|---|---|
| `node -e "require('node-pty').spawn('echo', ['PTY_OK'], ...)"` | ✅ Output: `PTY_OK`, spawn/output/reap all work |

### 4.8 Clean-Room Install Gate

| Step | Result |
|---|---|
| `npm ci` (fresh tree, no node_modules) | ✅ 916 packages installed |
| postinstall patches | ✅ better-sqlite3 3 patches applied, Kun built |
| electron-native prebuilds | ⚠ No Electron 42 prebuilds exist on npm (expected) — fallback paths activated |
| `npm audit` (clean-room) | ✅ 0 vulnerabilities |
| `npm run typecheck` (clean-room) | ✅ Pass |
| `npm test` (clean-room) | ✅ 150 files, 1184 tests pass |
| `npm --prefix kun run typecheck` (clean-room) | ✅ Pass |
| `npm --prefix kun test` (clean-room) | ✅ 58 passed, 658 tests pass |

---

## 5. Architecture: How the 3-Step Rebuild Works

```
Build flow (run-electron-builder.cjs):

STEP 1: Electron-ABI rebuild
  electron-rebuild-native.cjs electron
    ├─ patch-better-sqlite3.cjs  (idempotent V8 14.8 source patch)
    ├─ npx @electron/rebuild --only better-sqlite3,node-pty --version 42.4.0
    └─ Output: better_sqlite3.node + pty.node built for ABI 146

STEP 2: electron-builder package
  npx electron-builder@26.8.1 --config electron-builder.config.cjs
  (npmRebuild: false — uses the ABI 146 modules from Step 1)

STEP 3: Restore Node ABI
  electron-rebuild-native.cjs node
    ├─ npm rebuild better-sqlite3 node-pty (restores system Node ABI)
    └─ patch-better-sqlite3.cjs (re-applied after rebuild)
```

Dev-time flow (postinstall.cjs):

```
npm install / npm ci → postinstall.cjs
  ├─ patch-better-sqlite3.cjs (V8 14.8 source patch)
  ├─ ensure-kun-install.cjs (npm --prefix kun ci if missing)
  ├─ npm --prefix kun run build (tsc)
  └─ ensure-electron-native.cjs electron (best-effort prebuild-install)
```

---

## 6. Why `cpu-features` (nan/ssh2) Is Skipped

| What | Why |
|---|---|
| `cpu-features` | Optional dep of `ssh2` (optional dep of opencodex). Depends on `nan` 2.27.0. |
| `nan` 2.27.0 | Calls `v8::External::New()` / `Value()` without `ExternalPointerTypeTag` — crashes on V8 14.8 (Electron 42). |
| PR #1015 exists | But unmerged. Our `patch-nan.cjs` adds conditional helpers gated on `V8_EXTERNAL_POINTER_TAG_COUNT`. |
| However | `cpu-features` source patch is fragile (autotools layer). If `npmRebuild: true`, electron-builder would try to rebuild it and fail. |
| Solution | `npmRebuild: false` + targeted rebuild of only `better-sqlite3` + `node-pty` via `@electron/rebuild --only`. |
| Impact | None — `ssh2` is optional, `cpu-features` is a performance hint for SSH key generation, not needed at runtime. |

---

## 7. Gaps & Notes

| Gap | Severity | Notes |
|---|---|---|
| No Electron 42 prebuilds on npm | Low | better-sqlite3 and node-pty don't ship `darwin-arm64-146` prebuilds yet. The `@electron/rebuild` (Step 1) compiles from source. Dev-time best-effort `prebuild-install` gracefully degrades to JSONL fallback for Kun. |
| nan patch is not exercised at runtime | Info | `patch-nan.cjs` is available but not applied during `npm ci`/postinstall (only applied if `cpu-features` rebuild is needed). The patched nan files are present in node_modules from the last manual application. If `npm rebuild cpu-features` is run, it will need the nan patch. |
| better-sqlite3 patch is upstream-approved | Info | PR #1475 is approved but not yet in a release. Remove `patch-better-sqlite3.cjs` and the postinstall hook once better-sqlite3 ships a release containing it (likely 12.11.0 or 13.0.0). |
| package-lock.json has `lockfileVersion: 3` | Info | Compatible with npm ≥7. CI must use npm ci (not npm install without lockfile). |

---

## 8. Verification Commands (Reproducible)

```bash
# Quick sanity (non-destructive)
npm run typecheck && npm run lint && npm test && npm audit --audit-level=info

# Kun
npm --prefix kun run typecheck && npm --prefix kun test

# Build + smoke
npm run build && npm run smoke:release

# Kun smoke (standalone)
node ./scripts/kun-smoke.cjs

# PTY
node -e "const p=require('node-pty').spawn('echo',['PTY_OK'],{name:'xterm-256color',cols:80,rows:24}); p.onData(d=>{console.log(d.trim()); p.kill(); process.exit(d.trim()==='PTY_OK'?0:1)})"

# DMG build (needs working tree prepped — runs Step 1+2+3 above)
npm run dist:mac:arm64:dmg

# Verify packaged Electron version
plutil -extract CFBundleVersion raw \
  "dist/mac-arm64/OpenCodex Desktop.app/Contents/Frameworks/Electron Framework.framework/Resources/Info.plist"
# → 42.4.0

# Verify ABI
ls "dist/mac-arm64/OpenCodex Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/bin/"
# → darwin-arm64-146

# Clean-room install gate (full)
cd $(mktemp -d) && rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' \
  --exclude='out' --exclude='.cache' --exclude='release' /path/to/ocx-m1/ . && \
  npm ci && npm run typecheck && npm test && \
  npm --prefix kun run typecheck && npm --prefix kun test
```

---

## 9. Tree State

```
phase/m1-electron42 (dirty)

Modified (5):
  electron-builder.config.cjs      (+4 lines: npmRebuild false + comment)
  package-lock.json                (-541 net: Electron 42 cascade)
  package.json                     (+1/-1: electron 39.8.10 → 42.4.0)
  scripts/postinstall.cjs          (+33/-26: V8 patch + dual-ABI setup)
  scripts/run-electron-builder.cjs (+33/-0: 3-step rebuild flow)

New untracked (4):
  scripts/electron-rebuild-native.cjs
  scripts/ensure-electron-native.cjs
  scripts/patch-better-sqlite3.cjs
  scripts/patch-nan.cjs

Built artifacts (present):
  dist/OpenCodex-Desktop-0.3.0-rc-mac-arm64.dmg       170 MB
  dist/OpenCodex-Desktop-0.3.0-rc-mac-arm64.dmg.blockmap  182 KB
  dist/mac-arm64/OpenCodex Desktop.app/                  (full bundle)
  dist/builder-debug.yml                                  (arm64 build log)
  dist/rc-mac.yml                                         (release metadata)
```
