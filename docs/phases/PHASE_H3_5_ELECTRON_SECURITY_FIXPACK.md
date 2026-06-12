# Phase H3.5: Electron 42 Security Fixpack

## Window And Model
- Primary: pi · `deepseek-v4-pro` · `--max` · session `oc-h3-5-electron` · worktree `../ocx-h3-5`
- Authorized fallback after recorded 42.4.0 failure: pi · `deepseek-v4-pro` · `--max` · session `oc-h3-5-electron39` · worktree `../ocx-h3-5-39`
- Sequential, single lane (Wave 1.5). Blocks Wave 2 dispatch until merged gate-green.

## Goal
Clear the high Electron security advisory blocking Wave 2. Operator decision
(2026-06-12): upgrade `electron` 34.5.8 → **42.4.0** (npm's listed fix and the
current supported major). Fallback to `39.8.10` is permitted **only** if the
42.4.0 gate cannot be made green after the foundation doc's recovery rules,
with the blocking reason recorded in the ledger. After H3.5, full `npm audit`
exits 0 and the packaged app is proven on the new runtime. If the authorized
fallback is executed, substitute **39.8.10** for 42.4.0 in the implementation
target and packaged-version proof; all other security, native-module, dev boot,
Kun, PTY, clean-room, and audit gates remain unchanged.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/phases/OC_BUILD_LOG.md` — Decisions entries on the Electron blocker (advisory range `<=39.8.4`; sandbox results: 38.8.6 dirty, 39.8.5/39.8.10/42.4.0 clean)
3. Electron breaking-changes notes for majors 35→42 (https://www.electronjs.org/docs/latest/breaking-changes)
4. `electron-builder.config.cjs`, `electron.vite.config.ts`, `src/main/index.ts`, preload bridge
5. `docs/phases/PHASE_H3_TERMINAL_PANEL.md` stop gates (node-pty is a native module — ABI rebuild required)

## Scope
- Primary path: bump `electron` devDependency to `42.4.0`; update `electron-vite`,
  `electron-builder`, and `@electron/*` tooling **only as far as required** for
  42 compatibility (minimal-diff rule; every bump justified in the report).
- Fallback path, only after the ledger records 42.4.0 recovery failure: bump
  `electron` devDependency to exactly `39.8.10`; update related Electron
  tooling only as far as required for 39.8.10 compatibility (minimal-diff rule;
  every bump justified in the report).
- Fix breaking API changes across main process, preload, and IPC (session,
  BrowserWindow, utilityProcess/child process spawning for Kun, protocol/
  webPreferences defaults). Preserve existing sandbox, contextIsolation, and
  ASAR settings — security posture may only tighten, never loosen.
- Rebuild native modules (`node-pty`) for the new ABI; verify the postinstall/
  rebuild path works from a clean `npm install`.
- Verify managed Kun child process startup, terminal PTY sessions, and SSE
  streaming still work on the targeted Electron runtime.

## Out Of Scope
- Any feature work, dependency upgrades not required by Electron 42, or
  renderer refactors.
- Signing/notarization (operator-only, deferred to v0.3.0 lane).

## Verification
```bash
npm run typecheck && npm run lint && npm test
npm --prefix kun run typecheck && npm --prefix kun run test
npm run build
npm audit            # FULL audit must exit 0 (not just --omit=dev)
npm run smoke:release
npm run dist:mac:arm64:dmg
git diff --check
```

## Stop Gates
- Full `npm audit` exits 0.
- `npm run dev` manual boot smoke: window opens, Kun starts, one turn completes.
- H3 terminal stop-gate rerun on the new ABI: user PTY spawn/output/reap proof with real `node-pty`; no orphan processes.
- H2 usage pane and mounted `TerminalPanel`/`UsagePanel` tests still green.
- DMG dry-run artifact contains the targeted Electron framework: 42.x on the
  primary path, or exactly 39.8.10 on the authorized fallback path (verify
  version in the packaged app's `Electron Framework`/`version` metadata).
- Clean-room proof: fresh `npm ci` (or rm -rf node_modules + install) → full gate green.

## Git Commit Message
`chore(security): upgrade Electron to 42.4.0, rebuild native modules, and clear high audit advisory`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_H3_5_ELECTRON_SECURITY_FIXPACK.md. Upgrade electron from 34.5.8 to exactly 42.4.0, updating electron-vite/electron-builder/@electron tooling only as far as 42 compatibility requires (justify each bump). Fix main/preload/IPC breaking changes without loosening sandbox/contextIsolation/ASAR posture; rebuild node-pty for the new ABI from a clean install; verify Kun child startup, PTY sessions, and SSE streaming. Run the full verification block including FULL npm audit (must exit 0), smoke:release, and dist:mac:arm64:dmg; nonzero exits are failures. Do NOT fall back to 39.8.10 yourself — if 42.4.0 cannot go green, stop and report why. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, every dependency bump with its reason, breaking changes handled, test results, packaged Electron version proof, and gaps.

## Fallback Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md, docs/phases/OC_BUILD_LOG.md, and docs/phases/PHASE_H3_5_ELECTRON_SECURITY_FIXPACK.md. The ledger records that the 42.4.0 primary path failed the dev/Kun/SSE stop gate after recovery, so execute the authorized fallback: upgrade electron from 34.5.8 to exactly 39.8.10, updating electron-vite/electron-builder/@electron tooling only as far as 39.8.10 compatibility requires (justify each bump). Fix main/preload/IPC breaking changes without loosening sandbox/contextIsolation/ASAR posture; rebuild node-pty for the new ABI from a clean install; verify Kun child startup, PTY sessions, and SSE streaming. Run the full verification block including FULL npm audit (must exit 0), smoke:release, and dist:mac:arm64:dmg; nonzero exits are failures. Do NOT upgrade to 42.4.0 or choose any other fallback. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, every dependency bump with its reason, breaking changes handled, test results, packaged Electron 39.8.10 version proof, and gaps.
