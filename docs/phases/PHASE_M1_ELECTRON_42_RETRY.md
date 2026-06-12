# Phase M1: Electron 42 Retry (Root-Cause-First)

## Window And Model
- pi · `deepseek-v4-pro` · `--max` · session `oc-m1-electron42` · worktree `../ocx-m1`

## Goal
Land Electron 42.x (latest 42 patch at execution time). The H3.5 attempt
FAILED ONLY on its own Kun/SSE smoke gate: 11/12 gates passed on 42.4.0, and
the evidence (turn POST → 202 + JSON ack, zero events on that response)
indicates the smoke script asserted SSE on the wrong endpoint — Kun streams
events on a separate SSE subscription, not the turn-create response. The
merged 39.8.10 lane verified streaming correctly and passed. So: fix the
verification first, then re-apply the 42 upgrade.

## Read First
1. `docs/phases/_OC_HARNESS_FOUNDATION.md`
2. `docs/phases/OC_BUILD_LOG.md` — H3.5 entries + the `oc-h3-5-electron` BLOCKED report (11/12 gates table, SSE evidence)
3. The merged 39.8.10 lane's Kun/SSE verification method (git log for H3.5 merge `29ae887`)
4. `kun/src/cli/serve.ts` + Kun SSE event subscription contract (confirm the real streaming endpoint)
5. `scripts/postinstall.cjs`, `scripts/ensure-electron-native.cjs` (dual-ABI rebuild approach from the failed lane is sound — reuse it)

## Scope
- Step 1: write/port a CORRECT Kun/SSE smoke that subscribes to the real SSE
  events endpoint, then prove it green on current main (Electron 39.8.10).
- Step 2: bump `electron` to latest 42.x; reuse the H3.5 lane's dual-ABI
  rebuild scripts (better-sqlite3 + node-pty for Electron ABI; system-Node ABI
  restored for the source tree); minimal tooling bumps, each justified.
- Step 3: full gate + the corrected smoke on 42; DMG dry-run with packaged
  Electron 42 version proof; clean-room install gate.

## Out Of Scope
- Feature work; Electron 43+ unless 42.x has an open advisory at execution time (then use npm's listed fix version and record it).

## Verification
Full Definition-of-Done gate (foundation doc) plus:
```bash
npm audit                      # FULL audit exit 0
node ./scripts/kun-smoke.cjs   # corrected SSE smoke: >=1 real SSE event + completed turn
npm run smoke:release
npm run dist:mac:arm64:dmg
```

## Stop Gates
- Corrected SSE smoke passes on main BEFORE the bump (proves the test, isolates the variable).
- Same smoke + full gate green on Electron 42.x.
- Packaged DMG contains Electron 42.x (version metadata proof).
- PTY spawn/output/reap proof on the new ABI; no orphans; clean-room `npm ci` gate green.

## Git Commit Message
`chore(security): retry and land Electron 42.x with corrected Kun SSE smoke and dual-ABI rebuild`

## Short Launcher Prompt
Read docs/phases/_OC_HARNESS_FOUNDATION.md and docs/phases/PHASE_M1_ELECTRON_42_RETRY.md. First fix the Kun/SSE smoke to subscribe to Kun's real SSE events endpoint (the H3.5 42.4.0 failure was the smoke asserting SSE on the turn-create response, which correctly returns 202+JSON ack) and prove it green on current main BEFORE touching Electron. Then upgrade electron to the latest 42.x reusing the dual-ABI rebuild approach (better-sqlite3 + node-pty), minimal justified tooling bumps, no loosening of sandbox/contextIsolation/ASAR. Run the full gate, FULL npm audit (exit 0), corrected smoke, smoke:release, dist:mac:arm64:dmg with packaged Electron 42 version proof, PTY reap proof, and a clean-room install gate. Nonzero exits are failures. End with READY_FOR_ORCHESTRATOR_REVIEW listing changed files, smoke-before/after evidence, every bump with reason, tests + results, and gaps.
