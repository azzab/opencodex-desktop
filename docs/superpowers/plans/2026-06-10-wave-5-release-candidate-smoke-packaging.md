# Wave 5 Release Candidate Smoke And Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Wave 3-4 integration-ready tree into a release-candidate evidence pass without publishing, tagging, pushing, or weakening OpenCodex safety defaults.

**Architecture:** Wave 5 adds a repeatable local release smoke harness that boots the real built Electron main process with isolated user data, waits for renderer load, and exits with a clear status. It also reruns packaging dry-run evidence through the existing Electron Builder config and records the remaining operator-only release decisions.

**Tech Stack:** Electron main process, electron-vite build output, Node release scripts, Electron Builder 26.8.1, Vitest, OpenCodex/Kun runtime contracts.

---

### Task 1: Refresh Release Gate State

**Files:**
- Read: `/Users/mohamedazab/opencodex-desktop/docs/AGENTS.md`
- Read: `/Users/mohamedazab/opencodex-desktop/docs/WAVE_3_4_UPSTREAM_PARITY_RELEASE_PREP.md`
- Read: `/Users/mohamedazab/opencodex-desktop/docs/PHASE_10_PARITY_HARDENING_RELEASE_REPORT.md`
- Read: `/Users/mohamedazab/opencodex-desktop/package.json`
- Read: `/Users/mohamedazab/opencodex-desktop/electron-builder.config.cjs`

- [x] **Step 1: Verify checkout and latest upstream target**

Run:

```bash
git status --short
git describe --tags --always upstream/master
git rev-list --left-right --count upstream/master...upstream/develop
```

Expected: current dirty integration state is preserved; upstream target remains `v0.2.8` with `0` commits ahead on `upstream/develop`.

### Task 2: Add Repeatable Electron Release Smoke Harness

**Files:**
- Create: `/Users/mohamedazab/opencodex-desktop/src/main/release-smoke.ts`
- Create: `/Users/mohamedazab/opencodex-desktop/src/main/release-smoke.test.ts`
- Modify: `/Users/mohamedazab/opencodex-desktop/src/main/index.ts`
- Create: `/Users/mohamedazab/opencodex-desktop/scripts/release-smoke.cjs`
- Modify: `/Users/mohamedazab/opencodex-desktop/package.json`

- [x] **Step 1: Write failing release-smoke config tests**

Add tests proving:

```ts
resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE: '1' }).enabled === true
resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE_TIMEOUT_MS: '12000' }).timeoutMs === 12000
resolveReleaseSmokeConfig({ OPENCODEX_DESKTOP_RELEASE_SMOKE_USER_DATA: '/tmp/smoke' }).userDataDir === '/tmp/smoke'
```

Run:

```bash
npm test -- src/main/release-smoke.test.ts
```

Expected: fail because `src/main/release-smoke.ts` does not exist yet.

- [x] **Step 2: Implement release-smoke config helpers**

Create `src/main/release-smoke.ts` with `resolveReleaseSmokeConfig()`, `formatReleaseSmokeResult()`, and bounded timeout normalization.

- [x] **Step 3: Wire the smoke mode into Electron main**

Use `OPENCODEX_DESKTOP_RELEASE_SMOKE=1` to:

- optionally set an isolated `app.setPath('userData', OPENCODEX_DESKTOP_RELEASE_SMOKE_USER_DATA)`;
- suppress initial window display;
- exit `0` after `did-finish-load`;
- exit non-zero on preload/load/render failure or timeout;
- skip modal startup error dialogs during smoke mode.

- [x] **Step 4: Add the local smoke script and npm command**

Add `scripts/release-smoke.cjs` to launch `electron .` against built output with isolated temp user data and captured output.

Add:

```json
"smoke:release": "npm run build && node ./scripts/release-smoke.cjs"
```

Run:

```bash
npm test -- src/main/release-smoke.test.ts
```

Expected: pass.

### Task 3: Execute Wave 5 Local Release Gates

**Files:**
- Read command output.
- Modify docs only if evidence changes.

- [x] **Step 1: Run focused smoke tests**

Run:

```bash
npm test -- src/main/release-smoke.test.ts src/main/packaging-config.test.ts
```

Expected: both test files pass.

- [x] **Step 2: Run build plus Electron startup smoke**

Run:

```bash
npm run smoke:release
```

Expected: build succeeds and the release smoke script exits `0` after renderer load.

- [x] **Step 3: Run macOS package dry-run**

Run:

```bash
ELECTRON_BUILDER_CACHE="$PWD/.cache/electron-builder" npx --yes electron-builder@26.8.1 --config electron-builder.config.cjs --publish never --dir --mac --arm64
```

Expected: unsigned macOS app directory is produced without publishing.

### Task 4: Record Wave 5 Evidence And Remaining Phases

**Files:**
- Create: `/Users/mohamedazab/opencodex-desktop/docs/WAVE_5_RELEASE_CANDIDATE_SMOKE_PACKAGING.md`
- Modify: `/Users/mohamedazab/opencodex-desktop/docs/WAVE_3_4_UPSTREAM_PARITY_RELEASE_PREP.md`
- Modify: `/Users/mohamedazab/opencodex-desktop/docs/PHASE_10_PARITY_HARDENING_RELEASE_REPORT.md`

- [x] **Step 1: Record Wave 5 evidence**

Document release smoke, package dry-run, exact commands, pass/fail output, and the fact that no release/tag/push/upload happened.

- [x] **Step 2: Record any remaining phase**

If Wave 5 passes, the remaining phase is an operator decision phase: signed/notarized build, live provider smoke, Arabic release scope, and publish authorization. Do not mark it complete without those external/operator facts.

### Task 5: Final Verification And Completion Audit

**Files:**
- Read all changed files and command output.

- [x] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm --prefix kun run typecheck
npm --prefix kun test
npm run build
git diff --check
```

Expected: all commands exit `0`.

- [x] **Step 2: Audit completion**

Confirm Wave 5 evidence exists, no publish action occurred, and any remaining phase is documented as operator-only rather than silently treated as complete.
